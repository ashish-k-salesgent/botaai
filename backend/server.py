"""BotAAI - AI Customer Support & Ticket Management SaaS - FastAPI backend."""
import asyncio
import csv
import io
import json
import os
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, File, Form, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.middleware.cors import CORSMiddleware

from auth import (
    bearer,
    create_token,
    decode_token_safe,
    get_current_user,
    hash_password,
    require_super_admin,
    require_tenant,
    require_perm,
    verify_password,
)
from database import (
    Bot,
    ChatMessage,
    ChatSession,
    KBChunk,
    KBDoc,
    Notification,
    SessionLocal,
    Space,
    Tenant,
    Ticket,
    User,
    backfill_spaces,
    repair_legacy_overdue_status,
    get_session,
    init_db,
)
from models import (
    BotInput,
    BotOut,
    ChatMessageIn,
    ChatMessageOut,
    ChatSessionOut,
    KBDocCreate,
    KBDocOut,
    LoginInput,
    NotificationOut,
    AdminTenantCreate,
    SignupInput,
    SpaceCreate,
    TenantModules,
    TenantOut,
    TenantUpdate,
    WorkflowColumnsUpdate,
    TicketCreate,
    TicketOut,
    TicketUpdate,
    UserCreate,
    UserOut,
    _gen_id,
    _utc_now_iso,
)
from rag import answer_with_rag, chunk_text, classify_message, embed_vector, search_chunks_pg
import store
from file_storage import save_upload, serve_download
from ticket_helpers import (
    CUSTOMER_SPACE_SLUG,
    is_overdue,
    parse_due,
    today_iso,
    week_end_iso,
    due_in_range,
    is_completed,
    qa_handoff_warning,
    ticket_matches_search,
    ticket_search_sql_conditions,
)
from workflow import (
    migrate_removed_statuses,
    normalize_workflow_columns,
    qa_status_ids,
    slugify_column_id,
    validate_workflow_update,
    workflow_status_ids,
)
from ws_hub import hub

ROOT_DIR = Path(__file__).parent
EMBED_DIR = ROOT_DIR.parent / "embed-demo"
load_dotenv(ROOT_DIR / ".env")


async def ensure_tenant_module(session: AsyncSession, tenant_id: str, module: str) -> Tenant:
    t = await store.get_tenant_by_id(session, tenant_id)
    if not t:
        raise HTTPException(404, "Tenant not found")
    store.assert_tenant_module(t, module)
    return t


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9-]+", "-", name.lower()).strip("-") or _gen_id()[:6]


async def _get_chat_session_row(db: AsyncSession, session_id: str) -> Optional[ChatSession]:
    return (
        await db.execute(select(ChatSession).where(ChatSession.id == session_id))
    ).scalar_one_or_none()


async def _mark_agent_read(
    db: AsyncSession, cs: ChatSession, user_id: str, tenant_id: str
) -> None:
    reads = dict(cs.agent_reads or {})
    reads[user_id] = _utc_now_iso()
    await db.execute(
        update(ChatSession)
        .where(ChatSession.id == cs.id)
        .values(agent_reads=reads, unread=0)
    )
    await db.commit()
    await emit_session_update(db, cs.id, tenant_id)


async def emit_session_update(db: AsyncSession, session_id: str, tenant_id: str) -> None:
    cs = await _get_chat_session_row(db, session_id)
    if not cs:
        return
    agent_name = None
    if cs.agent_id:
        agent = await store.get_user_by_id(db, cs.agent_id)
        agent_name = agent.name if agent else None
    payload = {"type": "session", "data": store.chat_session_out(cs, agent_name)}
    await hub.broadcast_chat(session_id, payload)
    await hub.broadcast_tenant(tenant_id, payload)


async def emit_chat_messages(
    db: AsyncSession, session_id: str, tenant_id: str, *msg_outs: dict
) -> None:
    for msg in msg_outs:
        if msg:
            await hub.broadcast_chat(session_id, {"type": "message", "data": msg})
    await emit_session_update(db, session_id, tenant_id)


async def _resolve_upload_actor(
    session: AsyncSession,
    creds,
    client_id: Optional[str],
    session_id: Optional[str],
) -> tuple[str, str, str]:
    """Returns tenant_id, uploaded_by name, source tag."""
    if creds and creds.credentials:
        payload = decode_token_safe(creds.credentials)
        if payload and payload.get("tenant_id"):
            user_doc = await store.get_user_by_id(session, payload["sub"])
            return (
                payload["tenant_id"],
                user_doc.name if user_doc else "Agent",
                "admin",
            )
    if client_id and session_id:
        t = await store.get_tenant_by_client_id(session, client_id)
        if not t:
            raise HTTPException(404, "Unknown client")
        t = await store.sync_trial_expiry(session, t)
        store.assert_tenant_access(t)
        cs = await _get_chat_session_row(session, session_id)
        if not cs or cs.tenant_id != t.id:
            raise HTTPException(404, "Session not found")
        return t.id, cs.visitor_name or "Visitor", "widget"
    raise HTTPException(401, "Login required, or provide client_id + session_id")


app = FastAPI(title="BotAAI API")
api = APIRouter(prefix="/api")


@app.get("/widget.js")
async def serve_widget_js():
    path = EMBED_DIR / "widget.js"
    if not path.exists():
        raise HTTPException(404, "widget.js not found")
    return FileResponse(path, media_type="application/javascript")


@api.get("/")
async def root():
    return {"service": "BotAAI", "status": "online"}


@api.post("/uploads")
async def upload_file_unified(
    file: UploadFile = File(...),
    client_id: Optional[str] = Form(None),
    session_id: Optional[str] = Form(None),
    creds=Depends(bearer),
    session: AsyncSession = Depends(get_session),
):
    """Single upload endpoint for admin (JWT) and widget (client_id + session_id)."""
    tenant_id, uploaded_by, source = await _resolve_upload_actor(
        session, creds, client_id, session_id
    )
    attachment = await save_upload(file, tenant_id, uploaded_by, source=source)
    return attachment


@api.get("/files/download")
async def download_file(
    id: str = Query(...),
    key: str = Query(...),
    exp: int = Query(...),
    sig: str = Query(...),
):
    """Signed file download — works for local disk and private S3 (no CloudFront needed)."""
    return await serve_download(id, key, exp, sig)


# ====================== AUTH ======================
@api.post("/auth/signup")
async def signup(payload: SignupInput, session: AsyncSession = Depends(get_session)):
    if await store.get_user_by_email(session, payload.email):
        raise HTTPException(400, "Email already registered")

    tenant_id = _gen_id()
    slug = slugify(payload.company_name)
    if await store.get_tenant_by_slug(session, slug):
        slug = f"{slug}-{_gen_id()[:4]}"
    now = _utc_now_iso()
    trial_end = (datetime.now(timezone.utc) + timedelta(days=14)).isoformat()

    tenant = Tenant(
        id=tenant_id,
        name=payload.company_name,
        slug=slug,
        client_id=f"botaai_{_gen_id()[:12]}",
        client_secret=_gen_id().replace("-", ""),
        status="trial",
        plan="trial",
        max_spaces=1,
        trial_ends_at=trial_end,
        created_at=now,
        branding={
            "primary_color": "#002FA7",
            "logo_url": None,
            "greeting": f"Welcome to {payload.company_name}! 👋",
        },
        modules=store.normalize_modules(store.DEFAULT_MODULES),
    )
    session.add(tenant)

    user_id = _gen_id()
    user = User(
        id=user_id,
        email=payload.email,
        name=payload.name,
        password_hash=hash_password(payload.password),
        role="admin",
        tenant_id=tenant_id,
        active=True,
        created_at=now,
    )
    session.add(user)

    await store.provision_tenant_products(session, tenant_id, payload.company_name, tenant.modules, now)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(400, "Email already registered")

    token = create_token(user_id, "admin", tenant_id)
    cfg = store.tenant_permission_config(tenant)
    return {
        "token": token,
        "user": store.user_out(user, cfg),
        "tenant": store.tenant_out(tenant),
    }


@api.post("/auth/login")
async def login(payload: LoginInput, session: AsyncSession = Depends(get_session)):
    user = await store.get_user_by_email(session, payload.email)
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Invalid credentials")
    if not user.active:
        raise HTTPException(403, "Account disabled")
    token = create_token(user.id, user.role, user.tenant_id)
    tenant = None
    if user.tenant_id:
        t = await store.get_tenant_by_id(session, user.tenant_id)
        if t:
            t = await store.sync_trial_expiry(session, t)
            store.assert_tenant_access(t)
        tenant = store.tenant_out(t) if t else None
        cfg = store.tenant_permission_config(t)
    else:
        cfg = None
    return {
        "token": token,
        "user": store.user_out(user, cfg),
        "tenant": tenant,
    }


