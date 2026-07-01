"""PostgreSQL data-access helpers."""
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from file_storage import enrich_attachments

from ticket_helpers import (
    CUSTOMER_SPACE_SLUG,
    is_completed,
    is_customer_ticket,
    is_overdue,
    parse_due,
    qa_incomplete_in_qa,
    qa_scenario_stats,
)
from workflow import normalize_workflow_columns, qa_status_ids, terminal_status_ids
from permissions import normalize_config, resolve_permissions

from database import (
    Bot,
    ChatMessage,
    ChatSession,
    Counter,
    KBChunk,
    KBDoc,
    Notification,
    Space,
    Tenant,
    Ticket,
    User,
)

PLAN_DEFAULT_MAX_SPACES = {
    "trial": 1,
    "monthly": 3,
    "quarterly": 5,
    "yearly": 10,
    "custom": 50,
}

TRIAL_DAYS = 14

DEFAULT_MODULES = {"boards": True, "bot": True, "live_chat": True}
SYSTEM_SPACE_SLUGS = frozenset({"general", CUSTOMER_SPACE_SLUG})


def normalize_modules(raw: Optional[Any]) -> Dict[str, bool]:
    if raw is None:
        src: dict = {}
    elif hasattr(raw, "model_dump"):
        src = raw.model_dump()
    elif isinstance(raw, dict):
        src = raw
    else:
        src = {}
    modules = {
        "boards": bool(src.get("boards", DEFAULT_MODULES["boards"])),
        "bot": bool(src.get("bot", DEFAULT_MODULES["bot"])),
        "live_chat": bool(src.get("live_chat", DEFAULT_MODULES["live_chat"])),
    }
    if modules["live_chat"] and not modules["bot"]:
        modules["live_chat"] = False
    return modules


def tenant_modules(t: Optional[Tenant]) -> Dict[str, bool]:
    if not t:
        return dict(DEFAULT_MODULES)
    raw = t.modules if hasattr(t, "modules") else None
    return normalize_modules(raw)


def assert_tenant_module(t: Tenant, module: str) -> None:
    from fastapi import HTTPException

    mods = tenant_modules(t)
    if module == "live_chat":
        if not mods["bot"]:
            raise HTTPException(403, "Live chat requires the Bot module")
        if not mods["live_chat"]:
            raise HTTPException(403, "Live chat module is not enabled for this tenant")
        return
    if not mods.get(module):
        label = {"boards": "Boards", "bot": "Bot"}.get(module, module)
        raise HTTPException(403, f"{label} module is not enabled for this tenant")


def effective_max_spaces(t: Tenant) -> int:
    """Extra custom boards allowed (General + Customer Inbox are always free)."""
    if t.max_spaces is not None:
        return max(0, int(t.max_spaces))
    return PLAN_DEFAULT_MAX_SPACES.get(t.plan, 1)


def tenant_permission_config(t: Optional[Tenant]) -> Dict[str, Any]:
    if not t:
        return normalize_config(None)
    raw = t.permission_config if hasattr(t, "permission_config") else None
    return normalize_config(raw if raw else None)


async def get_tenant_permission_config(session: AsyncSession, tenant_id: str) -> Dict[str, Any]:
    t = await get_tenant_by_id(session, tenant_id)
    return tenant_permission_config(t)


