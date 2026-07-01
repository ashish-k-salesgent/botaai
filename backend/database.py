"""PostgreSQL + pgvector async database layer."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Dict, List, Optional

from dotenv import load_dotenv
from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Boolean,
    Float,
    Integer,
    String,
    Text,
    select,
    text,
    update,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

load_dotenv(Path(__file__).parent / ".env")

EMBEDDING_DIM = int(os.environ.get("EMBEDDING_DIM", "768"))

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:@localhost:5432/botaai",
)


def _build_url() -> str:
    if os.environ.get("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    user = os.environ.get("POSTGRES_USER", "postgres")
    password = os.environ.get("POSTGRES_PASSWORD", "")
    host = os.environ.get("POSTGRES_HOST", "localhost")
    port = os.environ.get("POSTGRES_PORT", "5432")
    db = os.environ.get("POSTGRES_DB", "botaai")
    auth = f"{user}:{password}" if password else user
    return f"postgresql+asyncpg://{auth}@{host}:{port}/{db}"


engine = create_async_engine(_build_url(), echo=False, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(32), default="admin")
    tenant_id: Mapped[Optional[str]] = mapped_column(String(36), index=True, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    permission_overrides: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[str] = mapped_column(String(64))


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    slug: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    client_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    client_secret: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(32))
    plan: Mapped[str] = mapped_column(String(32))
    trial_ends_at: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[str] = mapped_column(String(64))
    branding: Mapped[dict] = mapped_column(JSONB, default=dict)
    max_spaces: Mapped[int] = mapped_column(Integer, default=1)
    permission_config: Mapped[dict] = mapped_column(JSONB, default=dict)
    modules: Mapped[dict] = mapped_column(JSONB, default=dict)
    workflow_columns: Mapped[dict] = mapped_column(JSONB, default=list)


class Space(Base):
    __tablename__ = "spaces"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(36), index=True)
    name: Mapped[str] = mapped_column(String(255))
    slug: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="")
    color: Mapped[str] = mapped_column(String(16), default="#002FA7")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[str] = mapped_column(String(64))


class Bot(Base):
    __tablename__ = "bots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(36), index=True)
    name: Mapped[str] = mapped_column(String(255))
    avatar: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    greeting: Mapped[str] = mapped_column(Text)
    theme_color: Mapped[str] = mapped_column(String(16), default="#002FA7")
    system_prompt: Mapped[str] = mapped_column(Text)
    language: Mapped[str] = mapped_column(String(8), default="en")
    fallback_message: Mapped[str] = mapped_column(Text)
    temperature: Mapped[float] = mapped_column(Float, default=0.4)
    model: Mapped[str] = mapped_column(String(64), default="gemini-3-flash-preview")
    confidence_threshold: Mapped[float] = mapped_column(Float, default=0.45)
    working_hours: Mapped[str] = mapped_column(String(32), default="24/7")
    created_at: Mapped[str] = mapped_column(String(64))


class KBDoc(Base):
    __tablename__ = "kb_docs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(36), index=True)
    bot_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    title: Mapped[str] = mapped_column(String(512))
    source_type: Mapped[str] = mapped_column(String(32), default="text")
    status: Mapped[str] = mapped_column(String(32), default="ready")
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    content_preview: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(String(64))


class KBChunk(Base):
    __tablename__ = "kb_chunks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    doc_id: Mapped[str] = mapped_column(String(36), index=True)
    tenant_id: Mapped[str] = mapped_column(String(36), index=True)
    bot_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    index: Mapped[int] = mapped_column(Integer, default=0)
    text: Mapped[str] = mapped_column(Text)
    title: Mapped[str] = mapped_column(String(512))
    embedding = mapped_column(Vector(EMBEDDING_DIM))
    created_at: Mapped[str] = mapped_column(String(64))


class Ticket(Base):
    __tablename__ = "tickets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    code: Mapped[str] = mapped_column(String(32), index=True)
    tenant_id: Mapped[str] = mapped_column(String(36), index=True)
    space_id: Mapped[Optional[str]] = mapped_column(String(36), index=True, nullable=True)
    title: Mapped[str] = mapped_column(String(512))
    description: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="new")
    priority: Mapped[str] = mapped_column(String(16), default="medium")
    category: Mapped[str] = mapped_column(String(64), default="Question")
    sentiment: Mapped[str] = mapped_column(String(16), default="neutral")
    urgency_score: Mapped[int] = mapped_column(Integer, default=50)
    assignee_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    assignee_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    assignees: Mapped[list] = mapped_column(JSONB, default=list)
    tags: Mapped[list] = mapped_column(JSONB, default=list)
    blocked_by: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    reporter_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    reporter_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    reporter_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    labels: Mapped[list] = mapped_column(JSONB, default=list)
    comments: Mapped[list] = mapped_column(JSONB, default=list)
    activity: Mapped[list] = mapped_column(JSONB, default=list)
    attachments: Mapped[list] = mapped_column(JSONB, default=list)
    chat_session_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    due_date: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    parent_id: Mapped[Optional[str]] = mapped_column(String(36), index=True, nullable=True)
    qa_scenarios: Mapped[list] = mapped_column(JSONB, default=list)
    created_at: Mapped[str] = mapped_column(String(64))
    updated_at: Mapped[str] = mapped_column(String(64))


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(36), index=True)
    bot_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    visitor_name: Mapped[str] = mapped_column(String(255), default="Guest")
    visitor_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="ai")
    agent_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    unread: Mapped[int] = mapped_column(Integer, default=0)
    agent_reads: Mapped[dict] = mapped_column(JSONB, default=dict)
    last_classification: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[str] = mapped_column(String(64))
    last_message_at: Mapped[str] = mapped_column(String(64))


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    session_id: Mapped[str] = mapped_column(String(36), index=True)
    tenant_id: Mapped[str] = mapped_column(String(36), index=True)
    text: Mapped[str] = mapped_column(Text)
    sender: Mapped[str] = mapped_column(String(16))
    sender_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    meta: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[str] = mapped_column(String(64))


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(36), index=True)
    user_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    title: Mapped[str] = mapped_column(String(512))
    body: Mapped[str] = mapped_column(Text)
    type: Mapped[str] = mapped_column(String(32))
    link: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[str] = mapped_column(String(64))


class Counter(Base):
    __tablename__ = "counters"

    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    value: Mapped[int] = mapped_column(Integer, default=0)


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(
            text(
                "ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS agent_reads JSONB DEFAULT '{}'"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE tickets ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'"
            )
        )
        await conn.execute(
            text("ALTER TABLE tickets ADD COLUMN IF NOT EXISTS assignees JSONB DEFAULT '[]'")
        )
        await conn.execute(
            text("ALTER TABLE tickets ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'")
        )
        await conn.execute(
            text("ALTER TABLE tickets ADD COLUMN IF NOT EXISTS blocked_by JSONB")
        )
        await conn.execute(
            text("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_spaces INTEGER DEFAULT 1")
        )
        await conn.execute(
            text("ALTER TABLE tickets ADD COLUMN IF NOT EXISTS space_id VARCHAR(36)")
        )
        await conn.execute(
            text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS permission_overrides JSONB DEFAULT '{}'"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS permission_config JSONB DEFAULT '{}'"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE tenants ADD COLUMN IF NOT EXISTS modules JSONB DEFAULT '{}'"
            )
        )
        await conn.execute(
            text("ALTER TABLE tickets ADD COLUMN IF NOT EXISTS due_date VARCHAR(16)")
        )
        await conn.execute(
            text("ALTER TABLE tickets ADD COLUMN IF NOT EXISTS parent_id VARCHAR(36)")
        )
        await conn.execute(
            text("ALTER TABLE tickets ADD COLUMN IF NOT EXISTS qa_scenarios JSONB DEFAULT '[]'")
        )
        await conn.execute(
            text("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS workflow_columns JSONB DEFAULT '[]'")
        )


async def backfill_spaces() -> None:
    """Ensure tenant spaces match modules; attach orphan tickets to default space."""
    async with SessionLocal() as session:
        import store as store_mod

        tenants = (await session.execute(select(Tenant))).scalars().all()
        for tenant in tenants:
            mods = store_mod.tenant_modules(tenant)
            if mods["boards"]:
                boards = await store_mod.provision_tenant_boards(
                    session, tenant.id, include_customer=mods["bot"]
                )
                default_id = boards["general"].id
            elif mods["bot"]:
                customer = await store_mod.provision_customer_inbox_only(session, tenant.id)
                default_id = customer.id
            else:
                continue
            await session.execute(
                update(Ticket)
                .where(Ticket.tenant_id == tenant.id, Ticket.space_id.is_(None))
                .values(space_id=default_id)
            )
        await session.commit()


async def repair_legacy_overdue_status() -> None:
    """Revert tickets that were auto-set to status=overdue back to their workflow status."""
    from ticket_helpers import status_before_overdue_mark

    async with SessionLocal() as session:
        rows = list(
            (await session.execute(select(Ticket).where(Ticket.status == "overdue"))).scalars().all()
        )
        if not rows:
            return
        for t in rows:
            restored = status_before_overdue_mark(t.activity)
            await session.execute(
                update(Ticket).where(Ticket.id == t.id).values(status=restored)
            )
        await session.commit()


async def get_session():
    async with SessionLocal() as session:
        yield session
