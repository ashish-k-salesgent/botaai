"""BotAAI - AI Customer Support & Ticket Management SaaS - FastAPI backend."""
import os
import re
import uuid
import asyncio
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Optional, Dict, Any

from fastapi import FastAPI, APIRouter, Depends, HTTPException, Query
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pydantic import BaseModel

from models import (
    UserCreate, UserOut, LoginInput, SignupInput,
    TenantOut, TenantUpdate,
    BotInput, BotOut,
    KBDocOut, KBDocCreate,
    TicketCreate, TicketOut, TicketUpdate,
    ChatSessionOut, ChatMessageIn, ChatMessageOut,
    NotificationOut,
    _gen_id, _utc_now_iso,
)
from auth import (
    hash_password, verify_password, create_token,
    get_current_user, require_super_admin, require_tenant,
)
from rag import (
    chunk_text, embed, search_chunks,
    answer_with_rag, classify_message,
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ---------- DB ----------
client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

# Collections
users = db.users
tenants = db.tenants
bots = db.bots
kb_docs = db.kb_docs
kb_chunks = db.kb_chunks
tickets = db.tickets
chat_sessions = db.chat_sessions
chat_messages = db.chat_messages
notifications = db.notifications
counters = db.counters


# ---------- Helpers ----------
def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9-]+", "-", name.lower()).strip("-") or _gen_id()[:6]


