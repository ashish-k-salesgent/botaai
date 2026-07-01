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
    max_spaces: int = 1
    modules: Dict[str, bool] = Field(default_factory=dict)
    workflow_columns: List[Dict[str, Any]] = Field(default_factory=list)
    created_at: str
    branding: Dict[str, Any] = {}


class TenantModules(BaseModel):
    boards: bool = True
    bot: bool = True
    live_chat: bool = True


class TenantUpdate(BaseModel):
    name: Optional[str] = None
    branding: Optional[Dict[str, Any]] = None
    status: Optional[str] = None
    plan: Optional[str] = None
    max_spaces: Optional[int] = None
    modules: Optional[TenantModules] = None


class WorkflowColumn(BaseModel):
    id: str
    label: str
    locked: bool = False
    qa_track: bool = False
    terminal: bool = False
    order: int = 0


class WorkflowColumnsUpdate(BaseModel):
    columns: List[WorkflowColumn]


class AdminTenantCreate(BaseModel):
    company_name: str
    admin_email: EmailStr
    admin_name: str
    admin_password: str
    plan: str = "trial"
    status: str = "trial"
    max_spaces: int = 0
    modules: TenantModules = Field(default_factory=TenantModules)


# ============== SPACES ==============
class SpaceCreate(BaseModel):
    name: str
    description: str = ""
    color: str = "#002FA7"


class SpaceOut(BaseModel):
    id: str
    tenant_id: str
    name: str
    slug: str
    description: str = ""
    color: str = "#002FA7"
    is_default: bool = False
    is_customer: bool = False
    is_system: bool = False
    ticket_count: int = 0
    created_at: str


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
    description: str = ""
    priority: str = "medium"  # low | medium | high | critical
    category: str = "Question"
    status: str = "new"
    assignee_id: Optional[str] = None
    assignees: Optional[List[Dict[str, Any]]] = None
    reporter_email: Optional[str] = None
    labels: List[str] = []
    tags: List[str] = []
    space_id: Optional[str] = None
    parent_id: Optional[str] = None
    attachments: List[Dict[str, Any]] = []
    due_date: Optional[str] = None


class QAScenario(BaseModel):
    id: Optional[str] = None
    title: str
    steps: str = ""
    expected: str = ""
    completed: bool = False
    completed_by_id: Optional[str] = None
    completed_by_name: Optional[str] = None
    completed_at: Optional[str] = None
    created_at: Optional[str] = None
    created_by: Optional[str] = None


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
    assignees: List[Dict[str, Any]] = []
    tags: List[str] = []
    blocked_by: Optional[Dict[str, Any]] = None
    reporter_id: Optional[str] = None
    reporter_name: Optional[str] = None
    reporter_email: Optional[str] = None
    labels: List[str] = []
    comments: List[Dict[str, Any]] = []
    activity: List[Dict[str, Any]] = []
    attachments: List[Dict[str, Any]] = []
    created_at: str
    updated_at: str
    due_date: Optional[str] = None
    is_overdue: bool = False
    parent_id: Optional[str] = None
    parent_code: Optional[str] = None
    parent_title: Optional[str] = None
    children: List[Dict[str, Any]] = []
    qa_scenarios: List[Dict[str, Any]] = []
    child_count: int = 0
    child_done: int = 0


class TicketUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    category: Optional[str] = None
    assignee_id: Optional[str] = None
    assignees: Optional[List[Dict[str, Any]]] = None
    tags: Optional[List[str]] = None
    blocked_by: Optional[Dict[str, Any]] = None
    labels: Optional[List[str]] = None
    attachments: Optional[List[Dict[str, Any]]] = None
    due_date: Optional[str] = None
    qa_scenarios: Optional[List[Dict[str, Any]]] = None
    space_id: Optional[str] = None


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