@api.get("/auth/me")
async def me(u=Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    user = await store.get_user_by_id(session, u["user_id"])
    if not user:
        raise HTTPException(404, "User not found")
    if not user.active:
        raise HTTPException(403, "Account disabled")
    tenant = None
    if user.tenant_id:
        t = await store.get_tenant_by_id(session, user.tenant_id)
        if t:
            t = await store.sync_trial_expiry(session, t)
            store.assert_tenant_access(t)
        tenant = store.tenant_out(t) if t else None
        cfg = store.tenant_permission_config(t)
    else:
        cfg = None
    return {"user": store.user_out(user, cfg), "tenant": tenant}


# ====================== TENANT ======================
@api.get("/tenant")
async def get_my_tenant(u=Depends(require_perm("settings.view")), session: AsyncSession = Depends(get_session)):
    t = await store.get_tenant_by_id(session, u["tenant_id"])
    if not t:
        raise HTTPException(404, "Tenant not found")
    return store.tenant_out(t)


@api.patch("/tenant")
async def patch_my_tenant(
    body: TenantUpdate, u=Depends(require_perm("settings.edit")), session: AsyncSession = Depends(get_session)
):
    changes = {k: v for k, v in body.model_dump(exclude_none=True).items() if k in ("name", "branding")}
    if not changes:
        return {"ok": True}
    await session.execute(
        update(Tenant).where(Tenant.id == u["tenant_id"]).values(**changes)
    )
    await session.commit()
    t = await store.get_tenant_by_id(session, u["tenant_id"])
    return store.tenant_out(t)


async def _tenant_workflow(session: AsyncSession, tenant_id: str):
    t = await store.get_tenant_by_id(session, tenant_id)
    return store.tenant_workflow_columns(t)


# ====================== WORKFLOW COLUMNS ======================
@api.get("/workflow/columns")
async def get_workflow_columns(
    u=Depends(require_perm("tickets.view")), session: AsyncSession = Depends(get_session)
):
    await ensure_tenant_module(session, u["tenant_id"], "boards")
    cols = await _tenant_workflow(session, u["tenant_id"])
    return {"columns": cols}


@api.put("/workflow/columns")
async def update_workflow_columns(
    body: WorkflowColumnsUpdate,
    u=Depends(require_perm("settings.edit")),
    session: AsyncSession = Depends(get_session),
):
    await ensure_tenant_module(session, u["tenant_id"], "boards")
    tenant = await store.get_tenant_by_id(session, u["tenant_id"])
    current = store.tenant_workflow_columns(tenant)
    proposed = [c.model_dump() for c in body.columns]
    new_cols = validate_workflow_update(current, proposed)
    removed = workflow_status_ids(current) - workflow_status_ids(new_cols)
    if removed:
        fallback = migrate_removed_statuses(removed, new_cols)
        for rid in removed:
            await session.execute(
                update(Ticket)
                .where(Ticket.tenant_id == u["tenant_id"], Ticket.status == rid)
                .values(status=fallback)
            )
    await session.execute(
        update(Tenant).where(Tenant.id == u["tenant_id"]).values(workflow_columns=new_cols)
    )
    await session.commit()
    return {"columns": new_cols}


class WorkflowColumnCreate(BaseModel):
    label: str


@api.post("/workflow/columns")
async def add_workflow_column(
    body: WorkflowColumnCreate,
    u=Depends(require_perm("settings.edit")),
    session: AsyncSession = Depends(get_session),
):
    await ensure_tenant_module(session, u["tenant_id"], "boards")
    label = body.label.strip()
    if not label:
        raise HTTPException(400, "Column label is required")
    tenant = await store.get_tenant_by_id(session, u["tenant_id"])
    current = store.tenant_workflow_columns(tenant)
    base_id = slugify_column_id(label)
    cid = base_id
    n = 2
    existing = {c["id"] for c in current}
    while cid in existing:
        cid = f"{base_id}_{n}"
        n += 1
    new_col = {"id": cid, "label": label, "locked": False, "order": len(current)}
    updated = validate_workflow_update(current, current + [new_col])
    await session.execute(
        update(Tenant).where(Tenant.id == u["tenant_id"]).values(workflow_columns=updated)
    )
    await session.commit()
    return {"columns": updated}


# ====================== BOTS ======================
@api.get("/bots")
async def list_bots(u=Depends(require_perm("bots.view")), session: AsyncSession = Depends(get_session)):
    await ensure_tenant_module(session, u["tenant_id"], "bot")
    rows = (
        await session.execute(select(Bot).where(Bot.tenant_id == u["tenant_id"]).limit(100))
    ).scalars().all()
    return [store.bot_out(b) for b in rows]


@api.post("/bots")
async def create_bot(
    body: BotInput, u=Depends(require_perm("bots.edit")), session: AsyncSession = Depends(get_session)
):
    await ensure_tenant_module(session, u["tenant_id"], "bot")
    now = _utc_now_iso()
    bot = Bot(
        id=_gen_id(),
        tenant_id=u["tenant_id"],
        created_at=now,
        **body.model_dump(),
    )
    session.add(bot)
    await session.commit()
    await session.refresh(bot)
    return store.bot_out(bot)


@api.patch("/bots/{bot_id}")
async def update_bot(
    bot_id: str,
    body: BotInput,
    u=Depends(require_perm("bots.edit")),
    session: AsyncSession = Depends(get_session),
):
    await session.execute(
        update(Bot)
        .where(Bot.id == bot_id, Bot.tenant_id == u["tenant_id"])
        .values(**body.model_dump())
    )
    await session.commit()
    b = (
        await session.execute(
            select(Bot).where(Bot.id == bot_id, Bot.tenant_id == u["tenant_id"])
        )
    ).scalar_one_or_none()
    return store.bot_out(b)


@api.delete("/bots/{bot_id}")
async def delete_bot(
    bot_id: str, u=Depends(require_perm("bots.edit")), session: AsyncSession = Depends(get_session)
):
    await session.execute(
        delete(Bot).where(Bot.id == bot_id, Bot.tenant_id == u["tenant_id"])
    )
    await session.commit()
    return {"ok": True}


# ====================== KNOWLEDGE BASE ======================
@api.get("/knowledge")
async def list_kb(u=Depends(require_perm("knowledge.view")), session: AsyncSession = Depends(get_session)):
    await ensure_tenant_module(session, u["tenant_id"], "bot")
    rows = (
        await session.execute(
            select(KBDoc)
            .where(KBDoc.tenant_id == u["tenant_id"])
            .order_by(KBDoc.created_at.desc())
            .limit(500)
        )
    ).scalars().all()
    return [store.kb_doc_out(d) for d in rows]


@api.post("/knowledge")
async def add_kb(
    body: KBDocCreate, u=Depends(require_perm("knowledge.edit")), session: AsyncSession = Depends(get_session)
):
    doc_id = _gen_id()
    now = _utc_now_iso()
    chunks = chunk_text(body.content)

    chunk_docs = []
    for i, c in enumerate(chunks):
        vec = await embed_vector(c)
        chunk_docs.append(
            KBChunk(
                id=_gen_id(),
                doc_id=doc_id,
                tenant_id=u["tenant_id"],
                bot_id=body.bot_id,
                index=i,
                text=c,
                title=body.title,
                embedding=vec,
                created_at=now,
            )
        )
    for ch in chunk_docs:
        session.add(ch)

    doc = KBDoc(
        id=doc_id,
        tenant_id=u["tenant_id"],
        bot_id=body.bot_id,
        title=body.title,
        source_type=body.source_type,
        status="ready",
        chunk_count=len(chunk_docs),
        content_preview=body.content[:240],
        created_at=now,
    )
    session.add(doc)
    await session.commit()
    return store.kb_doc_out(doc)


@api.delete("/knowledge/{doc_id}")
async def delete_kb(
    doc_id: str, u=Depends(require_perm("knowledge.delete")), session: AsyncSession = Depends(get_session)
):
    await session.execute(
        delete(KBDoc).where(KBDoc.id == doc_id, KBDoc.tenant_id == u["tenant_id"])
    )
    await session.execute(
        delete(KBChunk).where(KBChunk.doc_id == doc_id, KBChunk.tenant_id == u["tenant_id"])
    )
    await session.commit()
    return {"ok": True}


class KBSearchInput(BaseModel):
    query: str
    top_k: int = 4


@api.post("/knowledge/search")
async def search_kb(
    body: KBSearchInput, u=Depends(require_perm("knowledge.view")), session: AsyncSession = Depends(get_session)
):
    return await search_chunks_pg(session, u["tenant_id"], body.query, top_k=body.top_k)


# ====================== TICKETS ======================
async def _resolve_assignees(
    session: AsyncSession, tenant_id: str, assignees: list
) -> list:
    resolved = []
    seen = set()
    for item in assignees or []:
        uid = item if isinstance(item, str) else (item.get("id") if isinstance(item, dict) else None)
        if not uid or uid in seen:
            continue
        user = await store.get_user_by_id(session, uid)
        if user and user.tenant_id == tenant_id:
            resolved.append({"id": user.id, "name": user.name})
            seen.add(uid)
    return resolved


async def _resolve_blocked_by(
    session: AsyncSession,
    tenant_id: str,
    blocked_by: Optional[dict],
    ticket_id: str,
) -> Optional[dict]:
    if blocked_by is None:
        return None
    if not blocked_by:
        return None
    bb_type = blocked_by.get("type")
    note = (blocked_by.get("note") or "").strip()
    if bb_type == "ticket":
        tid = blocked_by.get("ticket_id")
        if not tid or tid == ticket_id:
            raise HTTPException(400, "Invalid blocked-by ticket")
        other = (
            await session.execute(
                select(Ticket).where(Ticket.id == tid, Ticket.tenant_id == tenant_id)
            )
        ).scalar_one_or_none()
        if not other:
            raise HTTPException(404, "Blocked-by ticket not found")
        return {"type": "ticket", "ticket_id": other.id, "code": other.code, "note": note}
    if bb_type == "user":
        uid = blocked_by.get("user_id")
        if not uid:
            raise HTTPException(400, "Blocked-by user required")
        user = await store.get_user_by_id(session, uid)
        if not user or user.tenant_id != tenant_id:
            raise HTTPException(404, "Blocked-by user not found")
        return {"type": "user", "user_id": user.id, "name": user.name, "note": note}
    raise HTTPException(400, "blocked_by.type must be ticket or user")


def _assignee_label(items: list) -> str:
    if not items:
        return "Unassigned"
    return ", ".join(a.get("name") or "?" for a in items)


def _ticket_assignees(t: Ticket) -> list:
    if t.assignees:
        return t.assignees
    if t.assignee_id:
        return [{"id": t.assignee_id, "name": t.assignee_name or "?"}]
    return []


def _describe_ticket_changes(t: Ticket, updates: dict) -> list[str]:
    lines: list[str] = []
    if "status" in updates and updates["status"] != t.status:
        lines.append(
            f"Status changed from {t.status.replace('_', ' ')} to {updates['status'].replace('_', ' ')}"
        )
    if "priority" in updates and updates["priority"] != t.priority:
        lines.append(f"Priority changed from {t.priority} to {updates['priority']}")
    if "category" in updates and updates["category"] != t.category:
        lines.append(f"Category changed from {t.category} to {updates['category']}")
    if "title" in updates and updates["title"] != t.title:
        lines.append("Title updated")
    if "description" in updates and updates["description"] != t.description:
        lines.append("Description updated")
    if "assignees" in updates:
        old = _assignee_label(_ticket_assignees(t))
        new = _assignee_label(updates["assignees"])
        if old != new:
            lines.append(f"Assignees: {old} → {new}")
    if "tags" in updates:
        old_tags = set(t.tags or [])
        new_tags = set(updates["tags"] or [])
        added = sorted(new_tags - old_tags)
        removed = sorted(old_tags - new_tags)
        if added:
            lines.append(f"Added tags: {', '.join(added)}")
        if removed:
            lines.append(f"Removed tags: {', '.join(removed)}")
    if "blocked_by" in updates:
        old_bb = t.blocked_by
        new_bb = updates["blocked_by"]
        if not new_bb and old_bb:
            lines.append("Blocker removed")
        elif new_bb:
            if new_bb.get("type") == "ticket":
                label = f"ticket {new_bb.get('code', '?')}"
            else:
                label = new_bb.get("name") or "team member"
            if not old_bb:
                lines.append(f"Marked as blocked by {label}")
            elif old_bb != new_bb:
                lines.append(f"Blocker updated to {label}")
            note = (new_bb.get("note") or "").strip()
            if note and (not old_bb or note != (old_bb.get("note") or "").strip()):
                lines.append(f"Block note: {note}")
    if "attachments" in updates:
        old_ids = {a.get("id") for a in (t.attachments or []) if a.get("id")}
        new_atts = updates["attachments"] or []
        new_ids = {a.get("id") for a in new_atts if a.get("id")}
        for a in new_atts:
            if a.get("id") and a["id"] not in old_ids:
                lines.append(f"Added attachment: {a.get('name', 'file')}")
        for a in t.attachments or []:
            if a.get("id") and a["id"] not in new_ids:
                lines.append(f"Removed attachment: {a.get('name', 'file')}")
    if "qa_scenarios" in updates:
        old_map = {s.get("id"): s for s in (t.qa_scenarios or []) if s.get("id")}
        new_list = updates["qa_scenarios"] or []
        new_map = {s.get("id"): s for s in new_list if s.get("id")}
        for sid, s in new_map.items():
            if sid not in old_map:
                lines.append(f"QA scenario added: {s.get('title', 'Untitled')}")
            elif s.get("completed") and not old_map[sid].get("completed"):
                who = s.get("completed_by_name") or "someone"
                lines.append(f"QA passed: {s.get('title', 'Untitled')} · {who}")
            elif not s.get("completed") and old_map[sid].get("completed"):
                lines.append(f"QA reopened: {s.get('title', 'Untitled')}")
        for sid, s in old_map.items():
            if sid not in new_map:
                lines.append(f"QA scenario removed: {s.get('title', 'Untitled')}")
    return lines


def _normalize_qa_scenarios(
    new_list: list,
    old_list: list,
    user_doc,
    now: str,
) -> list:
    old_by_id = {s.get("id"): s for s in (old_list or []) if s.get("id")}
    result = []
    for raw in new_list or []:
        if not (raw.get("title") or "").strip():
            continue
        sid = raw.get("id") or _gen_id()
        old = old_by_id.get(sid, {})
        completed = bool(raw.get("completed"))
        was_completed = bool(old.get("completed"))
        entry = {
            "id": sid,
            "title": str(raw.get("title", "")).strip(),
            "steps": str(raw.get("steps") or "").strip(),
            "expected": str(raw.get("expected") or "").strip(),
            "completed": completed,
            "created_at": old.get("created_at") or now,
            "created_by": old.get("created_by") or (user_doc.name if user_doc else "system"),
        }
        if completed:
            if not was_completed and user_doc:
                entry["completed_by_id"] = user_doc.id
                entry["completed_by_name"] = user_doc.name
                entry["completed_at"] = now
            else:
                entry["completed_by_id"] = old.get("completed_by_id")
                entry["completed_by_name"] = old.get("completed_by_name")
                entry["completed_at"] = old.get("completed_at")
        else:
            entry["completed_by_id"] = None
            entry["completed_by_name"] = None
            entry["completed_at"] = None
        result.append(entry)
    return result


async def _validate_parent_ticket(
    session: AsyncSession,
    tenant_id: str,
    parent_id: Optional[str],
    ticket_id: Optional[str] = None,
) -> Ticket:
    if not parent_id:
        raise HTTPException(400, "parent_id required")
    if ticket_id and parent_id == ticket_id:
        raise HTTPException(400, "Ticket cannot be its own parent")
    parent = (
        await session.execute(
            select(Ticket).where(Ticket.id == parent_id, Ticket.tenant_id == tenant_id)
        )
    ).scalar_one_or_none()
    if not parent:
        raise HTTPException(404, "Parent ticket not found")
    if getattr(parent, "parent_id", None):
        raise HTTPException(400, "Parent ticket is already a child — only one level allowed")
    return parent


async def _resolve_ticket_space_id(
    session: AsyncSession, tenant_id: str, space_id: Optional[str] = None
) -> Optional[str]:
    if space_id:
        sp = (
            await session.execute(
                select(Space).where(Space.id == space_id, Space.tenant_id == tenant_id)
            )
        ).scalar_one_or_none()
        if not sp:
            raise HTTPException(404, "Space not found")
        return space_id
    default = await store.get_default_space(session, tenant_id)
    return default.id if default else None


async def _ensure_space_access(
    session: AsyncSession, tenant_id: str, space_id: Optional[str]
) -> None:
    if space_id and not await store.is_space_allowed(session, tenant_id, space_id):
        raise HTTPException(
            403,
            "This space is not available on your current plan. Contact your admin to upgrade.",
        )


async def _ensure_ticket_space_access(
    session: AsyncSession, tenant_id: str, ticket: Ticket
) -> None:
    await _ensure_space_access(session, tenant_id, ticket.space_id)


@api.get("/tickets")
async def list_tickets(
    u=Depends(require_perm("tickets.view")),
    space_id: Optional[str] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    category: Optional[str] = None,
    assignee_id: Optional[str] = None,
    tag: Optional[str] = None,
    blocked: Optional[str] = None,
    overdue: Optional[str] = None,
    due: Optional[str] = None,
    q: Optional[str] = None,
    include_children: bool = False,
    session: AsyncSession = Depends(get_session),
):
    mode, allowed = await store.resolve_ticket_spaces(session, u["tenant_id"])
    allowed_ids = [s.id for s in allowed]
    if space_id:
        await _ensure_space_access(session, u["tenant_id"], space_id)
    search = (q or "").strip().lower()
    stmt = select(Ticket).where(Ticket.tenant_id == u["tenant_id"])
    if space_id:
        stmt = stmt.where(Ticket.space_id == space_id)
    elif allowed_ids:
        stmt = stmt.where(Ticket.space_id.in_(allowed_ids))
    if status:
        stmt = stmt.where(Ticket.status == status)
    if priority:
        stmt = stmt.where(Ticket.priority == priority)
    if category:
        stmt = stmt.where(Ticket.category == category)
    stmt = stmt.order_by(Ticket.created_at.desc()).limit(2000)
    rows = list((await session.execute(stmt)).scalars().all())
    if assignee_id == "unassigned":
        rows = [
            t
            for t in rows
            if not t.assignee_id and not (t.assignees or [])
        ]
    elif assignee_id:
        rows = [
            t
            for t in rows
            if t.assignee_id == assignee_id
            or any(a.get("id") == assignee_id for a in (t.assignees or []))
        ]
    if tag:
        rows = [t for t in rows if tag in (t.tags or [])]
    if blocked == "yes":
        rows = [t for t in rows if t.blocked_by]
    elif blocked == "no":
        rows = [t for t in rows if not t.blocked_by]
    if overdue == "yes":
        rows = [t for t in rows if is_overdue(t)]
    elif overdue == "no":
        rows = [t for t in rows if not is_overdue(t)]
    if due == "today":
        today = today_iso()
        rows = [t for t in rows if parse_due(t.due_date) == today and not is_completed(t.status)]
    elif due == "week":
        rows = [
            t for t in rows
            if due_in_range(t.due_date, today_iso(), week_end_iso()) and not is_completed(t.status)
        ]
    if search:
        rows = [t for t in rows if ticket_matches_search(t, search)]
    if not include_children and not search:
        rows = [t for t in rows if not getattr(t, "parent_id", None)]
    return await store.tickets_board_out(session, u["tenant_id"], rows)


@api.get("/tickets/search")
async def search_tickets(
    u=Depends(require_perm("tickets.view")),
    q: str = Query(..., min_length=1),
    limit: int = Query(50, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
):
    """Search tickets across all accessible boards / customer inbox."""
    search = q.strip()
    if not search:
        return []
    _, allowed = await store.resolve_ticket_spaces(session, u["tenant_id"])
    allowed_ids = [s.id for s in allowed]
    if not allowed_ids:
        return []
    spaces_map = {s.id: store.space_out(s) for s in allowed}
    stmt = (
        select(Ticket)
        .where(
            Ticket.tenant_id == u["tenant_id"],
            Ticket.space_id.in_(allowed_ids),
            ticket_search_sql_conditions(search, Ticket),
        )
        .order_by(Ticket.updated_at.desc())
        .limit(limit)
    )
    rows = list((await session.execute(stmt)).scalars().all())
    out = await store.tickets_board_out(session, u["tenant_id"], rows)
    for item in out:
        sp = spaces_map.get(item.get("space_id"))
        if sp:
            item["space_name"] = sp["name"]
            item["space_slug"] = sp["slug"]
            item["space_color"] = sp["color"]
            item["space_is_customer"] = sp["is_customer"]
    return out


@api.get("/tickets/export")
async def export_tickets(
    u=Depends(require_perm("tickets.view")),
    space_id: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
):
    _, allowed = await store.resolve_ticket_spaces(session, u["tenant_id"])
    allowed_ids = [s.id for s in allowed]
    q = select(Ticket).where(Ticket.tenant_id == u["tenant_id"])
    if space_id:
        await _ensure_space_access(session, u["tenant_id"], space_id)
        q = q.where(Ticket.space_id == space_id)
    elif allowed_ids:
        q = q.where(Ticket.space_id.in_(allowed_ids))
    rows = list((await session.execute(q.order_by(Ticket.created_at.desc()).limit(5000))).scalars().all())
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "code", "title", "status", "priority", "category", "due_date", "is_overdue",
        "assignees", "tags", "reporter", "created_at", "updated_at",
    ])
    for t in rows:
        out = store.ticket_out(t)
        assignees = ", ".join(a.get("name", "") for a in (out.get("assignees") or []))
        writer.writerow([
            out["code"], out["title"], out["status"], out["priority"], out["category"],
            out.get("due_date") or "", out.get("is_overdue"), assignees,
            ", ".join(out.get("tags") or []), out.get("reporter_name") or "",
            out["created_at"], out["updated_at"],
        ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=tickets-export.csv"},
    )


@api.get("/tickets/tags")
async def list_ticket_tags(
    u=Depends(require_perm("tickets.view")),
    session: AsyncSession = Depends(get_session),
):
    return await store.list_ticket_tags(session, u["tenant_id"])


# ====================== SPACES ======================
@api.get("/spaces")
async def list_spaces(u=Depends(require_perm("tickets.view")), session: AsyncSession = Depends(get_session)):
    tenant = await store.get_tenant_by_id(session, u["tenant_id"])
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    mods = store.tenant_modules(tenant)

    if mods["boards"]:
        allowed, all_spaces, max_sp = await store.get_space_access(session, u["tenant_id"])
        result = []
        for s in allowed:
            cnt = (
                await session.execute(
                    select(func.count()).select_from(Ticket).where(Ticket.space_id == s.id)
                )
            ).scalar_one()
            result.append(store.space_out(s, cnt))
        custom_all = store._custom_spaces(all_spaces)
        custom_allowed = [s for s in allowed if s.slug not in store.SYSTEM_SPACE_SLUGS]
        system_boards = ["general"]
        if mods["bot"]:
            system_boards.append(CUSTOMER_SPACE_SLUG)
        return {
            "spaces": result,
            "mode": "boards",
            "max_spaces": max_sp,
            "max_extra_boards": max_sp,
            "used": len(custom_all),
            "used_extra": len(custom_all),
            "locked_count": max(0, len(custom_all) - len(custom_allowed)),
            "can_create": len(custom_all) < max_sp,
            "system_boards": system_boards,
        }

    if mods["bot"]:
        customer = await store.provision_customer_inbox_only(session, u["tenant_id"])
        cnt = (
            await session.execute(
                select(func.count()).select_from(Ticket).where(Ticket.space_id == customer.id)
            )
        ).scalar_one()
        return {
            "spaces": [store.space_out(customer, cnt)],
            "mode": "inbox_only",
            "max_spaces": 0,
            "max_extra_boards": 0,
            "used": 0,
            "used_extra": 0,
            "locked_count": 0,
            "can_create": False,
            "system_boards": [CUSTOMER_SPACE_SLUG],
        }

    raise HTTPException(403, "Spaces require the Boards or Bot module")


@api.post("/spaces")
async def create_space(
    body: SpaceCreate,
    u=Depends(require_perm("tickets.create")),
    session: AsyncSession = Depends(get_session),
):
    await ensure_tenant_module(session, u["tenant_id"], "boards")
    tenant = await store.get_tenant_by_id(session, u["tenant_id"])
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    existing = (
        await session.execute(select(Space).where(Space.tenant_id == u["tenant_id"]))
    ).scalars().all()
    custom_existing = store._custom_spaces(list(existing))
    if len(custom_existing) >= store.effective_max_spaces(tenant):
        mods = store.tenant_modules(tenant)
        sys_note = "General is always included"
        if mods["bot"]:
            sys_note += "; Customer Inbox when Bot is enabled"
        raise HTTPException(
            403,
            f"Extra board limit reached. {sys_note} — contact super admin to allow more custom boards.",
        )
    slug = slugify(body.name)
    if slug == CUSTOMER_SPACE_SLUG:
        raise HTTPException(400, "Customer Inbox is a system board and cannot be created manually.")
    if any(s.slug == slug for s in existing):
        slug = f"{slug}-{_gen_id()[:4]}"
    now = _utc_now_iso()
    space = Space(
        id=_gen_id(),
        tenant_id=u["tenant_id"],
        name=body.name.strip(),
        slug=slug,
        description=body.description or "",
        color=body.color or "#002FA7",
        is_default=len(other_existing) == 0,
        created_at=now,
    )
    session.add(space)
    await session.commit()
    return store.space_out(space, 0)


@api.post("/tickets")
async def create_ticket(
    body: TicketCreate, u=Depends(require_perm("tickets.create")), session: AsyncSession = Depends(get_session)
):
    mode, _ = await store.resolve_ticket_spaces(session, u["tenant_id"])
    if mode == "inbox":
        raise HTTPException(
            403,
            "Manual ticket creation requires the Boards module. Customers can submit via the widget bot.",
        )
    user_doc = await store.get_user_by_id(session, u["user_id"])
    code = await store.next_ticket_code(session, u["tenant_id"])
    now = _utc_now_iso()

    space_id = await _resolve_ticket_space_id(session, u["tenant_id"], body.space_id)
    parent = None
    if body.parent_id:
        parent = await _validate_parent_ticket(session, u["tenant_id"], body.parent_id)
        space_id = parent.space_id or space_id
    await _ensure_space_access(session, u["tenant_id"], space_id)

    status = body.status or "new"
    workflow = await _tenant_workflow(session, u["tenant_id"])
    allowed = workflow_status_ids(workflow)
    if status not in allowed:
        raise HTTPException(400, "Invalid status")

    assignees: list = []
    assignee_id = None
    assignee_name = None
    if body.assignees:
        assignees = await _resolve_assignees(session, u["tenant_id"], body.assignees)
        if assignees:
            assignee_id = assignees[0]["id"]
            assignee_name = assignees[0]["name"]
    elif body.assignee_id:
        a = await store.get_user_by_id(session, body.assignee_id)
        if a and a.tenant_id == u["tenant_id"]:
            assignee_id = a.id
            assignee_name = a.name
            assignees = [{"id": a.id, "name": a.name}]

    description = (body.description or "").strip() or body.title
    created_summary = (
        f"Child ticket created under {parent.code}"
        if parent
        else f"Ticket created · {status.replace('_', ' ')} · {body.priority} priority"
    )
    if assignee_name:
        created_summary += f" · assigned to {_assignee_label(assignees)}"

    ticket = Ticket(
        id=_gen_id(),
        code=code,
        tenant_id=u["tenant_id"],
        space_id=space_id,
        parent_id=body.parent_id,
        title=body.title,
        description=description,
        status=status,
        priority=body.priority,
        category=body.category,
        sentiment="neutral",
        urgency_score=50,
        assignee_id=assignee_id,
        assignee_name=assignee_name,
        reporter_id=u["user_id"],
        reporter_name=user_doc.name if user_doc else None,
        reporter_email=body.reporter_email or (user_doc.email if user_doc else None),
        labels=body.labels,
        tags=body.tags or [],
        assignees=assignees,
        blocked_by=None,
        attachments=body.attachments or [],
        comments=[],
        qa_scenarios=[],
        activity=[{
            "at": now,
            "by": user_doc.name if user_doc else "system",
            "event": "created",
            "summary": created_summary,
        }],
        due_date=parse_due(body.due_date),
        created_at=now,
        updated_at=now,
    )
    session.add(ticket)
    if parent:
        parent_activity = list(parent.activity or [])
        parent_activity.append({
            "at": now,
            "by": user_doc.name if user_doc else "system",
            "event": "child_created",
            "summary": f"Child ticket {code} created",
            "child_id": ticket.id,
            "child_code": code,
        })
        await session.execute(
            update(Ticket)
            .where(Ticket.id == parent.id)
            .values(activity=parent_activity, updated_at=now)
        )
    await store.create_notification(
        session,
        u["tenant_id"],
        f"New ticket {code}",
        body.title,
        "ticket",
        _gen_id(),
        now,
        link=f"/app/tickets/{ticket.id}",
    )
    await session.commit()
    return await store.ticket_detail_out(session, ticket)


@api.get("/tickets/{ticket_id}")
async def get_ticket(
    ticket_id: str, u=Depends(require_perm("tickets.view")), session: AsyncSession = Depends(get_session)
):
    if ticket_id in ("search", "export", "tags"):
        raise HTTPException(404, "Not found")
    t = (
        await session.execute(
            select(Ticket).where(Ticket.id == ticket_id, Ticket.tenant_id == u["tenant_id"])
        )
    ).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Ticket not found")
    await _ensure_ticket_space_access(session, u["tenant_id"], t)
    return await store.ticket_detail_out(session, t)


@api.patch("/tickets/{ticket_id}")
async def update_ticket(
    ticket_id: str,
    body: TicketUpdate,
    u=Depends(require_perm("tickets.edit")),
    session: AsyncSession = Depends(get_session),
):
    t = (
        await session.execute(
            select(Ticket).where(Ticket.id == ticket_id, Ticket.tenant_id == u["tenant_id"])
        )
    ).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Ticket not found")
    await _ensure_ticket_space_access(session, u["tenant_id"], t)

    updates = body.model_dump(exclude_unset=True)
    if not updates:
        return await store.ticket_detail_out(session, t)

    # attachments: client sends full list (add/remove); do not merge

    now = _utc_now_iso()
    updates["updated_at"] = now
    user_doc = await store.get_user_by_id(session, u["user_id"])

    if "qa_scenarios" in updates:
        updates["qa_scenarios"] = _normalize_qa_scenarios(
            updates["qa_scenarios"],
            t.qa_scenarios or [],
            user_doc,
            now,
        )

    if "assignees" in updates:
        updates["assignees"] = await _resolve_assignees(
            session, u["tenant_id"], updates["assignees"]
        )
        if updates["assignees"]:
            updates["assignee_id"] = updates["assignees"][0]["id"]
            updates["assignee_name"] = updates["assignees"][0]["name"]
        else:
            updates["assignee_id"] = None
            updates["assignee_name"] = None
    elif "assignee_id" in updates:
        if updates["assignee_id"]:
            a = await store.get_user_by_id(session, updates["assignee_id"])
            if a and a.tenant_id == u["tenant_id"]:
                updates["assignee_name"] = a.name
                updates["assignees"] = [{"id": a.id, "name": a.name}]
            else:
                updates["assignee_name"] = None
                updates["assignees"] = []
        else:
            updates["assignee_name"] = None
            updates["assignees"] = []

    if "blocked_by" in updates:
        updates["blocked_by"] = await _resolve_blocked_by(
            session, u["tenant_id"], updates["blocked_by"], ticket_id
        )

    if "due_date" in updates:
        updates["due_date"] = parse_due(updates["due_date"])

    workflow = await _tenant_workflow(session, u["tenant_id"])
    allowed = workflow_status_ids(workflow)
    qa_ids = qa_status_ids(workflow)
    if "status" in updates and updates["status"] not in allowed:
        raise HTTPException(400, "Invalid status")

    if "space_id" in updates and updates["space_id"] != t.space_id:
        await _ensure_space_access(session, u["tenant_id"], updates["space_id"])
        new_sp = (
            await session.execute(
                select(Space).where(
                    Space.id == updates["space_id"],
                    Space.tenant_id == u["tenant_id"],
                )
            )
        ).scalar_one_or_none()
        if not new_sp:
            raise HTTPException(404, "Space not found")

    details = _describe_ticket_changes(t, updates)
    if "space_id" in updates and updates["space_id"] != t.space_id:
        old_sp = None
        if t.space_id:
            old_sp = (
                await session.execute(
                    select(Space).where(Space.id == t.space_id, Space.tenant_id == u["tenant_id"])
                )
            ).scalar_one_or_none()
        old_name = old_sp.name if old_sp else "Unknown"
        new_sp = (
            await session.execute(
                select(Space).where(Space.id == updates["space_id"], Space.tenant_id == u["tenant_id"])
            )
        ).scalar_one_or_none()
        new_name = new_sp.name if new_sp else "Unknown"
        details.append(f"Moved from {old_name} to {new_name}")
    if "status" in updates and updates["status"] != t.status and updates["status"] in qa_ids:
        scenarios = updates.get("qa_scenarios", t.qa_scenarios or [])
        qa_msg = qa_handoff_warning(scenarios)
        if qa_msg:
            details.append(qa_msg)
            await store.create_notification(
                session,
                u["tenant_id"],
                f"QA incomplete · {t.code}",
                qa_msg,
                "qa_warning",
                _gen_id(),
                now,
                link=f"/app/tickets/{ticket_id}",
            )
    if details:
        activity = list(t.activity or [])
        activity.append(
            {
                "at": now,
                "by": user_doc.name if user_doc else "system",
                "event": "updated",
                "details": details,
                "summary": details[0] if len(details) == 1 else f"{len(details)} changes",
            }
        )
        updates["activity"] = activity

    await session.execute(
        update(Ticket)
        .where(Ticket.id == ticket_id, Ticket.tenant_id == u["tenant_id"])
        .values(**updates)
    )
    await session.commit()
    t = (
        await session.execute(
            select(Ticket).where(Ticket.id == ticket_id, Ticket.tenant_id == u["tenant_id"])
        )
    ).scalar_one()
    return await store.ticket_detail_out(session, t)


class CommentInput(BaseModel):
    body: str


@api.post("/tickets/{ticket_id}/comments")
async def add_comment(
    ticket_id: str,
    body: CommentInput,
    u=Depends(require_perm("tickets.edit")),
    session: AsyncSession = Depends(get_session),
):
    t = (
        await session.execute(
            select(Ticket).where(Ticket.id == ticket_id, Ticket.tenant_id == u["tenant_id"])
        )
    ).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Ticket not found")
    await _ensure_ticket_space_access(session, u["tenant_id"], t)

    user_doc = await store.get_user_by_id(session, u["user_id"])
    now = _utc_now_iso()
    comment = {
        "id": _gen_id(),
        "author_id": u["user_id"],
        "author_name": user_doc.name if user_doc else "user",
        "body": body.body,
        "created_at": now,
    }
    comments = list(t.comments or [])
    comments.append(comment)
    preview = body.body.strip().replace("\n", " ")
    if len(preview) > 100:
        preview = preview[:97] + "..."
    activity = list(t.activity or [])
    activity.append(
        {
            "at": now,
            "by": user_doc.name if user_doc else "user",
            "event": "comment",
            "summary": f"Commented: {preview}",
        }
    )
    await session.execute(
        update(Ticket)
        .where(Ticket.id == ticket_id)
        .values(comments=comments, updated_at=now, activity=activity)
    )
    await session.commit()
    return comment


@api.delete("/tickets/{ticket_id}")
async def delete_ticket(
    ticket_id: str, u=Depends(require_perm("tickets.delete")), session: AsyncSession = Depends(get_session)
):
    t = (
        await session.execute(
            select(Ticket).where(Ticket.id == ticket_id, Ticket.tenant_id == u["tenant_id"])
        )
    ).scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Ticket not found")
    await _ensure_ticket_space_access(session, u["tenant_id"], t)
    await session.execute(
        update(Ticket)
        .where(Ticket.parent_id == ticket_id, Ticket.tenant_id == u["tenant_id"])
        .values(parent_id=None)
    )
    await session.execute(
        delete(Ticket).where(Ticket.id == ticket_id, Ticket.tenant_id == u["tenant_id"])
    )
    await session.commit()
    return {"ok": True}


# ====================== USERS & PERMISSIONS ======================
@api.get("/permissions/matrix")
async def get_permissions_matrix(
    u=Depends(require_perm("team.view")), session: AsyncSession = Depends(get_session)
):
    from permissions import permissions_matrix

    cfg = await store.get_tenant_permission_config(session, u["tenant_id"])
    return permissions_matrix(cfg)


class PermissionConfigBody(BaseModel):
    groups: List[Dict[str, Any]]
    role_permissions: Dict[str, List[str]]


@api.put("/permissions/config")
async def put_permissions_config(
    body: PermissionConfigBody,
    u=Depends(require_perm("team.manage")),
    session: AsyncSession = Depends(get_session),
):
    from permissions import validate_config

    try:
        clean = validate_config(body.model_dump())
    except ValueError as e:
        raise HTTPException(400, str(e))
    await session.execute(
        update(Tenant)
        .where(Tenant.id == u["tenant_id"])
        .values(permission_config=clean)
    )
    await session.commit()
    from permissions import permissions_matrix

    return permissions_matrix(clean)


@api.get("/users")
async def list_users(
    u=Depends(require_perm("team.view")), session: AsyncSession = Depends(get_session)
):
    cfg = await store.get_tenant_permission_config(session, u["tenant_id"])
    rows = (
        await session.execute(select(User).where(User.tenant_id == u["tenant_id"]).limit(500))
    ).scalars().all()
    return [store.user_out(usr, cfg) for usr in rows]


@api.post("/users")
async def add_user(
    body: UserCreate,
    u=Depends(require_perm("team.manage")),
    session: AsyncSession = Depends(get_session),
):
    if await store.get_user_by_email(session, body.email):
        raise HTTPException(400, "Email exists")
    user = User(
        id=_gen_id(),
        email=body.email,
        name=body.name,
        role=body.role,
        tenant_id=u["tenant_id"],
        password_hash=hash_password(body.password),
        active=True,
        created_at=_utc_now_iso(),
    )
    session.add(user)
    await session.commit()
    cfg = await store.get_tenant_permission_config(session, u["tenant_id"])
    return store.user_out(user, cfg)


class UserPatch(BaseModel):
    role: Optional[str] = None
    active: Optional[bool] = None
    name: Optional[str] = None
    permission_overrides: Optional[Dict[str, Any]] = None


@api.patch("/users/{user_id}")
async def patch_user(
    user_id: str,
    body: UserPatch,
    u=Depends(require_perm("team.manage")),
    session: AsyncSession = Depends(get_session),
):
    if body.permission_overrides is not None:
        checker = await store.get_user_by_id(session, u["user_id"])
        cfg = await store.get_tenant_permission_config(session, u["tenant_id"])
        from permissions import has_permission

        can_perms = checker and (
            checker.role == "admin"
            or has_permission(checker.role, "team.permissions", checker.permission_overrides or {}, cfg)
            or has_permission(checker.role, "team.manage", checker.permission_overrides or {}, cfg)
        )
        if not can_perms:
            raise HTTPException(403, "Permission denied: team.permissions")
    if user_id == u["user_id"] and body.active is False:
        raise HTTPException(400, "Cannot disable your own account")
    updates = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if updates:
        await session.execute(
            update(User)
            .where(User.id == user_id, User.tenant_id == u["tenant_id"])
            .values(**updates)
        )
        await session.commit()
    user = (
        await session.execute(
            select(User).where(User.id == user_id, User.tenant_id == u["tenant_id"])
        )
    ).scalar_one_or_none()
    cfg = await store.get_tenant_permission_config(session, u["tenant_id"])
    return store.user_out(user, cfg) if user else None


@api.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    u=Depends(require_perm("team.manage")),
    session: AsyncSession = Depends(get_session),
):
    if user_id == u["user_id"]:
        raise HTTPException(400, "Cannot delete yourself")
    await session.execute(
        delete(User).where(User.id == user_id, User.tenant_id == u["tenant_id"])
    )
    await session.commit()
    return {"ok": True}


