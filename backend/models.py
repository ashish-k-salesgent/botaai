"""BotAAI shared models and database utilities."""
from datetime import datetime, timezone
from typing import Annotated, Any, List, Optional, Dict
from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, EmailStr
import uuid


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _gen_id() -> str:
    return str(uuid.uuid4())


# ============== AUTH / USERS ==============
class UserBase(BaseModel):
    email: EmailStr
    name: str
    role: str = "admin"  # admin | support | developer | qa | viewer | super_admin
    tenant_id: Optional[str] = None  # None for super admin


class UserCreate(UserBase):
    password: str


class UserOut(UserBase):
    id: str
    created_at: str
    active: bool = True


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class SignupInput(BaseModel):
    email: EmailStr
    password: str
    name: str
    company_name: str


# ============== TENANTS ==============
class TenantOut(BaseModel):
    id: str
    name: str
    slug: str
    client_id: str
    status: str  # trial | active | suspended | expired
    plan: str  # trial | monthly | quarterly | yearly | custom
    trial_ends_at: str
    created_at: str
    branding: Dict[str, Any] = {}


class TenantUpdate(BaseModel):
    name: Optional[str] = None
    branding: Optional[Dict[str, Any]] = None
    status: Optional[str] = None
    plan: Optional[str] = None


# ============== BOTS ==============
class BotInput(BaseModel):
    name: str
    avatar: Optional[str] = None
    greeting: str = "Hello! How can I help you today?"
    theme_color: str = "#002FA7"
    system_prompt: str = "You are a friendly customer support agent."
    language: str = "en"
    fallback_message: str = "Let me create a ticket for our team to help you."
    temperature: float = 0.4
    model: str = "gemini-3-flash-preview"
    confidence_threshold: float = 0.45
    working_hours: str = "24/7"


class BotOut(BotInput):
    id: str
    tenant_id: str
    created_at: str


# ============== KNOWLEDGE BASE ==============
class KBDocOut(BaseModel):
    id: str
    tenant_id: str
    bot_id: Optional[str] = None
    title: str
    source_type: str  # text | url | pdf | markdown | faq
    status: str  # processing | ready | failed
    chunk_count: int = 0
    created_at: str


class KBDocCreate(BaseModel):
    title: str
    content: str
    source_type: str = "text"
    bot_id: Optional[str] = None


# ============== TICKETS ==============
class TicketCreate(BaseModel):
    title: str
    description: str
    priority: str = "medium"  # low | medium | high | critical
    category: str = "Question"
    reporter_email: Optional[str] = None
    labels: List[str] = []


class TicketComment(BaseModel):
    id: str
    author_id: str
    author_name: str
    body: str
    created_at: str


class TicketOut(BaseModel):
    id: str
    code: str  # e.g. BOTAAI-101
    tenant_id: str
    title: str
    description: str
    status: str  # new | open | in_progress | development | qa | testing | waiting | done | closed
    priority: str
    category: str
    sentiment: str = "neutral"
    urgency_score: int = 50
    assignee_id: Optional[str] = None
    assignee_name: Optional[str] = None
    reporter_id: Optional[str] = None
    reporter_name: Optional[str] = None
    reporter_email: Optional[str] = None
    labels: List[str] = []
    comments: List[Dict[str, Any]] = []
    activity: List[Dict[str, Any]] = []
    created_at: str
    updated_at: str


class TicketUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    category: Optional[str] = None
    assignee_id: Optional[str] = None
    labels: Optional[List[str]] = None


# ============== CHAT ==============
class ChatSessionOut(BaseModel):
    id: str
    tenant_id: str
    bot_id: Optional[str] = None
    visitor_name: str
    visitor_email: Optional[str] = None
    status: str  # ai | queue | live | closed
    agent_id: Optional[str] = None
    created_at: str
    last_message_at: str
    unread: int = 0


class ChatMessageIn(BaseModel):
    text: str
    sender: str = "user"  # user | bot | agent


class ChatMessageOut(BaseModel):
    id: str
    session_id: str
    text: str
    sender: str
    sender_name: Optional[str] = None
    created_at: str


# ============== NOTIFICATIONS ==============
class NotificationOut(BaseModel):
    id: str
    tenant_id: str
    user_id: Optional[str] = None
    title: str
    body: str
    type: str  # ticket | chat | system
    link: Optional[str] = None
    read: bool = False
    created_at: str
