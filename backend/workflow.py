"""Tenant Kanban workflow columns (statuses)."""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Set

DEFAULT_WORKFLOW_COLUMNS: List[Dict[str, Any]] = [
    {"id": "new", "label": "New", "locked": True, "order": 0},
    {"id": "open", "label": "Open", "locked": False, "order": 1},
    {"id": "in_progress", "label": "In Progress", "locked": False, "order": 2},
    {"id": "development", "label": "Development", "locked": False, "order": 3},
    {"id": "qa", "label": "QA", "locked": True, "qa_track": True, "order": 4},
    {"id": "testing", "label": "Testing", "locked": True, "qa_track": True, "order": 5},
    {"id": "waiting", "label": "Waiting", "locked": False, "order": 6},
    {"id": "done", "label": "Done", "locked": True, "terminal": True, "order": 7},
    {"id": "closed", "label": "Closed", "locked": True, "terminal": True, "order": 8},
]

LOCKED_COLUMN_IDS = frozenset(c["id"] for c in DEFAULT_WORKFLOW_COLUMNS if c.get("locked"))
MAX_WORKFLOW_COLUMNS = 20


def slugify_column_id(label: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")
    return s[:48] or "column"


def normalize_workflow_columns(raw: Optional[Any]) -> List[Dict[str, Any]]:
    if not raw:
        return [dict(c) for c in DEFAULT_WORKFLOW_COLUMNS]
    src = raw if isinstance(raw, list) else []
    if not src:
        return [dict(c) for c in DEFAULT_WORKFLOW_COLUMNS]

    out: List[Dict[str, Any]] = []
    seen: Set[str] = set()
    for i, item in enumerate(src):
        if not isinstance(item, dict):
            continue
        cid = str(item.get("id") or "").strip()
        label = str(item.get("label") or "").strip()
        if not cid or not label or cid in seen:
            continue
        seen.add(cid)
        default = next((c for c in DEFAULT_WORKFLOW_COLUMNS if c["id"] == cid), None)
        locked = bool(item.get("locked")) if "locked" in item else bool(default and default.get("locked"))
        if cid in LOCKED_COLUMN_IDS:
            locked = True
        col = {
            "id": cid,
            "label": label,
            "locked": locked,
            "order": int(item.get("order", i)),
        }
        qa_track = bool(item.get("qa_track")) if "qa_track" in item else bool(default and default.get("qa_track"))
        terminal = bool(item.get("terminal")) if "terminal" in item else bool(default and default.get("terminal"))
        if qa_track:
            col["qa_track"] = True
        if terminal:
            col["terminal"] = True
        out.append(col)

    out.sort(key=lambda c: c.get("order", 0))
    for i, col in enumerate(out):
        col["order"] = i

    # Ensure required system columns exist
    existing_ids = {c["id"] for c in out}
    for req in DEFAULT_WORKFLOW_COLUMNS:
        if req["id"] in LOCKED_COLUMN_IDS and req["id"] not in existing_ids:
            out.append(dict(req))
    out.sort(key=lambda c: c.get("order", 0))
    for i, col in enumerate(out):
        col["order"] = i
    return out


def workflow_status_ids(columns: List[Dict[str, Any]]) -> Set[str]:
    return {c["id"] for c in columns}


def qa_status_ids(columns: List[Dict[str, Any]]) -> Set[str]:
    return {c["id"] for c in columns if c.get("qa_track")}


def terminal_status_ids(columns: List[Dict[str, Any]]) -> Set[str]:
    ids = {c["id"] for c in columns if c.get("terminal")}
    return ids or {"done", "closed"}


def validate_workflow_update(
    current: List[Dict[str, Any]], proposed: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    from fastapi import HTTPException

    if not proposed:
        raise HTTPException(400, "At least one workflow column is required")
    if len(proposed) > MAX_WORKFLOW_COLUMNS:
        raise HTTPException(400, f"Maximum {MAX_WORKFLOW_COLUMNS} columns allowed")

    proposed_ids = {
        str(c.get("id") or "").strip()
        for c in proposed
        if isinstance(c, dict) and str(c.get("id") or "").strip()
    }
    for req_id in LOCKED_COLUMN_IDS:
        if req_id not in proposed_ids:
            raise HTTPException(400, f"System column '{req_id}' cannot be removed")

    normalized = normalize_workflow_columns(proposed)
    ids = [c["id"] for c in normalized]

    current_ids = workflow_status_ids(current)
    removed = current_ids - set(ids)
    for rid in removed:
        col = next((c for c in current if c["id"] == rid), None)
        if col and col.get("locked"):
            raise HTTPException(400, f"Column '{rid}' is locked and cannot be removed")

    for col in normalized:
        if not col.get("label", "").strip():
            raise HTTPException(400, "Every column needs a label")
        if col["id"] in LOCKED_COLUMN_IDS and col.get("locked") is False:
            col["locked"] = True

    return normalized


def migrate_removed_statuses(
    removed_ids: Set[str], columns: List[Dict[str, Any]]
) -> str:
    """Target status for tickets on removed columns."""
    if not columns:
        return "open"
    fallback = next((c["id"] for c in columns if c["id"] == "open"), columns[0]["id"])
    return fallback
