"""Due date & overdue helpers for tickets."""
from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Any, Dict, Optional, Set

COMPLETED_STATUSES = frozenset({"done", "closed", "completed"})
WORKFLOW_STATUSES = frozenset({
    "new", "open", "in_progress", "development", "qa", "testing", "waiting", "done", "closed",
})
OPENISH_STATUSES = frozenset({"new", "open", "in_progress", "development", "qa", "testing", "waiting"})
IN_PROGRESS_STATUSES = frozenset({"in_progress", "development", "qa", "testing"})
QA_STATUSES = frozenset({"qa", "testing"})
CUSTOMER_SPACE_SLUG = "customer"
CUSTOMER_TICKET_LABELS = frozenset({"customer", "from-widget", "from-chat"})


def _ticket_labels(ticket) -> set:
    labels = getattr(ticket, "labels", None) or []
    if isinstance(ticket, dict):
        labels = ticket.get("labels") or []
    return set(labels or [])


def is_customer_ticket(ticket) -> bool:
    labels = _ticket_labels(ticket)
    if labels & CUSTOMER_TICKET_LABELS:
        return True
    chat_sid = (
        ticket.get("chat_session_id")
        if isinstance(ticket, dict)
        else getattr(ticket, "chat_session_id", None)
    )
    reporter_id = (
        ticket.get("reporter_id")
        if isinstance(ticket, dict)
        else getattr(ticket, "reporter_id", None)
    )
    reporter_email = (
        ticket.get("reporter_email")
        if isinstance(ticket, dict)
        else getattr(ticket, "reporter_email", None)
    )
    if chat_sid:
        return True
    if "auto-created" in labels and chat_sid:
        return True
    if reporter_email and not reporter_id:
        return True
    return False


def today_iso() -> str:
    return date.today().isoformat()


def week_end_iso() -> str:
    return (date.today() + timedelta(days=7)).isoformat()


def parse_due(due: Optional[str]) -> Optional[str]:
    if not due:
        return None
    s = str(due).strip()[:10]
    if len(s) == 10:
        return s
    return None


def is_completed(status: str, terminal_ids: Optional[Set[str]] = None) -> bool:
    if terminal_ids is not None:
        return status in terminal_ids
    return status in COMPLETED_STATUSES


def is_overdue(ticket, terminal_ids: Optional[Set[str]] = None) -> bool:
    due = parse_due(getattr(ticket, "due_date", None))
    if not due:
        return False
    if is_completed(getattr(ticket, "status", "") or "", terminal_ids):
        return False
    return due < today_iso()


def ticket_is_overdue_dict(t: Dict[str, Any]) -> bool:
    due = parse_due(t.get("due_date"))
    if not due:
        return False
    if is_completed(t.get("status", "")):
        return False
    return due < today_iso()


def due_in_range(due: Optional[str], start: str, end: str) -> bool:
    d = parse_due(due)
    if not d:
        return False
    return start <= d <= end


def status_before_overdue_mark(activity: Optional[list]) -> str:
    """Restore workflow status for tickets that were auto-set to status=overdue."""
    entries = list(activity or [])
    for entry in reversed(entries):
        if entry.get("event") == "overdue":
            continue
        for detail in entry.get("details") or []:
            match = re.search(r"Status changed from .+ to (.+)$", str(detail))
            if match:
                return match.group(1).replace(" ", "_")
    for entry in entries:
        if entry.get("event") == "created":
            return "new"
    return "open"


def completed_before_due(ticket) -> Optional[bool]:
    if not is_completed(getattr(ticket, "status", "")):
        return None
    due = parse_due(getattr(ticket, "due_date", None))
    if not due:
        return None
    done_day = (getattr(ticket, "updated_at", "") or "")[:10]
    if not done_day:
        return None
    return done_day <= due


def qa_scenario_stats(ticket) -> Dict[str, Any]:
    scenarios = list(getattr(ticket, "qa_scenarios", None) or [])
    total = len(scenarios)
    done = sum(1 for s in scenarios if s.get("completed"))
    complete = total > 0 and done == total
    return {
        "qa_total": total,
        "qa_done": done,
        "qa_complete": complete,
    }


def qa_incomplete_in_qa(ticket, qa_ids: Optional[Set[str]] = None) -> bool:
    status = getattr(ticket, "status", "") or ""
    ids = qa_ids if qa_ids is not None else QA_STATUSES
    if status not in ids:
        return False
    stats = qa_scenario_stats(ticket)
    return not stats["qa_complete"]


def qa_handoff_warning(scenarios: list) -> Optional[str]:
    total = len(scenarios or [])
    done = sum(1 for s in (scenarios or []) if s.get("completed"))
    if total == 0:
        return "Moved to QA with no QA scenarios defined"
    if done < total:
        return f"Moved to QA with incomplete QA scenarios ({done}/{total} passed)"
    return None


def _field_str(ticket, key: str) -> str:
    if isinstance(ticket, dict):
        return str(ticket.get(key) or "")
    return str(getattr(ticket, key, None) or "")


def ticket_matches_search(ticket, search: str) -> bool:
    """Match ticket code, title, description, tags, labels, reporter fields."""
    needle = (search or "").strip().lower()
    if not needle:
        return True
    code = _field_str(ticket, "code").lower()
    if needle in code:
        return True
    if needle.isdigit():
        if code.endswith(f"-{needle}") or code == f"botaai-{needle}":
            return True
    if needle in _field_str(ticket, "title").lower():
        return True
    if needle in _field_str(ticket, "description").lower():
        return True
    if needle in _field_str(ticket, "reporter_name").lower():
        return True
    if needle in _field_str(ticket, "reporter_email").lower():
        return True
    tags = getattr(ticket, "tags", None) if not isinstance(ticket, dict) else ticket.get("tags")
    if any(needle in str(tag).lower() for tag in (tags or [])):
        return True
    labels = getattr(ticket, "labels", None) if not isinstance(ticket, dict) else ticket.get("labels")
    if any(needle in str(label).lower() for label in (labels or [])):
        return True
    return False


def ticket_search_sql_conditions(search: str, ticket_model):
    """SQLAlchemy OR clause for universal ticket search."""
    from sqlalchemy import cast, or_, String

    needle = f"%{search}%"
    conditions = [
        ticket_model.code.ilike(needle),
        ticket_model.title.ilike(needle),
        ticket_model.description.ilike(needle),
        ticket_model.reporter_name.ilike(needle),
        ticket_model.reporter_email.ilike(needle),
        cast(ticket_model.tags, String).ilike(needle),
        cast(ticket_model.labels, String).ilike(needle),
    ]
    stripped = search.strip()
    if stripped.isdigit():
        conditions.append(ticket_model.code.ilike(f"%BOTAAI-{stripped}"))
        conditions.append(ticket_model.code.ilike(f"%-{stripped}"))
    return or_(*conditions)