# ====================== CHAT ======================
async def _agent_name_map(session: AsyncSession, agent_ids: set) -> Dict[str, str]:
    if not agent_ids:
        return {}
    rows = (
        await session.execute(select(User).where(User.id.in_(agent_ids)))
    ).scalars().all()
    return {u.id: u.name for u in rows}


def _customer_key(cs: ChatSession) -> str:
    return (cs.visitor_email or cs.visitor_name or cs.id).lower()


@api.get("/chats")
async def list_chats(u=Depends(require_perm("chats.view")), session: AsyncSession = Depends(get_session)):
    await ensure_tenant_module(session, u["tenant_id"], "live_chat")
    rows = (
        await session.execute(
            select(ChatSession)
            .where(ChatSession.tenant_id == u["tenant_id"])
            .order_by(ChatSession.last_message_at.desc())
            .limit(2000)
        )
    ).scalars().all()
    agent_ids = {s.agent_id for s in rows if s.agent_id}
    names = await _agent_name_map(session, agent_ids)
    # One row per customer — latest session only
    by_customer: Dict[str, ChatSession] = {}
    for s in rows:
        key = _customer_key(s)
        if key not in by_customer:
            by_customer[key] = s
    result = [
        store.chat_session_out(s, names.get(s.agent_id))
        for s in sorted(by_customer.values(), key=lambda x: x.last_message_at, reverse=True)
    ]
    return result