def user_out(u: User, tenant_config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    overrides = u.permission_overrides if hasattr(u, "permission_overrides") else {}
    if overrides is None:
        overrides = {}
    return {
        "id": u.id,
        "email": u.email,
        "name": u.name,
        "role": u.role,
        "tenant_id": u.tenant_id,
        "active": u.active,
        "permission_overrides": overrides or {},
        "permissions": resolve_permissions(u.role, overrides, tenant_config),
        "created_at": u.created_at,
    }


def tenant_workflow_columns(t: Optional[Tenant]) -> List[Dict[str, Any]]:
    if not t:
        return normalize_workflow_columns(None)
    return normalize_workflow_columns(getattr(t, "workflow_columns", None))


def tenant_out(t: Tenant) -> Dict[str, Any]:
    return {
        "id": t.id,
        "name": t.name,
        "slug": t.slug,
        "client_id": t.client_id,
        "status": t.status,
        "plan": t.plan,
        "trial_ends_at": t.trial_ends_at,
        "created_at": t.created_at,
        "branding": t.branding or {},
        "max_spaces": effective_max_spaces(t),
        "modules": tenant_modules(t),
        "workflow_columns": tenant_workflow_columns(t),
    }


def _parse_iso_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        s = value.replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except (ValueError, TypeError):
        return None


async def sync_trial_expiry(session: AsyncSession, tenant: Tenant) -> Tenant:
    """Backfill missing trial end, auto-expire when past due."""
    if tenant.status != "trial":
        return tenant
    changed = False
    end = _parse_iso_dt(tenant.trial_ends_at)
    if not end:
        created = _parse_iso_dt(tenant.created_at) or datetime.now(timezone.utc)
        end = created + timedelta(days=TRIAL_DAYS)
        tenant.trial_ends_at = end.isoformat()
        changed = True
    if datetime.now(timezone.utc) >= end:
        tenant.status = "expired"
        changed = True
    if changed:
        await session.execute(
            update(Tenant)
            .where(Tenant.id == tenant.id)
            .values(status=tenant.status, trial_ends_at=tenant.trial_ends_at)
        )
        await session.commit()
    return tenant


def assert_tenant_access(t: Tenant) -> None:
    from fastapi import HTTPException

    if t.status == "expired":
        raise HTTPException(
            403,
            "Your 14-day trial has ended. Contact support to upgrade your plan.",
        )
    if t.status == "suspended":
        raise HTTPException(403, "Account suspended. Contact support.")


async def get_tenant_for_access(session: AsyncSession, tenant_id: str) -> Tenant:
    from fastapi import HTTPException

    t = await get_tenant_by_id(session, tenant_id)
    if not t:
        raise HTTPException(404, "Tenant not found")
    t = await sync_trial_expiry(session, t)
    assert_tenant_access(t)
    return t


def space_out(s: Space, ticket_count: int = 0) -> Dict[str, Any]:
    is_customer = s.slug == CUSTOMER_SPACE_SLUG
    is_system = s.slug in SYSTEM_SPACE_SLUGS
    return {
        "id": s.id,
        "tenant_id": s.tenant_id,
        "name": s.name,
        "slug": s.slug,
        "description": s.description or "",
        "color": s.color or "#002FA7",
        "is_default": s.is_default,
        "is_customer": is_customer,
        "is_system": is_system,
        "ticket_count": ticket_count,
        "created_at": s.created_at,
    }


def bot_out(b: Bot) -> Dict[str, Any]:
    return {
        "id": b.id,
        "tenant_id": b.tenant_id,
        "name": b.name,
        "avatar": b.avatar,
        "greeting": b.greeting,
        "theme_color": b.theme_color,
        "system_prompt": b.system_prompt,
        "language": b.language,
        "fallback_message": b.fallback_message,
        "temperature": b.temperature,
        "model": b.model,
        "confidence_threshold": b.confidence_threshold,
        "working_hours": b.working_hours,
        "created_at": b.created_at,
    }


def kb_doc_out(d: KBDoc) -> Dict[str, Any]:
    return {
        "id": d.id,
        "tenant_id": d.tenant_id,
        "bot_id": d.bot_id,
        "title": d.title,
        "source_type": d.source_type,
        "status": d.status,
        "chunk_count": d.chunk_count,
        "created_at": d.created_at,
    }


def ticket_out(t: Ticket, workflow_columns: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    cols = workflow_columns if workflow_columns is not None else normalize_workflow_columns(None)
    qa_ids = qa_status_ids(cols)
    terminal = terminal_status_ids(cols)
    assignees = list(t.assignees or [])
    if not assignees and t.assignee_id:
        assignees = [{"id": t.assignee_id, "name": t.assignee_name or ""}]
    return {
        "id": t.id,
        "code": t.code,
        "tenant_id": t.tenant_id,
        "space_id": t.space_id,
        "title": t.title,
        "description": t.description,
        "status": t.status,
        "priority": t.priority,
        "category": t.category,
        "sentiment": t.sentiment,
        "urgency_score": t.urgency_score,
        "assignee_id": t.assignee_id,
        "assignee_name": t.assignee_name,
        "assignees": assignees,
        "tags": t.tags or [],
        "blocked_by": t.blocked_by,
        "reporter_id": t.reporter_id,
        "reporter_name": t.reporter_name,
        "reporter_email": t.reporter_email,
        "labels": t.labels or [],
        "comments": t.comments or [],
        "activity": t.activity or [],
        "attachments": enrich_attachments(t.attachments),
        "due_date": parse_due(t.due_date) if hasattr(t, "due_date") else None,
        "is_overdue": is_overdue(t, terminal),
        "parent_id": getattr(t, "parent_id", None),
        "qa_scenarios": list(getattr(t, "qa_scenarios", None) or []),
        **qa_scenario_stats(t),
        "qa_incomplete": qa_incomplete_in_qa(t, qa_ids),
        "is_customer_ticket": is_customer_ticket(t),
        "created_at": t.created_at,
        "updated_at": t.updated_at,
    }


async def child_stats_for_parents(
    session: AsyncSession, tenant_id: str, parent_ids: List[str], terminal_ids: Optional[set] = None
) -> Dict[str, Dict[str, int]]:
    if not parent_ids:
        return {}
    children = list(
        (
            await session.execute(
                select(Ticket).where(
                    Ticket.tenant_id == tenant_id,
                    Ticket.parent_id.in_(parent_ids),
                )
            )
        ).scalars().all()
    )
    stats: Dict[str, Dict[str, int]] = {}
    for c in children:
        pid = c.parent_id
        if pid not in stats:
            stats[pid] = {"child_count": 0, "child_done": 0}
        stats[pid]["child_count"] += 1
        if is_completed(c.status, terminal_ids):
            stats[pid]["child_done"] += 1
    return stats


async def tickets_board_out(
    session: AsyncSession, tenant_id: str, rows: List[Ticket]
) -> List[Dict[str, Any]]:
    tenant = await get_tenant_by_id(session, tenant_id)
    workflow = tenant_workflow_columns(tenant)
    terminal = terminal_status_ids(workflow)
    parent_ids = [t.id for t in rows if not getattr(t, "parent_id", None)]
    child_parent_ids = list(
        {t.parent_id for t in rows if getattr(t, "parent_id", None)}
    )
    stats = await child_stats_for_parents(session, tenant_id, parent_ids, terminal)
    parent_codes: Dict[str, str] = {}
    if child_parent_ids:
        parents = list(
            (
                await session.execute(
                    select(Ticket).where(
                        Ticket.tenant_id == tenant_id,
                        Ticket.id.in_(child_parent_ids),
                    )
                )
            ).scalars().all()
        )
        parent_codes = {p.id: p.code for p in parents}
    out = []
    for t in rows:
        item = ticket_out(t, workflow)
        cs = stats.get(t.id, {"child_count": 0, "child_done": 0})
        item["child_count"] = cs["child_count"]
        item["child_done"] = cs["child_done"]
        pid = getattr(t, "parent_id", None)
        if pid and pid in parent_codes:
            item["parent_code"] = parent_codes[pid]
        out.append(item)
    return out


async def ticket_detail_out(session: AsyncSession, t: Ticket) -> Dict[str, Any]:
    tenant = await get_tenant_by_id(session, t.tenant_id)
    workflow = tenant_workflow_columns(tenant)
    out = ticket_out(t, workflow)
    parent_id = getattr(t, "parent_id", None)
    if parent_id:
        parent = (
            await session.execute(
                select(Ticket).where(Ticket.id == parent_id, Ticket.tenant_id == t.tenant_id)
            )
        ).scalar_one_or_none()
        if parent:
            out["parent_code"] = parent.code
            out["parent_title"] = parent.title
    children = list(
        (
            await session.execute(
                select(Ticket)
                .where(Ticket.parent_id == t.id, Ticket.tenant_id == t.tenant_id)
                .order_by(Ticket.created_at.asc())
            )
        ).scalars().all()
    )
    out["children"] = [
        {
            "id": c.id,
            "code": c.code,
            "title": c.title,
            "status": c.status,
            "priority": c.priority,
            "category": c.category,
            "assignee_name": c.assignee_name,
            "due_date": parse_due(c.due_date) if hasattr(c, "due_date") else None,
            "is_overdue": is_overdue(c),
            "qa_total": len(c.qa_scenarios or []),
            "qa_done": sum(1 for s in (c.qa_scenarios or []) if s.get("completed")),
            "qa_incomplete": qa_incomplete_in_qa(c),
            "created_at": c.created_at,
        }
        for c in children
    ]
    scenarios = list(getattr(t, "qa_scenarios", None) or [])
    out["qa_scenarios"] = scenarios
    out.update(qa_scenario_stats(t))
    out["qa_incomplete"] = qa_incomplete_in_qa(t)
    out["child_count"] = len(children)
    out["child_done"] = sum(1 for c in children if is_completed(c.status))
    return out


async def list_ticket_tags(session: AsyncSession, tenant_id: str) -> List[str]:
    rows = (
        await session.execute(select(Ticket.tags).where(Ticket.tenant_id == tenant_id))
    ).scalars().all()
    seen = set()
    for tag_list in rows:
        for tag in tag_list or []:
            if tag:
                seen.add(str(tag).strip().lower())
    return sorted(seen)


def chat_session_out(s: ChatSession, agent_name: Optional[str] = None) -> Dict[str, Any]:
    customer_key = (s.visitor_email or s.visitor_name or s.id).lower()
    return {
        "id": s.id,
        "tenant_id": s.tenant_id,
        "bot_id": s.bot_id,
        "visitor_name": s.visitor_name,
        "visitor_email": s.visitor_email,
        "customer_key": customer_key,
        "status": s.status,
        "agent_id": s.agent_id,
        "agent_name": agent_name,
        "created_at": s.created_at,
        "last_message_at": s.last_message_at,
        "unread": s.unread,
        "agent_reads": s.agent_reads or {},
    }


def chat_message_out(m: ChatMessage) -> Dict[str, Any]:
    out = {
        "id": m.id,
        "session_id": m.session_id,
        "text": m.text,
        "sender": m.sender,
        "sender_name": m.sender_name,
        "created_at": m.created_at,
    }
    if m.meta:
        meta = dict(m.meta)
        if meta.get("attachments"):
            meta["attachments"] = enrich_attachments(meta["attachments"])
        out["meta"] = meta
    return out


def notification_out(n: Notification) -> Dict[str, Any]:
    return {
        "id": n.id,
        "tenant_id": n.tenant_id,
        "user_id": n.user_id,
        "title": n.title,
        "body": n.body,
        "type": n.type,
        "link": n.link,
        "read": n.read,
        "created_at": n.created_at,
    }


async def get_user_by_email(session: AsyncSession, email: str) -> Optional[User]:
    return (await session.execute(select(User).where(User.email == email))).scalar_one_or_none()


async def get_user_by_id(session: AsyncSession, user_id: str) -> Optional[User]:
    return (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()


async def provision_tenant_boards(
    session: AsyncSession, tenant_id: str, *, include_customer: bool = False
) -> Dict[str, Space]:
    """Internal boards product: General always; Customer Inbox only when Bot is enabled."""
    from models import _gen_id, _utc_now_iso

    rows = list(
        (await session.execute(select(Space).where(Space.tenant_id == tenant_id))).scalars().all()
    )
    general = next((s for s in rows if s.slug == "general"), None)
    customer = next((s for s in rows if s.slug == CUSTOMER_SPACE_SLUG), None)
    now = _utc_now_iso()

    if not general:
        general = Space(
            id=_gen_id(),
            tenant_id=tenant_id,
            name="General",
            slug="general",
            description="Internal team board",
            color="#002FA7",
            is_default=True,
            created_at=now,
        )
        session.add(general)
    else:
        general.is_default = True

    if include_customer:
        if not customer:
            customer = Space(
                id=_gen_id(),
                tenant_id=tenant_id,
                name="Customer Inbox",
                slug=CUSTOMER_SPACE_SLUG,
                description="Customer-submitted tickets from the widget and bot.",
                color="#0d9488",
                is_default=False,
                created_at=now,
            )
            session.add(customer)
        else:
            customer.is_default = False
    else:
        customer = None

    for s in rows:
        if s.slug not in ("general", CUSTOMER_SPACE_SLUG) and s.is_default:
            s.is_default = False

    await session.flush()
    out: Dict[str, Space] = {"general": general}
    if customer:
        out["customer"] = customer
    return out


async def sync_tenant_module_spaces(session: AsyncSession, tenant_id: str) -> Dict[str, Space]:
    """Provision spaces matching tenant product modules."""
    tenant = await get_tenant_by_id(session, tenant_id)
    if not tenant:
        return {}
    mods = tenant_modules(tenant)
    if mods["boards"]:
        return await provision_tenant_boards(session, tenant_id, include_customer=mods["bot"])
    if mods["bot"]:
        return {"customer": await provision_customer_inbox_only(session, tenant_id)}
    return {}


async def provision_customer_inbox_only(session: AsyncSession, tenant_id: str) -> Space:
    """Bot-only tenants: widget/chat tickets land in Customer Inbox (no General board)."""
    from models import _gen_id, _utc_now_iso

    rows = list(
        (await session.execute(select(Space).where(Space.tenant_id == tenant_id))).scalars().all()
    )
    customer = next((s for s in rows if s.slug == CUSTOMER_SPACE_SLUG), None)
    now = _utc_now_iso()
    if not customer:
        customer = Space(
            id=_gen_id(),
            tenant_id=tenant_id,
            name="Customer Inbox",
            slug=CUSTOMER_SPACE_SLUG,
            description="Customer-submitted tickets from the widget and bot.",
            color="#0d9488",
            is_default=False,
            created_at=now,
        )
        session.add(customer)
    await session.flush()
    return customer


async def resolve_ticket_spaces(
    session: AsyncSession, tenant_id: str
) -> tuple[str, List[Space]]:
    """Ticket access: full boards product, or bot-only customer inbox capture."""
    from fastapi import HTTPException

    tenant = await get_tenant_by_id(session, tenant_id)
    if not tenant:
        raise HTTPException(404, "Tenant not found")
    mods = tenant_modules(tenant)
    if mods["boards"]:
        allowed, _, _ = await get_space_access(session, tenant_id)
        return "boards", allowed
    if mods["bot"]:
        customer = await provision_customer_inbox_only(session, tenant_id)
        return "inbox", [customer]
    raise HTTPException(
        403,
        "Tickets require the Boards module, or Bot module for customer inbox capture.",
    )


async def provision_tenant_products(
    session: AsyncSession,
    tenant_id: str,
    company_name: str,
    modules: Optional[Dict[str, bool]] = None,
    now: Optional[str] = None,
) -> None:
    """Provision boards and default bot based on enabled product modules."""
    from models import _gen_id, _utc_now_iso

    mods = normalize_modules(modules)
    ts = now or _utc_now_iso()
    if mods["boards"]:
        await provision_tenant_boards(session, tenant_id, include_customer=mods["bot"])
    elif mods["bot"]:
        await provision_customer_inbox_only(session, tenant_id)
    if mods["bot"]:
        session.add(
            Bot(
                id=_gen_id(),
                tenant_id=tenant_id,
                name=f"{company_name} Bot",
                avatar=None,
                greeting=f"Hello! 👋 Welcome to {company_name}. How can I help today?",
                theme_color="#002FA7",
                system_prompt=(
                    f"You are the customer-support AI for {company_name}. "
                    "Be concise, friendly, and only answer from the knowledge base."
                ),
                language="en",
                fallback_message="Let me create a support ticket for our team.",
                temperature=0.4,
                model="gemini-3-flash-preview",
                confidence_threshold=0.15,
                working_hours="24/7",
                created_at=ts,
            )
        )


async def get_customer_space(session: AsyncSession, tenant_id: str) -> Optional[Space]:
    tenant = await get_tenant_by_id(session, tenant_id)
    if not tenant or not tenant_modules(tenant)["bot"]:
        return None
    if tenant_modules(tenant)["boards"]:
        boards = await provision_tenant_boards(session, tenant_id, include_customer=True)
        return boards.get("customer")
    return await provision_customer_inbox_only(session, tenant_id)


async def ensure_customer_space(session: AsyncSession, tenant_id: str) -> Space:
    space = await get_customer_space(session, tenant_id)
    if not space:
        from fastapi import HTTPException

        raise HTTPException(403, "Customer Inbox requires the Bot module")
    return space


async def get_customer_space_id(session: AsyncSession, tenant_id: str) -> str:
    space = await ensure_customer_space(session, tenant_id)
    return space.id


def _non_customer_spaces(spaces: List[Space]) -> List[Space]:
    return [s for s in spaces if s.slug != CUSTOMER_SPACE_SLUG]


def _custom_spaces(spaces: List[Space]) -> List[Space]:
    return [s for s in spaces if s.slug not in SYSTEM_SPACE_SLUGS]


async def get_default_space(session: AsyncSession, tenant_id: str) -> Optional[Space]:
    return (
        await session.execute(
            select(Space)
            .where(Space.tenant_id == tenant_id, Space.slug != CUSTOMER_SPACE_SLUG)
            .order_by(Space.is_default.desc(), Space.created_at.asc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def list_tenant_spaces(session: AsyncSession, tenant_id: str) -> List[Space]:
    rows = list(
        (
            await session.execute(
                select(Space)
                .where(Space.tenant_id == tenant_id)
                .order_by(Space.is_default.desc(), Space.created_at.asc())
            )
        )
        .scalars()
        .all()
    )
    customer = next((s for s in rows if s.slug == CUSTOMER_SPACE_SLUG), None)
    others = [s for s in rows if s.slug != CUSTOMER_SPACE_SLUG]
    if customer:
        return [customer, *others]
    return others


async def get_space_access(
    session: AsyncSession, tenant_id: str
) -> tuple[List[Space], List[Space], int]:
    """Return (allowed_spaces, all_spaces, max_extra_boards).

    Boards-only: General + custom boards (no Customer Inbox).
    Boards + Bot: General + Customer Inbox + custom boards.
    Customer Inbox never counts toward extra-board quota.
    """
    tenant = await get_tenant_by_id(session, tenant_id)
    if not tenant:
        return [], [], 0
    if not tenant_modules(tenant)["boards"]:
        return [], [], 0
    mods = tenant_modules(tenant)
    await provision_tenant_boards(session, tenant_id, include_customer=mods["bot"])
    max_sp = effective_max_spaces(tenant)
    all_spaces = await list_tenant_spaces(session, tenant_id)
    general = next((s for s in all_spaces if s.slug == "general"), None)
    customer = next((s for s in all_spaces if s.slug == CUSTOMER_SPACE_SLUG), None) if mods["bot"] else None
    custom_all = _custom_spaces(all_spaces)
    allowed_custom = custom_all[:max_sp]
    allowed: List[Space] = []
    if general:
        allowed.append(general)
    if customer:
        allowed.append(customer)
    allowed.extend(allowed_custom)
    return allowed, all_spaces, max_sp


async def is_space_allowed(session: AsyncSession, tenant_id: str, space_id: Optional[str]) -> bool:
    if not space_id:
        return True
    tenant = await get_tenant_by_id(session, tenant_id)
    if not tenant:
        return False
    mods = tenant_modules(tenant)
    if not mods["boards"] and not mods["bot"]:
        return False
    if mods["boards"]:
        allowed, _, _ = await get_space_access(session, tenant_id)
    else:
        allowed = [await provision_customer_inbox_only(session, tenant_id)]
    return any(s.id == space_id for s in allowed)


async def backfill_customer_boards(session: AsyncSession) -> None:
    """Ensure customer inbox exists when Bot is on; route customer tickets there."""
    tenants = (await session.execute(select(Tenant))).scalars().all()
    for tenant in tenants:
        if not tenant_modules(tenant)["bot"]:
            continue
        boards = await sync_tenant_module_spaces(session, tenant.id)
        customer = boards.get("customer")
        if not customer:
            continue
        customer_id = customer.id
        rows = list(
            (
                await session.execute(select(Ticket).where(Ticket.tenant_id == tenant.id))
            ).scalars().all()
        )
        for t in rows:
            if is_customer_ticket(t) and t.space_id != customer_id:
                t.space_id = customer_id
                labels = list(t.labels or [])
                if "customer" not in labels:
                    labels.append("customer")
                    t.labels = labels


async def get_tenant_by_id(session: AsyncSession, tenant_id: str) -> Optional[Tenant]:
    return (await session.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()


async def get_tenant_by_client_id(session: AsyncSession, client_id: str) -> Optional[Tenant]:
    return (
        await session.execute(select(Tenant).where(Tenant.client_id == client_id))
    ).scalar_one_or_none()


async def get_tenant_by_slug(session: AsyncSession, slug: str) -> Optional[Tenant]:
    return (await session.execute(select(Tenant).where(Tenant.slug == slug))).scalar_one_or_none()


async def next_ticket_code(session: AsyncSession, tenant_id: str) -> str:
    key = f"ticket_seq:{tenant_id}"
    stmt = (
        insert(Counter)
        .values(key=key, value=1)
        .on_conflict_do_update(
            index_elements=[Counter.key],
            set_={"value": Counter.value + 1},
        )
        .returning(Counter.value)
    )
    seq = (await session.execute(stmt)).scalar_one()
    return f"BOTAAI-{100 + seq}"


async def create_notification(
    session: AsyncSession,
    tenant_id: str,
    title: str,
    body: str,
    ntype: str,
    notif_id: str,
    now: str,
    user_id: Optional[str] = None,
    link: Optional[str] = None,
):
    n = Notification(
        id=notif_id,
        tenant_id=tenant_id,
        user_id=user_id,
        title=title,
        body=body,
        type=ntype,
        link=link,
        read=False,
        created_at=now,
    )
    session.add(n)


async def get_default_bot(session: AsyncSession, tenant_id: str) -> Optional[Dict[str, Any]]:
    b = (
        await session.execute(
            select(Bot).where(Bot.tenant_id == tenant_id).limit(1)
        )
    ).scalar_one_or_none()
    return bot_out(b) if b else None


async def count_by_tenant(session: AsyncSession, model, tenant_id: str, **filters) -> int:
    q = select(func.count()).select_from(model).where(model.tenant_id == tenant_id)
    for k, v in filters.items():
        col = getattr(model, k)
        if isinstance(v, dict) and "$nin" in v:
            q = q.where(col.notin_(v["$nin"]))
        elif isinstance(v, dict) and "$in" in v:
            q = q.where(col.in_(v["$in"]))
        else:
            q = q.where(col == v)
    return (await session.execute(q)).scalar_one()


async def group_count_tickets(session: AsyncSession, tenant_id: str, field: str) -> Dict[str, int]:
    col = getattr(Ticket, field)
    rows = (
        await session.execute(
            select(col, func.count())
            .where(Ticket.tenant_id == tenant_id)
            .group_by(col)
        )
    ).all()
    return {str(k): v for k, v in rows if k is not None}


async def compute_ticket_analytics(session: AsyncSession, tenant_id: str) -> Dict[str, Any]:
    from ticket_helpers import (
        COMPLETED_STATUSES,
        IN_PROGRESS_STATUSES,
        completed_before_due,
        due_in_range,
        is_completed,
        is_overdue,
        qa_incomplete_in_qa,
        qa_scenario_stats,
        today_iso,
        week_end_iso,
    )

    rows = list(
        (
            await session.execute(
                select(Ticket).where(Ticket.tenant_id == tenant_id).limit(10000)
            )
        ).scalars().all()
    )
    users = list(
        (await session.execute(select(User).where(User.tenant_id == tenant_id))).scalars().all()
    )
    user_names = {u.id: u.name for u in users}

    total = len(rows)
    open_cnt = sum(1 for t in rows if t.status in ("new", "open"))
    in_prog = sum(1 for t in rows if t.status in IN_PROGRESS_STATUSES)
    completed = sum(1 for t in rows if is_completed(t.status))
    closed = sum(1 for t in rows if t.status == "closed")
    overdue_cnt = sum(1 for t in rows if is_overdue(t))

    today = today_iso()
    week_end = week_end_iso()
    due_today = sum(
        1 for t in rows
        if parse_due(t.due_date) == today and not is_completed(t.status)
    )
    due_week = sum(
        1 for t in rows
        if due_in_range(t.due_date, today, week_end) and not is_completed(t.status)
    )
    on_time = sum(1 for t in rows if completed_before_due(t) is True)
    late_done = sum(1 for t in rows if completed_before_due(t) is False)

    by_priority = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for t in rows:
        if not is_completed(t.status) and t.priority in by_priority:
            by_priority[t.priority] += 1

    user_stats: Dict[str, Dict[str, int]] = {}
    for t in rows:
        ids = [a.get("id") for a in (t.assignees or []) if a.get("id")]
        if not ids and t.assignee_id:
            ids = [t.assignee_id]
        for uid in ids:
            if uid not in user_stats:
                user_stats[uid] = {"assigned": 0, "completed": 0, "pending": 0, "overdue": 0}
            user_stats[uid]["assigned"] += 1
            if is_completed(t.status):
                user_stats[uid]["completed"] += 1
            else:
                user_stats[uid]["pending"] += 1
            if is_overdue(t):
                user_stats[uid]["overdue"] += 1

    user_performance = [
        {
            "user_id": uid,
            "name": user_names.get(uid, "Unknown"),
            **stats,
        }
        for uid, stats in user_stats.items()
    ]
    user_performance.sort(key=lambda x: x["assigned"], reverse=True)

    def ticket_row(t: Ticket) -> Dict[str, Any]:
        qa = qa_scenario_stats(t)
        return {
            "id": t.id,
            "code": t.code,
            "title": t.title,
            "status": t.status,
            "priority": t.priority,
            "due_date": parse_due(t.due_date),
            "is_overdue": is_overdue(t),
            "updated_at": t.updated_at,
            "created_at": t.created_at,
            **qa,
            "qa_incomplete": qa_incomplete_in_qa(t),
        }

    all_qa_incomplete = [t for t in rows if qa_incomplete_in_qa(t)]
    qa_incomplete_tickets = sorted(
        [ticket_row(t) for t in all_qa_incomplete],
        key=lambda x: x["updated_at"],
        reverse=True,
    )[:12]

    recent_created = sorted(rows, key=lambda t: t.created_at, reverse=True)[:8]
    recent_completed = sorted(
        [t for t in rows if is_completed(t.status)],
        key=lambda t: t.updated_at,
        reverse=True,
    )[:8]
    recent_updated = sorted(rows, key=lambda t: t.updated_at, reverse=True)[:8]

    return {
        "overview": {
            "total": total,
            "open": open_cnt,
            "in_progress": in_prog,
            "completed": completed,
            "closed": closed,
            "overdue": overdue_cnt,
        },
        "due_dates": {
            "due_today": due_today,
            "due_this_week": due_week,
            "overdue": overdue_cnt,
            "completed_on_time": on_time,
            "completed_late": late_done,
        },
        "by_priority": by_priority,
        "user_performance": user_performance,
        "recent": {
            "created": [ticket_row(t) for t in recent_created],
            "completed": [ticket_row(t) for t in recent_completed],
            "updated": [ticket_row(t) for t in recent_updated],
        },
        "qa": {
            "incomplete_count": len(all_qa_incomplete),
            "incomplete_tickets": qa_incomplete_tickets,
        },
    }