def clean(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not doc:
        return None
    doc.pop("_id", None)
    return doc


async def next_ticket_code(tenant_id: str) -> str:
    res = await counters.find_one_and_update(
        {"key": f"ticket_seq:{tenant_id}"},
        {"$inc": {"value": 1}},
        upsert=True,
        return_document=True,
    )
    seq = res.get("value", 1) if res else 1
    return f"BOTAAI-{100 + seq}"


async def create_notification(tenant_id: str, title: str, body: str, ntype: str, user_id: Optional[str] = None, link: Optional[str] = None):
    doc = {
        "id": _gen_id(),
        "tenant_id": tenant_id,
        "user_id": user_id,
        "title": title,
        "body": body,
        "type": ntype,
        "link": link,
        "read": False,
        "created_at": _utc_now_iso(),
    }
    await notifications.insert_one(doc)


async def get_default_bot(tenant_id: str) -> Optional[Dict[str, Any]]:
    return clean(await bots.find_one({"tenant_id": tenant_id}))


# ---------- App ----------
app = FastAPI(title="BotAAI API")
api = APIRouter(prefix="/api")


@api.get("/")
async def root():
    return {"service": "BotAAI", "status": "online"}


# ====================== AUTH ======================
@api.post("/auth/signup")
async def signup(payload: SignupInput):
    if await users.find_one({"email": payload.email}):
        raise HTTPException(400, "Email already registered")

    tenant_id = _gen_id()
    slug = slugify(payload.company_name)
    if await tenants.find_one({"slug": slug}):
        slug = f"{slug}-{_gen_id()[:4]}"
    now = _utc_now_iso()
    trial_end = (datetime.now(timezone.utc) + timedelta(days=14)).isoformat()

    tenant_doc = {
        "id": tenant_id,
        "name": payload.company_name,
        "slug": slug,
        "client_id": f"botaai_{_gen_id()[:12]}",
        "client_secret": _gen_id().replace("-", ""),
        "status": "trial",
        "plan": "trial",
        "trial_ends_at": trial_end,
        "created_at": now,
        "branding": {
            "primary_color": "#002FA7",
            "logo_url": None,
            "greeting": f"Welcome to {payload.company_name}! 👋",
        },
    }
    await tenants.insert_one(tenant_doc)

    user_id = _gen_id()
    user_doc = {
        "id": user_id,
        "email": payload.email,
        "name": payload.name,
        "password_hash": hash_password(payload.password),
        "role": "admin",
        "tenant_id": tenant_id,
        "active": True,
        "created_at": now,
    }
    await users.insert_one(user_doc)

    # Auto-create a default bot
    bot_id = _gen_id()
    await bots.insert_one({
        "id": bot_id,
        "tenant_id": tenant_id,
        "name": f"{payload.company_name} Bot",
        "avatar": None,
        "greeting": f"Hello! 👋 Welcome to {payload.company_name}. How can I help today?",
        "theme_color": "#002FA7",
        "system_prompt": f"You are the customer-support AI for {payload.company_name}. Be concise, friendly, and only answer from the knowledge base.",
        "language": "en",
        "fallback_message": "Let me create a support ticket for our team.",
        "temperature": 0.4,
        "model": "gemini-3-flash-preview",
        "confidence_threshold": 0.15,
        "working_hours": "24/7",
        "created_at": now,
    })

    token = create_token(user_id, "admin", tenant_id)
    return {
        "token": token,
        "user": {"id": user_id, "email": payload.email, "name": payload.name, "role": "admin", "tenant_id": tenant_id},
        "tenant": clean(tenant_doc),
    }


@api.post("/auth/login")
async def login(payload: LoginInput):
    user = await users.find_one({"email": payload.email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    if not user.get("active", True):
        raise HTTPException(403, "Account disabled")
    token = create_token(user["id"], user["role"], user.get("tenant_id"))
    tenant = None
    if user.get("tenant_id"):
        tenant = clean(await tenants.find_one({"id": user["tenant_id"]}))
    return {
        "token": token,
        "user": {k: user[k] for k in ("id", "email", "name", "role", "tenant_id")},
        "tenant": tenant,
    }


@api.get("/auth/me")
async def me(u=Depends(get_current_user)):
    user = clean(await users.find_one({"id": u["user_id"]}))
    if not user:
        raise HTTPException(404, "User not found")
    user.pop("password_hash", None)
    tenant = None
    if user.get("tenant_id"):
        tenant = clean(await tenants.find_one({"id": user["tenant_id"]}))
    return {"user": user, "tenant": tenant}


# ====================== TENANT (current) ======================
@api.get("/tenant")
async def get_my_tenant(u=Depends(require_tenant)):
    t = clean(await tenants.find_one({"id": u["tenant_id"]}))
    if not t:
        raise HTTPException(404, "Tenant not found")
    return t


@api.patch("/tenant")
async def patch_my_tenant(body: TenantUpdate, u=Depends(require_tenant)):
    changes = {k: v for k, v in body.model_dump(exclude_none=True).items() if k in ("name", "branding")}
    if not changes:
        return {"ok": True}
    await tenants.update_one({"id": u["tenant_id"]}, {"$set": changes})
    return clean(await tenants.find_one({"id": u["tenant_id"]}))


# ====================== BOTS ======================
@api.get("/bots")
async def list_bots(u=Depends(require_tenant)):
    items = await bots.find({"tenant_id": u["tenant_id"]}, {"_id": 0}).to_list(100)
    return items


@api.post("/bots")
async def create_bot(body: BotInput, u=Depends(require_tenant)):
    doc = {
        "id": _gen_id(),
        "tenant_id": u["tenant_id"],
        "created_at": _utc_now_iso(),
        **body.model_dump(),
    }
    await bots.insert_one(doc)
    return clean(doc)


@api.patch("/bots/{bot_id}")
async def update_bot(bot_id: str, body: BotInput, u=Depends(require_tenant)):
    await bots.update_one(
        {"id": bot_id, "tenant_id": u["tenant_id"]},
        {"$set": body.model_dump()},
    )
    return clean(await bots.find_one({"id": bot_id, "tenant_id": u["tenant_id"]}))


@api.delete("/bots/{bot_id}")
async def delete_bot(bot_id: str, u=Depends(require_tenant)):
    await bots.delete_one({"id": bot_id, "tenant_id": u["tenant_id"]})
    return {"ok": True}


# ====================== KNOWLEDGE BASE ======================
@api.get("/knowledge")
async def list_kb(u=Depends(require_tenant)):
    items = await kb_docs.find({"tenant_id": u["tenant_id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return items


@api.post("/knowledge")
async def add_kb(body: KBDocCreate, u=Depends(require_tenant)):
    doc_id = _gen_id()
    now = _utc_now_iso()
    # chunk + embed (simple BoW)
    chunks = chunk_text(body.content)
    chunk_docs = []
    for i, c in enumerate(chunks):
        chunk_docs.append({
            "id": _gen_id(),
            "doc_id": doc_id,
            "tenant_id": u["tenant_id"],
            "bot_id": body.bot_id,
            "index": i,
            "text": c,
            "title": body.title,
            "embedding": embed(c),
            "created_at": now,
        })
    if chunk_docs:
        await kb_chunks.insert_many(chunk_docs)
    doc = {
        "id": doc_id,
        "tenant_id": u["tenant_id"],
        "bot_id": body.bot_id,
        "title": body.title,
        "source_type": body.source_type,
        "status": "ready",
        "chunk_count": len(chunk_docs),
        "content_preview": body.content[:240],
        "created_at": now,
    }
    await kb_docs.insert_one(doc)
    return clean(doc)


@api.delete("/knowledge/{doc_id}")
async def delete_kb(doc_id: str, u=Depends(require_tenant)):
    await kb_docs.delete_one({"id": doc_id, "tenant_id": u["tenant_id"]})
    await kb_chunks.delete_many({"doc_id": doc_id, "tenant_id": u["tenant_id"]})
    return {"ok": True}


class KBSearchInput(BaseModel):
    query: str
    top_k: int = 4


@api.post("/knowledge/search")
async def search_kb(body: KBSearchInput, u=Depends(require_tenant)):
    chunks = await kb_chunks.find({"tenant_id": u["tenant_id"]}, {"_id": 0}).to_list(5000)
    return search_chunks(body.query, chunks, top_k=body.top_k)


# ====================== TICKETS ======================
@api.get("/tickets")
async def list_tickets(u=Depends(require_tenant), status: Optional[str] = None):
    q = {"tenant_id": u["tenant_id"]}
    if status:
        q["status"] = status
    items = await tickets.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return items


@api.post("/tickets")
async def create_ticket(body: TicketCreate, u=Depends(require_tenant)):
    user_doc = await users.find_one({"id": u["user_id"]})
    code = await next_ticket_code(u["tenant_id"])
    now = _utc_now_iso()
    doc = {
        "id": _gen_id(),
        "code": code,
        "tenant_id": u["tenant_id"],
        "title": body.title,
        "description": body.description,
        "status": "new",
        "priority": body.priority,
        "category": body.category,
        "sentiment": "neutral",
        "urgency_score": 50,
        "assignee_id": None,
        "assignee_name": None,
        "reporter_id": u["user_id"],
        "reporter_name": user_doc.get("name") if user_doc else None,
        "reporter_email": body.reporter_email or (user_doc.get("email") if user_doc else None),
        "labels": body.labels,
        "comments": [],
        "activity": [{"at": now, "by": user_doc.get("name") if user_doc else "system", "event": "created"}],
        "created_at": now,
        "updated_at": now,
    }
    await tickets.insert_one(doc)
    await create_notification(u["tenant_id"], f"New ticket {code}", body.title, "ticket", link=f"/app/tickets/{doc['id']}")
    return clean(doc)


@api.get("/tickets/{ticket_id}")
async def get_ticket(ticket_id: str, u=Depends(require_tenant)):
    t = clean(await tickets.find_one({"id": ticket_id, "tenant_id": u["tenant_id"]}))
    if not t:
        raise HTTPException(404, "Ticket not found")
    return t


@api.patch("/tickets/{ticket_id}")
async def update_ticket(ticket_id: str, body: TicketUpdate, u=Depends(require_tenant)):
    updates = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if not updates:
        return await get_ticket(ticket_id, u)
    updates["updated_at"] = _utc_now_iso()
    if "assignee_id" in updates and updates["assignee_id"]:
        a = await users.find_one({"id": updates["assignee_id"], "tenant_id": u["tenant_id"]})
        updates["assignee_name"] = a.get("name") if a else None
    user_doc = await users.find_one({"id": u["user_id"]})
    activity = {"at": _utc_now_iso(), "by": user_doc.get("name") if user_doc else "system", "event": "updated", "changes": list(updates.keys())}
    await tickets.update_one(
        {"id": ticket_id, "tenant_id": u["tenant_id"]},
        {"$set": updates, "$push": {"activity": activity}},
    )
    return clean(await tickets.find_one({"id": ticket_id, "tenant_id": u["tenant_id"]}))


class CommentInput(BaseModel):
    body: str


@api.post("/tickets/{ticket_id}/comments")
async def add_comment(ticket_id: str, body: CommentInput, u=Depends(require_tenant)):
    user_doc = await users.find_one({"id": u["user_id"]})
    comment = {
        "id": _gen_id(),
        "author_id": u["user_id"],
        "author_name": user_doc.get("name") if user_doc else "user",
        "body": body.body,
        "created_at": _utc_now_iso(),
    }
    await tickets.update_one(
        {"id": ticket_id, "tenant_id": u["tenant_id"]},
        {"$push": {"comments": comment}, "$set": {"updated_at": _utc_now_iso()}},
    )
    return comment


@api.delete("/tickets/{ticket_id}")
async def delete_ticket(ticket_id: str, u=Depends(require_tenant)):
    await tickets.delete_one({"id": ticket_id, "tenant_id": u["tenant_id"]})
    return {"ok": True}


# ====================== USERS (tenant) ======================
@api.get("/users")
async def list_users(u=Depends(require_tenant)):
    items = await users.find({"tenant_id": u["tenant_id"]}, {"_id": 0, "password_hash": 0}).to_list(500)
    return items


@api.post("/users")
async def add_user(body: UserCreate, u=Depends(require_tenant)):
    if await users.find_one({"email": body.email}):
        raise HTTPException(400, "Email exists")
    doc = {
        "id": _gen_id(),
        "email": body.email,
        "name": body.name,
        "role": body.role,
        "tenant_id": u["tenant_id"],
        "password_hash": hash_password(body.password),
        "active": True,
        "created_at": _utc_now_iso(),
    }
    await users.insert_one(doc)
    doc.pop("password_hash", None)
    return clean(doc)


class UserPatch(BaseModel):
    role: Optional[str] = None
    active: Optional[bool] = None
    name: Optional[str] = None


@api.patch("/users/{user_id}")
async def patch_user(user_id: str, body: UserPatch, u=Depends(require_tenant)):
    updates = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if updates:
        await users.update_one(
            {"id": user_id, "tenant_id": u["tenant_id"]},
            {"$set": updates},
        )
    return clean(await users.find_one({"id": user_id, "tenant_id": u["tenant_id"]}, {"_id": 0, "password_hash": 0}))


@api.delete("/users/{user_id}")
async def delete_user(user_id: str, u=Depends(require_tenant)):
    if user_id == u["user_id"]:
        raise HTTPException(400, "Cannot delete yourself")
    await users.delete_one({"id": user_id, "tenant_id": u["tenant_id"]})
    return {"ok": True}


# ====================== CHAT (live + AI) ======================
@api.get("/chats")
async def list_chats(u=Depends(require_tenant)):
    items = await chat_sessions.find({"tenant_id": u["tenant_id"]}, {"_id": 0}).sort("last_message_at", -1).to_list(500)
    return items


@api.get("/chats/{session_id}/messages")
async def list_messages(session_id: str, u=Depends(require_tenant)):
    items = await chat_messages.find({"session_id": session_id, "tenant_id": u["tenant_id"]}, {"_id": 0}).sort("created_at", 1).to_list(2000)
    return items


@api.post("/chats/{session_id}/messages")
async def post_agent_message(session_id: str, body: ChatMessageIn, u=Depends(require_tenant)):
    user_doc = await users.find_one({"id": u["user_id"]})
    msg = {
        "id": _gen_id(),
        "session_id": session_id,
        "tenant_id": u["tenant_id"],
        "text": body.text,
        "sender": "agent",
        "sender_name": user_doc.get("name") if user_doc else "Agent",
        "created_at": _utc_now_iso(),
    }
    await chat_messages.insert_one(msg)
    await chat_sessions.update_one(
        {"id": session_id, "tenant_id": u["tenant_id"]},
        {"$set": {"last_message_at": msg["created_at"], "status": "live", "agent_id": u["user_id"]}},
    )
    return clean(msg)


class AssignInput(BaseModel):
    pass


@api.post("/chats/{session_id}/claim")
async def claim_chat(session_id: str, u=Depends(require_tenant)):
    await chat_sessions.update_one(
        {"id": session_id, "tenant_id": u["tenant_id"]},
        {"$set": {"status": "live", "agent_id": u["user_id"]}},
    )
    return {"ok": True}


@api.post("/chats/{session_id}/close")
async def close_chat(session_id: str, u=Depends(require_tenant)):
    await chat_sessions.update_one(
        {"id": session_id, "tenant_id": u["tenant_id"]},
        {"$set": {"status": "closed"}},
    )
    return {"ok": True}


# ====================== PUBLIC WIDGET ENDPOINTS ======================
class WidgetInit(BaseModel):
    client_id: str
    visitor_name: Optional[str] = "Guest"
    visitor_email: Optional[str] = None


@api.post("/widget/init")
async def widget_init(body: WidgetInit):
    t = await tenants.find_one({"client_id": body.client_id})
    if not t:
        raise HTTPException(404, "Unknown client")
    bot = await get_default_bot(t["id"])
    session_id = _gen_id()
    now = _utc_now_iso()
    await chat_sessions.insert_one({
        "id": session_id,
        "tenant_id": t["id"],
        "bot_id": bot["id"] if bot else None,
        "visitor_name": body.visitor_name or "Guest",
        "visitor_email": body.visitor_email,
        "status": "ai",
        "agent_id": None,
        "created_at": now,
        "last_message_at": now,
        "unread": 0,
    })
    greeting = bot["greeting"] if bot else "Hello! How can I help today?"
    # Save greeting message
    await chat_messages.insert_one({
        "id": _gen_id(),
        "session_id": session_id,
        "tenant_id": t["id"],
        "text": greeting,
        "sender": "bot",
        "sender_name": bot["name"] if bot else "Bot",
        "created_at": now,
    })
    return {
        "session_id": session_id,
        "tenant": {"name": t["name"], "branding": t.get("branding", {})},
        "bot": {"name": bot["name"], "greeting": greeting, "theme_color": bot.get("theme_color", "#002FA7")} if bot else None,
        "greeting": greeting,
    }


class WidgetMessage(BaseModel):
    session_id: str
    text: str


@api.post("/widget/message")
async def widget_message(body: WidgetMessage):
    session = await chat_sessions.find_one({"id": body.session_id})
    if not session:
        raise HTTPException(404, "Session not found")
    tenant_id = session["tenant_id"]
    now = _utc_now_iso()

    # Save user message
    user_msg = {
        "id": _gen_id(),
        "session_id": body.session_id,
        "tenant_id": tenant_id,
        "text": body.text,
        "sender": "user",
        "sender_name": session.get("visitor_name", "Visitor"),
        "created_at": now,
    }
    await chat_messages.insert_one(user_msg)

    # If live agent has claimed, don't auto-respond
    if session.get("status") == "live":
        await chat_sessions.update_one(
            {"id": body.session_id},
            {"$set": {"last_message_at": now}, "$inc": {"unread": 1}},
        )
        return {"user_message": clean(user_msg), "bot_message": None, "ticket": None}

    # Classify + RAG in parallel
    chunks_task = kb_chunks.find({"tenant_id": tenant_id}, {"_id": 0}).to_list(5000)
    classify_task = classify_message(body.text, body.session_id)
    chunks, classification = await asyncio.gather(chunks_task, classify_task)

    bot = await get_default_bot(tenant_id) or {"system_prompt": "Helpful assistant.", "model": "gemini-3-flash-preview", "fallback_message": "I'll create a ticket."}
    rag = await answer_with_rag(body.text, chunks, bot, body.session_id)

    bot_text = rag["answer"]
    confidence = rag["confidence"]

    bot_msg = {
        "id": _gen_id(),
        "session_id": body.session_id,
        "tenant_id": tenant_id,
        "text": bot_text,
        "sender": "bot",
        "sender_name": bot.get("name", "Bot"),
        "created_at": _utc_now_iso(),
        "meta": {
            "confidence": confidence,
            "sources": rag.get("sources", []),
            "classification": classification,
        },
    }
    await chat_messages.insert_one(bot_msg)

    # Auto-create ticket if ticket worthy
    ticket = None
    if classification.get("is_ticket_worthy"):
        code = await next_ticket_code(tenant_id)
        ticket_doc = {
            "id": _gen_id(),
            "code": code,
            "tenant_id": tenant_id,
            "title": (body.text[:80] + ("..." if len(body.text) > 80 else "")),
            "description": body.text,
            "status": "new",
            "priority": classification.get("priority", "medium"),
            "category": classification.get("category", "Bug"),
            "sentiment": classification.get("sentiment", "neutral"),
            "urgency_score": int(classification.get("urgency_score", 50)),
            "assignee_id": None,
            "assignee_name": None,
            "reporter_id": None,
            "reporter_name": session.get("visitor_name", "Visitor"),
            "reporter_email": session.get("visitor_email"),
            "labels": ["auto-created"],
            "comments": [],
            "activity": [{"at": _utc_now_iso(), "by": "AI", "event": "auto-created from chat"}],
            "chat_session_id": body.session_id,
            "created_at": _utc_now_iso(),
            "updated_at": _utc_now_iso(),
        }
        await tickets.insert_one(ticket_doc)
        await create_notification(tenant_id, f"New ticket {code}", ticket_doc["title"], "ticket", link=f"/app/tickets/{ticket_doc['id']}")
        ticket = clean(ticket_doc)

    await chat_sessions.update_one(
        {"id": body.session_id},
        {"$set": {"last_message_at": bot_msg["created_at"], "last_classification": classification}},
    )

    return {"user_message": clean(user_msg), "bot_message": clean(bot_msg), "ticket": ticket}


@api.get("/widget/messages/{session_id}")
async def widget_messages(session_id: str):
    items = await chat_messages.find({"session_id": session_id}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    return items


class EscalateInput(BaseModel):
    session_id: str
    reason: Optional[str] = "User requested human"


@api.post("/widget/escalate")
async def widget_escalate(body: EscalateInput):
    session = await chat_sessions.find_one({"id": body.session_id})
    if not session:
        raise HTTPException(404, "Session not found")
    await chat_sessions.update_one(
        {"id": body.session_id},
        {"$set": {"status": "queue"}},
    )
    await create_notification(
        session["tenant_id"],
        "New chat in queue",
        f"{session.get('visitor_name','Visitor')} wants to talk to a human.",
        "chat",
        link=f"/app/chats/{body.session_id}",
    )
    return {"ok": True, "status": "queue"}


# ====================== NOTIFICATIONS ======================
@api.get("/notifications")
async def list_notifications(u=Depends(require_tenant)):
    items = await notifications.find({"tenant_id": u["tenant_id"]}, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)
    return items


@api.post("/notifications/read-all")
async def read_all_notifications(u=Depends(require_tenant)):
    await notifications.update_many({"tenant_id": u["tenant_id"], "read": False}, {"$set": {"read": True}})
    return {"ok": True}


# ====================== ANALYTICS ======================
@api.get("/analytics/summary")
async def analytics_summary(u=Depends(require_tenant)):
    tid = u["tenant_id"]
    total_tickets = await tickets.count_documents({"tenant_id": tid})
    open_tickets = await tickets.count_documents({"tenant_id": tid, "status": {"$nin": ["done", "closed"]}})
    closed = await tickets.count_documents({"tenant_id": tid, "status": {"$in": ["done", "closed"]}})
    chats_total = await chat_sessions.count_documents({"tenant_id": tid})
    live_chats = await chat_sessions.count_documents({"tenant_id": tid, "status": {"$in": ["queue", "live"]}})
    ai_chats = await chat_sessions.count_documents({"tenant_id": tid, "status": "ai"})
    kb_total = await kb_docs.count_documents({"tenant_id": tid})
    users_total = await users.count_documents({"tenant_id": tid})

    # by status
    pipeline = [
        {"$match": {"tenant_id": tid}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]
    by_status = {d["_id"]: d["count"] async for d in tickets.aggregate(pipeline)}

    pipeline2 = [
        {"$match": {"tenant_id": tid}},
        {"$group": {"_id": "$category", "count": {"$sum": 1}}},
    ]
    by_category = {d["_id"]: d["count"] async for d in tickets.aggregate(pipeline2)}

    pipeline3 = [
        {"$match": {"tenant_id": tid}},
        {"$group": {"_id": "$priority", "count": {"$sum": 1}}},
    ]
    by_priority = {d["_id"]: d["count"] async for d in tickets.aggregate(pipeline3)}

    ai_resolution_rate = 0
    if chats_total:
        # Resolved by AI = sessions never escalated
        ai_resolved = await chat_sessions.count_documents({"tenant_id": tid, "status": "ai"})
        ai_resolution_rate = round((ai_resolved / chats_total) * 100)

    return {
        "tickets": {"total": total_tickets, "open": open_tickets, "closed": closed},
        "chats": {"total": chats_total, "live": live_chats, "ai": ai_chats},
        "knowledge": {"docs": kb_total},
        "users": {"total": users_total},
        "by_status": by_status,
        "by_category": by_category,
        "by_priority": by_priority,
        "ai_resolution_rate": ai_resolution_rate,
    }


# ====================== SUPER ADMIN ======================
@api.get("/admin/tenants")
async def admin_list_tenants(u=Depends(require_super_admin)):
    items = await tenants.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    # Enrich with counts
    for t in items:
        t["user_count"] = await users.count_documents({"tenant_id": t["id"]})
        t["ticket_count"] = await tickets.count_documents({"tenant_id": t["id"]})
        t["chat_count"] = await chat_sessions.count_documents({"tenant_id": t["id"]})
    return items


@api.patch("/admin/tenants/{tenant_id}")
async def admin_patch_tenant(tenant_id: str, body: TenantUpdate, u=Depends(require_super_admin)):
    changes = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if changes:
        await tenants.update_one({"id": tenant_id}, {"$set": changes})
    return clean(await tenants.find_one({"id": tenant_id}))


@api.delete("/admin/tenants/{tenant_id}")
async def admin_delete_tenant(tenant_id: str, u=Depends(require_super_admin)):
    await tenants.delete_one({"id": tenant_id})
    await users.delete_many({"tenant_id": tenant_id})
    await bots.delete_many({"tenant_id": tenant_id})
    await kb_docs.delete_many({"tenant_id": tenant_id})
    await kb_chunks.delete_many({"tenant_id": tenant_id})
    await tickets.delete_many({"tenant_id": tenant_id})
    await chat_sessions.delete_many({"tenant_id": tenant_id})
    await chat_messages.delete_many({"tenant_id": tenant_id})
    return {"ok": True}


@api.get("/admin/stats")
async def admin_stats(u=Depends(require_super_admin)):
    return {
        "tenants": await tenants.count_documents({}),
        "users": await users.count_documents({}),
        "tickets": await tickets.count_documents({}),
        "chats": await chat_sessions.count_documents({}),
        "kb_docs": await kb_docs.count_documents({}),
    }


# ====================== STARTUP ======================
@app.on_event("startup")
async def seed_super_admin():
    if not await users.find_one({"role": "super_admin"}):
        await users.insert_one({
            "id": _gen_id(),
            "email": "super@botaai.io",
            "name": "Super Admin",
            "password_hash": hash_password("SuperAdmin@123"),
            "role": "super_admin",
            "tenant_id": None,
            "active": True,
            "created_at": _utc_now_iso(),
        })


@app.on_event("shutdown")
async def shutdown():
    client.close()


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