@api.get("/chats/customer/messages")
async def customer_messages(
    customer_key: str = Query(..., min_length=1),
    u=Depends(require_perm("chats.view")),
    session: AsyncSession = Depends(get_session),
):
    sessions = (
        await session.execute(
            select(ChatSession)
            .where(ChatSession.tenant_id == u["tenant_id"])
            .order_by(ChatSession.created_at.asc())
        )
    ).scalars().all()
    session_ids = [s.id for s in sessions if _customer_key(s) == customer_key.lower()]
    if not session_ids:
        raise HTTPException(404, "Customer not found")
    active_cs = max(
        (s for s in sessions if _customer_key(s) == customer_key.lower()),
        key=lambda s: s.last_message_at,
        default=None,
    )
    if active_cs:
        await _mark_agent_read(session, active_cs, u["user_id"], u["tenant_id"])
    rows = (
        await session.execute(
            select(ChatMessage)
            .where(
                ChatMessage.tenant_id == u["tenant_id"],
                ChatMessage.session_id.in_(session_ids),
            )
            .order_by(ChatMessage.created_at.asc())
            .limit(5000)
        )
    ).scalars().all()
    return [store.chat_message_out(m) for m in rows]


@api.get("/chats/customer/tickets")
async def customer_tickets(
    customer_key: str = Query(..., min_length=1),
    u=Depends(require_perm("chats.view")),
    session: AsyncSession = Depends(get_session),
):
    sessions = (
        await session.execute(
            select(ChatSession).where(ChatSession.tenant_id == u["tenant_id"])
        )
    ).scalars().all()
    matching = [s for s in sessions if _customer_key(s) == customer_key.lower()]
    if not matching:
        raise HTTPException(404, "Customer not found")

    session_ids = [s.id for s in matching]
    latest = max(matching, key=lambda s: s.last_message_at)
    filters = [Ticket.chat_session_id.in_(session_ids)]
    if latest.visitor_email:
        filters.append(func.lower(Ticket.reporter_email) == latest.visitor_email.lower())

    rows = (
        await session.execute(
            select(Ticket)
            .where(Ticket.tenant_id == u["tenant_id"], or_(*filters))
            .order_by(Ticket.created_at.desc())
            .limit(100)
        )
    ).scalars().all()

    tickets = []
    for t in rows:
        out = store.ticket_out(t)
        tickets.append({
            "id": out["id"],
            "code": out["code"],
            "title": out["title"],
            "status": out["status"],
            "priority": out["priority"],
            "category": out["category"],
            "space_id": out["space_id"],
            "created_at": out["created_at"],
            "updated_at": out["updated_at"],
        })
    return {
        "count": len(tickets),
        "visitor_name": latest.visitor_name,
        "visitor_email": latest.visitor_email,
        "tickets": tickets,
    }


@api.get("/chats/{session_id}/messages")
async def list_messages(
    session_id: str, u=Depends(require_perm("chats.view")), session: AsyncSession = Depends(get_session)
):
    cs = (
        await session.execute(
            select(ChatSession).where(
                ChatSession.id == session_id, ChatSession.tenant_id == u["tenant_id"]
            )
        )
    ).scalar_one_or_none()
    if not cs:
        raise HTTPException(404, "Session not found")
    await _mark_agent_read(session, cs, u["user_id"], u["tenant_id"])
    rows = (
        await session.execute(
            select(ChatMessage)
            .where(
                ChatMessage.session_id == session_id,
                ChatMessage.tenant_id == u["tenant_id"],
            )
            .order_by(ChatMessage.created_at.asc())
            .limit(2000)
        )
    ).scalars().all()
    return [store.chat_message_out(m) for m in rows]


@api.post("/chats/{session_id}/messages")
async def post_agent_message(
    session_id: str,
    body: ChatMessageIn,
    u=Depends(require_perm("chats.reply")),
    session: AsyncSession = Depends(get_session),
):
    cs = (
        await session.execute(
            select(ChatSession).where(
                ChatSession.id == session_id, ChatSession.tenant_id == u["tenant_id"]
            )
        )
    ).scalar_one_or_none()
    if not cs:
        raise HTTPException(404, "Session not found")
    if cs.status == "closed":
        raise HTTPException(400, "Chat is closed")
    user_doc = await store.get_user_by_id(session, u["user_id"])
    now = _utc_now_iso()
    reads = dict(cs.agent_reads or {})
    reads[u["user_id"]] = now
    msg = ChatMessage(
        id=_gen_id(),
        session_id=session_id,
        tenant_id=u["tenant_id"],
        text=body.text,
        sender="agent",
        sender_name=user_doc.name if user_doc else "Agent",
        created_at=now,
    )
    session.add(msg)
    await session.execute(
        update(ChatSession)
        .where(ChatSession.id == session_id, ChatSession.tenant_id == u["tenant_id"])
        .values(
            last_message_at=now,
            status="live",
            agent_id=u["user_id"],
            unread=0,
            agent_reads=reads,
        )
    )
    await session.commit()
    out = store.chat_message_out(msg)
    await emit_chat_messages(session, session_id, u["tenant_id"], out)
    return out


@api.post("/chats/{session_id}/claim")
async def claim_chat(
    session_id: str, u=Depends(require_perm("chats.reply")), session: AsyncSession = Depends(get_session)
):
    cs = (
        await session.execute(
            select(ChatSession).where(
                ChatSession.id == session_id, ChatSession.tenant_id == u["tenant_id"]
            )
        )
    ).scalar_one_or_none()
    if not cs:
        raise HTTPException(404, "Session not found")
    reads = dict(cs.agent_reads or {})
    reads[u["user_id"]] = _utc_now_iso()
    await session.execute(
        update(ChatSession)
        .where(ChatSession.id == session_id, ChatSession.tenant_id == u["tenant_id"])
        .values(status="live", agent_id=u["user_id"], unread=0, agent_reads=reads)
    )
    await session.commit()
    await emit_session_update(session, session_id, u["tenant_id"])
    return {"ok": True}


class ChatTicketCreate(BaseModel):
    title: str
    description: str
    priority: str = "medium"
    category: str = "Question"
    attachments: List[Dict[str, Any]] = []


@api.post("/chats/{session_id}/ticket")
async def create_ticket_from_chat(
    session_id: str,
    body: ChatTicketCreate,
    u=Depends(require_perm("chats.reply")),
    session: AsyncSession = Depends(get_session),
):
    cs = (
        await session.execute(
            select(ChatSession).where(
                ChatSession.id == session_id, ChatSession.tenant_id == u["tenant_id"]
            )
        )
    ).scalar_one_or_none()
    if not cs:
        raise HTTPException(404, "Session not found")
    user_doc = await store.get_user_by_id(session, u["user_id"])
    code = await store.next_ticket_code(session, u["tenant_id"])
    now = _utc_now_iso()
    space_id = await _resolve_ticket_space_id(session, u["tenant_id"])
    ticket = Ticket(
        id=_gen_id(),
        code=code,
        tenant_id=u["tenant_id"],
        space_id=space_id,
        title=body.title,
        description=body.description,
        status="new",
        priority=body.priority,
        category=body.category,
        sentiment="neutral",
        urgency_score=50,
        assignee_id=u["user_id"],
        assignee_name=user_doc.name if user_doc else "Agent",
        reporter_id=None,
        reporter_name=cs.visitor_name or "Visitor",
        reporter_email=cs.visitor_email,
        labels=["from-chat"],
        attachments=body.attachments or [],
        comments=[],
        activity=[
            {
                "at": now,
                "by": user_doc.name if user_doc else "Agent",
                "event": f"created from chat with {cs.visitor_name or 'visitor'}",
            }
        ],
        chat_session_id=session_id,
        created_at=now,
        updated_at=now,
    )
    session.add(ticket)
    await store.create_notification(
        session,
        u["tenant_id"],
        f"New ticket {code}",
        body.title,
        "ticket",
        _gen_id(),
        now,
        link=f"/app/tickets/{ticket.id}",
    )
    await session.commit()
    return store.ticket_out(ticket)


@api.post("/chats/{session_id}/close")
async def close_chat(
    session_id: str, u=Depends(require_perm("chats.close")), session: AsyncSession = Depends(get_session)
):
    await session.execute(
        update(ChatSession)
        .where(ChatSession.id == session_id, ChatSession.tenant_id == u["tenant_id"])
        .values(status="closed")
    )
    await session.commit()
    await emit_session_update(session, session_id, u["tenant_id"])
    return {"ok": True}


# ====================== WIDGET ======================
class WidgetInit(BaseModel):
    client_id: str
    visitor_name: Optional[str] = "Guest"
    visitor_email: Optional[str] = None
    force_new: bool = False


@api.post("/widget/init")
async def widget_init(body: WidgetInit, session: AsyncSession = Depends(get_session)):
    t = await store.get_tenant_by_client_id(session, body.client_id)
    if not t:
        raise HTTPException(404, "Unknown client")
    t = await store.sync_trial_expiry(session, t)
    store.assert_tenant_access(t)
    store.assert_tenant_module(t, "bot")
    bot = await store.get_default_bot(session, t.id)

    if body.force_new and body.visitor_email:
        await session.execute(
            update(ChatSession)
            .where(
                ChatSession.tenant_id == t.id,
                ChatSession.visitor_email == body.visitor_email,
                ChatSession.status != "closed",
            )
            .values(status="closed")
        )
        await session.flush()

    # Reuse open session for same customer; new session only after previous was closed
    if body.visitor_email and not body.force_new:
        existing = (
            await session.execute(
                select(ChatSession)
                .where(
                    ChatSession.tenant_id == t.id,
                    ChatSession.visitor_email == body.visitor_email,
                    ChatSession.status != "closed",
                )
                .order_by(ChatSession.last_message_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if existing:
            greeting = bot["greeting"] if bot else "Hello! How can I help today?"
            return {
                "session_id": existing.id,
                "resumed": True,
                "status": existing.status,
                "tenant": {"name": t.name, "branding": t.branding or {}},
                "bot": (
                    {
                        "name": bot["name"],
                        "greeting": greeting,
                        "theme_color": bot.get("theme_color", "#002FA7"),
                    }
                    if bot
                    else None
                ),
                "greeting": greeting,
            }

    session_id = _gen_id()
    now = _utc_now_iso()

    cs = ChatSession(
        id=session_id,
        tenant_id=t.id,
        bot_id=bot["id"] if bot else None,
        visitor_name=body.visitor_name or "Guest",
        visitor_email=body.visitor_email,
        status="ai",
        agent_id=None,
        created_at=now,
        last_message_at=now,
        unread=0,
    )
    session.add(cs)

    greeting = bot["greeting"] if bot else "Hello! How can I help today?"
    session.add(
        ChatMessage(
            id=_gen_id(),
            session_id=session_id,
            tenant_id=t.id,
            text=greeting,
            sender="bot",
            sender_name=bot["name"] if bot else "Bot",
            created_at=now,
        )
    )
    await session.commit()
    await emit_session_update(session, session_id, t.id)

    return {
        "session_id": session_id,
        "resumed": False,
        "status": "ai",
        "tenant": {"name": t.name, "branding": t.branding or {}},
        "bot": (
            {
                "name": bot["name"],
                "greeting": greeting,
                "theme_color": bot.get("theme_color", "#002FA7"),
            }
            if bot
            else None
        ),
        "greeting": greeting,
    }


class WidgetMessage(BaseModel):
    session_id: str
    text: str = ""
    attachments: List[Dict[str, Any]] = []


@api.post("/widget/message")
async def widget_message(body: WidgetMessage, session: AsyncSession = Depends(get_session)):
    cs = (
        await session.execute(select(ChatSession).where(ChatSession.id == body.session_id))
    ).scalar_one_or_none()
    if not cs:
        raise HTTPException(404, "Session not found")

    if not body.text.strip() and not body.attachments:
        raise HTTPException(400, "Message text or attachments required")

    tenant = await store.get_tenant_for_access(session, cs.tenant_id)
    store.assert_tenant_module(tenant, "bot")
    tenant_id = cs.tenant_id
    now = _utc_now_iso()
    msg_meta = {"attachments": body.attachments} if body.attachments else None

    user_msg = ChatMessage(
        id=_gen_id(),
        session_id=body.session_id,
        tenant_id=tenant_id,
        text=body.text.strip() or "(attachment)",
        sender="user",
        sender_name=cs.visitor_name or "Visitor",
        created_at=now,
        meta=msg_meta,
    )
    session.add(user_msg)

    if cs.status in ("live", "queue"):
        await session.execute(
            update(ChatSession)
            .where(ChatSession.id == body.session_id)
            .values(last_message_at=now, unread=cs.unread + 1)
        )
        await session.commit()
        user_out = store.chat_message_out(user_msg)
        await emit_chat_messages(session, body.session_id, tenant_id, user_out)
        return {
            "user_message": user_out,
            "bot_message": None,
            "ticket": None,
        }

    classify_text = body.text.strip() or "User shared an attachment"
    classify_task = classify_message(classify_text, body.session_id)
    classification = await classify_task

    bot = await store.get_default_bot(session, tenant_id) or {
        "system_prompt": "Helpful assistant.",
        "model": "gemini-3-flash-preview",
        "fallback_message": "I'll create a ticket.",
        "name": "Bot",
    }
    rag = await answer_with_rag(classify_text, session, tenant_id, bot, body.session_id)

    bot_msg = ChatMessage(
        id=_gen_id(),
        session_id=body.session_id,
        tenant_id=tenant_id,
        text=rag["answer"],
        sender="bot",
        sender_name=bot.get("name", "Bot"),
        created_at=_utc_now_iso(),
        meta={
            "confidence": rag["confidence"],
            "sources": rag.get("sources", []),
            "classification": classification,
        },
    )
    session.add(bot_msg)

    ticket = None
    if classification.get("is_ticket_worthy"):
        tenant = await store.get_tenant_by_id(session, tenant_id)
        if tenant:
            store.assert_tenant_module(tenant, "bot")
        code = await store.next_ticket_code(session, tenant_id)
        customer = await store.provision_customer_inbox_only(session, tenant_id)
        space_id = customer.id
        ticket_obj = Ticket(
            id=_gen_id(),
            code=code,
            tenant_id=tenant_id,
            space_id=space_id,
            title=(classify_text[:80] + ("..." if len(classify_text) > 80 else "")),
            description=body.text.strip() or f"Attachment: {', '.join(a.get('name', 'file') for a in body.attachments)}",
            status="new",
            priority=classification.get("priority", "medium"),
            category=classification.get("category", "Bug"),
            sentiment=classification.get("sentiment", "neutral"),
            urgency_score=int(classification.get("urgency_score", 50)),
            assignee_id=None,
            assignee_name=None,
            reporter_id=None,
            reporter_name=cs.visitor_name or "Visitor",
            reporter_email=cs.visitor_email,
            labels=["customer", "auto-created"],
            attachments=body.attachments or [],
            comments=[],
            activity=[{"at": _utc_now_iso(), "by": "AI", "event": "auto-created from chat"}],
            chat_session_id=body.session_id,
            created_at=_utc_now_iso(),
            updated_at=_utc_now_iso(),
        )
        session.add(ticket_obj)
        await store.create_notification(
            session,
            tenant_id,
            f"New ticket {code}",
            ticket_obj.title,
            "ticket",
            _gen_id(),
            _utc_now_iso(),
            link=f"/app/tickets/{ticket_obj.id}",
        )
        ticket = store.ticket_out(ticket_obj)

    await session.execute(
        update(ChatSession)
        .where(ChatSession.id == body.session_id)
        .values(
            last_message_at=bot_msg.created_at,
            last_classification=classification,
        )
    )
    await session.commit()

    user_out = store.chat_message_out(user_msg)
    bot_out = store.chat_message_out(bot_msg)
    await emit_chat_messages(session, body.session_id, tenant_id, user_out, bot_out)

    return {
        "user_message": user_out,
        "bot_message": bot_out,
        "ticket": ticket,
    }


@api.get("/widget/messages/{session_id}")
async def widget_messages(session_id: str, session: AsyncSession = Depends(get_session)):
    rows = (
        await session.execute(
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.created_at.asc())
            .limit(1000)
        )
    ).scalars().all()
    return [store.chat_message_out(m) for m in rows]


class EscalateInput(BaseModel):
    session_id: str
    reason: Optional[str] = "User requested human"


@api.post("/widget/escalate")
async def widget_escalate(body: EscalateInput, session: AsyncSession = Depends(get_session)):
    cs = (
        await session.execute(select(ChatSession).where(ChatSession.id == body.session_id))
    ).scalar_one_or_none()
    if not cs:
        raise HTTPException(404, "Session not found")
    t = await store.get_tenant_for_access(session, cs.tenant_id)
    store.assert_tenant_module(t, "live_chat")

    now = _utc_now_iso()
    await session.execute(
        update(ChatSession).where(ChatSession.id == body.session_id).values(status="queue")
    )
    await store.create_notification(
        session,
        cs.tenant_id,
        "New chat in queue",
        f"{cs.visitor_name or 'Visitor'} wants to talk to a human.",
        "chat",
        _gen_id(),
        now,
        link=f"/app/chats/{body.session_id}",
    )
    await session.commit()
    await emit_session_update(session, body.session_id, cs.tenant_id)
    return {"ok": True, "status": "queue"}


class WidgetCloseInput(BaseModel):
    session_id: str


@api.post("/widget/close")
async def widget_close(body: WidgetCloseInput, session: AsyncSession = Depends(get_session)):
    cs = (
        await session.execute(select(ChatSession).where(ChatSession.id == body.session_id))
    ).scalar_one_or_none()
    if not cs:
        raise HTTPException(404, "Session not found")
    if cs.status == "closed":
        return {"ok": True, "status": "closed"}
    await session.execute(
        update(ChatSession).where(ChatSession.id == body.session_id).values(status="closed")
    )
    await session.commit()
    await emit_session_update(session, body.session_id, cs.tenant_id)
    return {"ok": True, "status": "closed"}


class WidgetTicketCreate(BaseModel):
    session_id: str
    title: str
    description: str
    priority: str = "medium"
    category: str = "Question"
    attachments: List[Dict[str, Any]] = []


@api.post("/widget/ticket")
async def widget_create_ticket(
    body: WidgetTicketCreate, session: AsyncSession = Depends(get_session)
):
    cs = (
        await session.execute(select(ChatSession).where(ChatSession.id == body.session_id))
    ).scalar_one_or_none()
    if not cs:
        raise HTTPException(404, "Session not found")
    if cs.status == "closed":
        raise HTTPException(400, "Session closed. Start a new conversation first.")

    tenant = await store.get_tenant_for_access(session, cs.tenant_id)
    store.assert_tenant_module(tenant, "bot")

    code = await store.next_ticket_code(session, cs.tenant_id)
    customer = await store.provision_customer_inbox_only(session, cs.tenant_id)
    space_id = customer.id
    now = _utc_now_iso()
    ticket = Ticket(
        id=_gen_id(),
        code=code,
        tenant_id=cs.tenant_id,
        space_id=space_id,
        title=body.title.strip(),
        description=body.description.strip(),
        status="new",
        priority=body.priority,
        category=body.category,
        sentiment="neutral",
        urgency_score=50,
        assignee_id=None,
        assignee_name=None,
        reporter_id=None,
        reporter_name=cs.visitor_name or "Visitor",
        reporter_email=cs.visitor_email,
        labels=["customer", "from-widget"],
        tags=[],
        assignees=[],
        blocked_by=None,
        attachments=body.attachments or [],
        comments=[],
        activity=[{
            "at": now,
            "by": cs.visitor_name or "Visitor",
            "event": "created",
            "summary": f"Ticket created from chat · {body.priority} · {body.category}",
        }],
        chat_session_id=body.session_id,
        created_at=now,
        updated_at=now,
    )
    session.add(ticket)
    sys_msg = ChatMessage(
        id=_gen_id(),
        session_id=body.session_id,
        tenant_id=cs.tenant_id,
        text=f"Ticket {code} created",
        sender="system",
        sender_name="System",
        created_at=now,
    )
    session.add(sys_msg)
    await store.create_notification(
        session,
        cs.tenant_id,
        f"New ticket {code}",
        body.title.strip(),
        "ticket",
        _gen_id(),
        now,
        link=f"/app/tickets/{ticket.id}",
    )
    await session.execute(
        update(ChatSession)
        .where(ChatSession.id == body.session_id)
        .values(last_message_at=now)
    )
    await session.commit()
    await emit_chat_messages(session, body.session_id, cs.tenant_id, store.chat_message_out(sys_msg))
    return store.ticket_out(ticket)


# ====================== NOTIFICATIONS ======================
@api.get("/notifications")
async def list_notifications(
    u=Depends(require_tenant), session: AsyncSession = Depends(get_session)
):
    rows = (
        await session.execute(
            select(Notification)
            .where(Notification.tenant_id == u["tenant_id"])
            .order_by(Notification.created_at.desc())
            .limit(50)
        )
    ).scalars().all()
    return [store.notification_out(n) for n in rows]


@api.post("/notifications/read-all")
async def read_all_notifications(
    u=Depends(require_tenant), session: AsyncSession = Depends(get_session)
):
    await session.execute(
        update(Notification)
        .where(Notification.tenant_id == u["tenant_id"], Notification.read.is_(False))
        .values(read=True)
    )
    await session.commit()
    return {"ok": True}


# ====================== ANALYTICS ======================
@api.get("/analytics/summary")
async def analytics_summary(
    u=Depends(require_perm("analytics.view")), session: AsyncSession = Depends(get_session)
):
    tid = u["tenant_id"]
    total_tickets = await store.count_by_tenant(session, Ticket, tid)
    open_tickets = await store.count_by_tenant(
        session, Ticket, tid, status={"$nin": ["done", "closed"]}
    )
    closed = await store.count_by_tenant(
        session, Ticket, tid, status={"$in": ["done", "closed"]}
    )
    chats_total = await store.count_by_tenant(session, ChatSession, tid)
    live_chats = await store.count_by_tenant(
        session, ChatSession, tid, status={"$in": ["queue", "live"]}
    )
    ai_chats = await store.count_by_tenant(session, ChatSession, tid, status="ai")
    kb_total = await store.count_by_tenant(session, KBDoc, tid)
    users_total = await store.count_by_tenant(session, User, tid)

    by_status = await store.group_count_tickets(session, tid, "status")
    by_category = await store.group_count_tickets(session, tid, "category")
    by_priority = await store.group_count_tickets(session, tid, "priority")

    ai_resolution_rate = 0
    if chats_total:
        ai_resolved = await store.count_by_tenant(session, ChatSession, tid, status="ai")
        ai_resolution_rate = round((ai_resolved / chats_total) * 100)

    ticket_analytics = await store.compute_ticket_analytics(session, tid)

    return {
        "tickets": {
            "total": total_tickets,
            "open": open_tickets,
            "closed": closed,
            **ticket_analytics["overview"],
        },
        "due_dates": ticket_analytics["due_dates"],
        "user_performance": ticket_analytics["user_performance"],
        "recent": ticket_analytics["recent"],
        "chats": {"total": chats_total, "live": live_chats, "ai": ai_chats},
        "knowledge": {"docs": kb_total},
        "users": {"total": users_total},
        "by_status": by_status,
        "by_category": by_category,
        "by_priority": by_priority,
        "priority_open": ticket_analytics["by_priority"],
        "qa": ticket_analytics["qa"],
        "ai_resolution_rate": ai_resolution_rate,
    }


# ====================== SUPER ADMIN ======================
@api.post("/admin/tenants")
async def admin_create_tenant(
    body: AdminTenantCreate,
    u=Depends(require_super_admin),
    session: AsyncSession = Depends(get_session),
):
    if await store.get_user_by_email(session, body.admin_email):
        raise HTTPException(400, "Admin email already registered")

    tenant_id = _gen_id()
    slug = slugify(body.company_name)
    if await store.get_tenant_by_slug(session, slug):
        slug = f"{slug}-{_gen_id()[:4]}"
    now = _utc_now_iso()
    trial_end = (datetime.now(timezone.utc) + timedelta(days=14)).isoformat()
    modules = store.normalize_modules(body.modules.model_dump())

    tenant = Tenant(
        id=tenant_id,
        name=body.company_name,
        slug=slug,
        client_id=f"botaai_{_gen_id()[:12]}",
        client_secret=_gen_id().replace("-", ""),
        status=body.status,
        plan=body.plan,
        max_spaces=max(0, int(body.max_spaces)),
        trial_ends_at=trial_end,
        created_at=now,
        branding={
            "primary_color": "#002FA7",
            "logo_url": None,
            "greeting": f"Welcome to {body.company_name}! 👋",
        },
        modules=modules,
    )
    session.add(tenant)

    user = User(
        id=_gen_id(),
        email=body.admin_email,
        name=body.admin_name,
        password_hash=hash_password(body.admin_password),
        role="admin",
        tenant_id=tenant_id,
        active=True,
        created_at=now,
    )
    session.add(user)

    await store.provision_tenant_products(session, tenant_id, body.company_name, modules, now)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(400, "Could not create tenant")

    await session.refresh(tenant)
    out = store.tenant_out(tenant)
    out["client_secret"] = tenant.client_secret
    out["admin_email"] = body.admin_email
    return out


@api.get("/admin/tenants")
async def admin_list_tenants(
    u=Depends(require_super_admin), session: AsyncSession = Depends(get_session)
):
    tenants = (
        await session.execute(select(Tenant).order_by(Tenant.created_at.desc()).limit(500))
    ).scalars().all()
    result = []
    for t in tenants:
        await store.sync_tenant_module_spaces(session, t.id)
        await session.flush()
        boards = await store.list_tenant_spaces(session, t.id)
        out = store.tenant_out(t)
        out["user_count"] = (
            await session.execute(
                select(func.count()).select_from(User).where(User.tenant_id == t.id)
            )
        ).scalar_one()
        out["ticket_count"] = (
            await session.execute(
                select(func.count()).select_from(Ticket).where(Ticket.tenant_id == t.id)
            )
        ).scalar_one()
        out["chat_count"] = (
            await session.execute(
                select(func.count())
                .select_from(ChatSession)
                .where(ChatSession.tenant_id == t.id)
            )
        ).scalar_one()
        out["space_count"] = len(boards)
        out["max_spaces"] = store.effective_max_spaces(t)
        out["modules"] = store.tenant_modules(t)
        out["has_general_board"] = any(s.slug == "general" for s in boards)
        out["has_customer_board"] = (
            store.tenant_modules(t)["bot"]
            and any(s.slug == CUSTOMER_SPACE_SLUG for s in boards)
        )
        customer_space = next((s for s in boards if s.slug == CUSTOMER_SPACE_SLUG), None)
        out["customer_ticket_count"] = (
            await session.execute(
                select(func.count()).select_from(Ticket).where(
                    Ticket.tenant_id == t.id,
                    Ticket.space_id == customer_space.id,
                )
            )
        ).scalar_one() if customer_space else 0
        result.append(out)
    await session.commit()
    return result


@api.patch("/admin/tenants/{tenant_id}")
async def admin_patch_tenant(
    tenant_id: str,
    body: TenantUpdate,
    u=Depends(require_super_admin),
    session: AsyncSession = Depends(get_session),
):
    changes = {k: v for k, v in body.model_dump(exclude_none=True, mode="json").items()}
    if "modules" in changes and changes["modules"] is not None:
        changes["modules"] = store.normalize_modules(changes["modules"])
    if "max_spaces" in changes and changes["max_spaces"] is not None:
        changes["max_spaces"] = max(0, int(changes["max_spaces"]))
    if changes:
        await session.execute(
            update(Tenant).where(Tenant.id == tenant_id).values(**changes)
        )
        await session.flush()
        if "modules" in changes:
            await store.sync_tenant_module_spaces(session, tenant_id)
        await session.commit()
    t = await store.get_tenant_by_id(session, tenant_id)
    return store.tenant_out(t)


@api.post("/admin/tenants/{tenant_id}/provision-boards")
async def admin_provision_boards(
    tenant_id: str,
    u=Depends(require_super_admin),
    session: AsyncSession = Depends(get_session),
):
    t = await store.get_tenant_by_id(session, tenant_id)
    if not t:
        raise HTTPException(404, "Tenant not found")
    boards = await store.sync_tenant_module_spaces(session, tenant_id)
    rows = list(
        (await session.execute(select(Ticket).where(Ticket.tenant_id == tenant_id))).scalars().all()
    )
    moved = 0
    customer = boards.get("customer")
    if customer:
        customer_id = customer.id
        for ticket in rows:
            if store.is_customer_ticket(ticket) and ticket.space_id != customer_id:
                ticket.space_id = customer_id
                labels = list(ticket.labels or [])
                if "customer" not in labels:
                    labels.append("customer")
                    ticket.labels = labels
                moved += 1
    await session.commit()
    return {
        "ok": True,
        "boards": {k: store.space_out(v, 0) for k, v in boards.items()},
        "tickets_moved_to_customer_inbox": moved,
    }


@api.delete("/admin/tenants/{tenant_id}")
async def admin_delete_tenant(
    tenant_id: str, u=Depends(require_super_admin), session: AsyncSession = Depends(get_session)
):
    await session.execute(delete(Tenant).where(Tenant.id == tenant_id))
    await session.execute(delete(User).where(User.tenant_id == tenant_id))
    await session.execute(delete(Bot).where(Bot.tenant_id == tenant_id))
    await session.execute(delete(KBDoc).where(KBDoc.tenant_id == tenant_id))
    await session.execute(delete(KBChunk).where(KBChunk.tenant_id == tenant_id))
    await session.execute(delete(Space).where(Space.tenant_id == tenant_id))
    await session.execute(delete(Ticket).where(Ticket.tenant_id == tenant_id))
    await session.execute(delete(ChatSession).where(ChatSession.tenant_id == tenant_id))
    await session.execute(delete(ChatMessage).where(ChatMessage.tenant_id == tenant_id))
    await session.execute(delete(Notification).where(Notification.tenant_id == tenant_id))
    await session.commit()
    return {"ok": True}


@api.get("/admin/stats")
async def admin_stats(u=Depends(require_super_admin), session: AsyncSession = Depends(get_session)):
    return {
        "tenants": (await session.execute(select(func.count()).select_from(Tenant))).scalar_one(),
        "users": (await session.execute(select(func.count()).select_from(User))).scalar_one(),
        "tickets": (await session.execute(select(func.count()).select_from(Ticket))).scalar_one(),
        "chats": (
            await session.execute(select(func.count()).select_from(ChatSession))
        ).scalar_one(),
        "kb_docs": (await session.execute(select(func.count()).select_from(KBDoc))).scalar_one(),
    }


# ====================== STARTUP ======================
@app.on_event("startup")
async def on_startup():
    await init_db()
    await backfill_spaces()
    await repair_legacy_overdue_status()
    async with SessionLocal() as session:
        await store.backfill_customer_boards(session)
        await session.commit()
    async with SessionLocal() as session:
        existing = (
            await session.execute(select(User).where(User.role == "super_admin").limit(1))
        ).scalar_one_or_none()
        if not existing:
            session.add(
                User(
                    id=_gen_id(),
                    email="super@botaai.io",
                    name="Super Admin",
                    password_hash=hash_password("SuperAdmin@123"),
                    role="super_admin",
                    tenant_id=None,
                    active=True,
                    created_at=_utc_now_iso(),
                )
            )
            await session.commit()


@api.websocket("/ws/chat/{session_id}")
async def ws_chat_room(
    websocket: WebSocket,
    session_id: str,
    token: Optional[str] = Query(None),
    client_id: Optional[str] = Query(None),
):
    await websocket.accept()
    agent_ctx = None
    async with SessionLocal() as db:
        cs = await _get_chat_session_row(db, session_id)
        if not cs:
            await websocket.close(code=4404, reason="Session not found")
            return
        if token:
            payload = decode_token_safe(token)
            if not payload or payload.get("tenant_id") != cs.tenant_id:
                await websocket.close(code=4403, reason="Forbidden")
                return
            user_doc = await store.get_user_by_id(db, payload["sub"])
            agent_ctx = {
                "user_id": payload["sub"],
                "user_name": user_doc.name if user_doc else "Agent",
                "tenant_id": cs.tenant_id,
            }
        elif client_id:
            t = await store.get_tenant_by_client_id(db, client_id)
            if not t or t.id != cs.tenant_id:
                await websocket.close(code=4403, reason="Forbidden")
                return
        else:
            await websocket.close(code=4401, reason="Auth required")
            return

    if agent_ctx:
        await hub.register_agent_chat(
            websocket,
            session_id,
            agent_ctx["tenant_id"],
            agent_ctx["user_id"],
            agent_ctx["user_name"],
        )
    else:
        await hub.register_chat(websocket, session_id)

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
                if data.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
                elif data.get("type") == "presence" and agent_ctx:
                    state = data.get("state", "viewing")
                    if state in ("viewing", "typing", "idle"):
                        await hub.set_presence_state(
                            websocket, state, agent_ctx["tenant_id"]
                        )
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        pass
    finally:
        await hub.disconnect_chat(websocket, session_id)


@api.websocket("/ws/agent")
async def ws_agent_feed(websocket: WebSocket, token: Optional[str] = Query(None)):
    await websocket.accept()
    if not token:
        await websocket.close(code=4401, reason="Missing token")
        return
    payload = decode_token_safe(token)
    tenant_id = payload.get("tenant_id") if payload else None
    if not tenant_id:
        await websocket.close(code=4403, reason="Invalid token")
        return

    await hub.register_agent(websocket, tenant_id)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
                if data.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        pass
    finally:
        await hub.disconnect_agent(websocket, tenant_id)


app.include_router(api)
DEFAULT_CORS_ORIGINS = (
    "http://localhost:3000,"
    "http://localhost:3001,"
    "http://localhost:3005,"
    "http://localhost:3010,"
    "http://127.0.0.1:3000,"
    "http://127.0.0.1:3001,"
    "http://127.0.0.1:3005,"
    "http://127.0.0.1:3010"
)


def _cors_settings():
    raw = os.environ.get("CORS_ORIGINS", DEFAULT_CORS_ORIGINS).strip()
    if raw == "*":
        return {"allow_origins": ["*"], "allow_credentials": False}
    origins = [o.strip() for o in raw.split(",") if o.strip()]
    return {"allow_origins": origins, "allow_credentials": True}


_cors = _cors_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors["allow_origins"],
    allow_credentials=_cors["allow_credentials"],
    allow_methods=["*"],
    allow_headers=["*"],
)
