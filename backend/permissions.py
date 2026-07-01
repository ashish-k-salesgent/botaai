"""Role-based permissions — defaults + per-tenant editable config."""
from __future__ import annotations

import copy
import re
from typing import Any, Dict, List, Optional, Set

TENANT_ROLES = ["admin", "support", "developer", "qa", "viewer"]

DEFAULT_GROUPS: List[Dict[str, Any]] = [
    {
        "id": "dashboard",
        "label": "Dashboard",
        "permissions": [{"key": "dashboard.view", "label": "View dashboard"}],
    },
    {
        "id": "tickets",
        "label": "Spaces & Tickets",
        "permissions": [
            {"key": "tickets.view", "label": "View board"},
            {"key": "tickets.create", "label": "Create tickets"},
            {"key": "tickets.edit", "label": "Edit tickets"},
            {"key": "tickets.delete", "label": "Delete tickets"},
        ],
    },
    {
        "id": "chats",
        "label": "Live Chat",
        "permissions": [
            {"key": "chats.view", "label": "View chats"},
            {"key": "chats.reply", "label": "Reply & claim"},
            {"key": "chats.close", "label": "Close chats"},
        ],
    },
    {
        "id": "knowledge",
        "label": "Knowledge Base",
        "permissions": [
            {"key": "knowledge.view", "label": "View docs"},
            {"key": "knowledge.edit", "label": "Add & edit docs"},
            {"key": "knowledge.delete", "label": "Delete docs"},
        ],
    },
    {
        "id": "bots",
        "label": "Bots",
        "permissions": [
            {"key": "bots.view", "label": "View bots"},
            {"key": "bots.edit", "label": "Configure bots"},
        ],
    },
    {
        "id": "team",
        "label": "Team & Permissions",
        "permissions": [
            {"key": "team.view", "label": "View members"},
            {"key": "team.manage", "label": "Manage members & roles"},
            {"key": "team.permissions", "label": "Edit permission groups"},
        ],
    },
    {
        "id": "analytics",
        "label": "Analytics",
        "permissions": [{"key": "analytics.view", "label": "View analytics"}],
    },
    {
        "id": "settings",
        "label": "Settings",
        "permissions": [
            {"key": "settings.view", "label": "View settings"},
            {"key": "settings.edit", "label": "Edit tenant settings"},
        ],
    },
]

DEFAULT_ROLE_PERMISSIONS: Dict[str, List[str]] = {
    "admin": ["*"],
    "support": [
        "dashboard.view",
        "tickets.view",
        "tickets.create",
        "tickets.edit",
        "chats.view",
        "chats.reply",
        "chats.close",
        "knowledge.view",
        "analytics.view",
        "settings.view",
        "team.view",
    ],
    "developer": [
        "dashboard.view",
        "tickets.view",
        "tickets.create",
        "tickets.edit",
        "tickets.delete",
        "chats.view",
        "chats.reply",
        "knowledge.view",
        "knowledge.edit",
        "bots.view",
        "bots.edit",
        "analytics.view",
        "settings.view",
        "team.view",
    ],
    "qa": [
        "dashboard.view",
        "tickets.view",
        "tickets.edit",
        "chats.view",
        "knowledge.view",
        "analytics.view",
        "team.view",
    ],
    "viewer": [
        "dashboard.view",
        "tickets.view",
        "analytics.view",
    ],
}

NAV_PERMISSIONS: Dict[str, str] = {
    "dashboard": "dashboard.view",
    "tickets": "tickets.view",
    "chats": "chats.view",
    "knowledge": "knowledge.view",
    "bots": "bots.view",
    "users": "team.view",
    "analytics": "analytics.view",
    "settings": "settings.view",
}

# Legacy aliases
PERMISSION_GROUPS = DEFAULT_GROUPS
ROLE_PERMISSIONS = DEFAULT_ROLE_PERMISSIONS
ALL_PERMISSIONS: Set[str] = {p["key"] for g in DEFAULT_GROUPS for p in g["permissions"]}


def default_config() -> Dict[str, Any]:
    return {
        "groups": copy.deepcopy(DEFAULT_GROUPS),
        "role_permissions": copy.deepcopy(DEFAULT_ROLE_PERMISSIONS),
    }


def normalize_config(raw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not raw or not raw.get("groups"):
        return default_config()
    groups = raw.get("groups") or []
    role_permissions = raw.get("role_permissions") or raw.get("roles") or {}
    if not role_permissions:
        role_permissions = copy.deepcopy(DEFAULT_ROLE_PERMISSIONS)
    return {"groups": groups, "role_permissions": role_permissions}


def all_permission_keys(config: Optional[Dict[str, Any]] = None) -> Set[str]:
    cfg = normalize_config(config)
    keys: Set[str] = set()
    for g in cfg["groups"]:
        for p in g.get("permissions") or []:
            if p.get("key"):
                keys.add(p["key"])
    return keys


def _role_base(role: str, config: Optional[Dict[str, Any]] = None) -> Set[str]:
    if role == "super_admin":
        return all_permission_keys(config)
    cfg = normalize_config(config)
    all_keys = all_permission_keys(cfg)
    perms = cfg["role_permissions"].get(role, cfg["role_permissions"].get("viewer", []))
    if "*" in perms:
        return all_keys
    return set(perms)


def resolve_permissions(
    role: str,
    overrides: Optional[Dict[str, Any]] = None,
    tenant_config: Optional[Dict[str, Any]] = None,
) -> List[str]:
    cfg = normalize_config(tenant_config)
    all_keys = all_permission_keys(cfg)
    base = _role_base(role, cfg)
    ov = overrides or {}
    grants = set(ov.get("grant") or ov.get("grants") or [])
    denies = set(ov.get("deny") or ov.get("denies") or [])
    effective = (base | grants) - denies
    if role == "admin" and not denies:
        return sorted(all_keys)
    return sorted(effective & all_keys)


def has_permission(
    role: str,
    permission: str,
    overrides: Optional[Dict[str, Any]] = None,
    tenant_config: Optional[Dict[str, Any]] = None,
) -> bool:
    if role == "super_admin" or role == "admin":
        return True
    return permission in resolve_permissions(role, overrides, tenant_config)


def permissions_matrix(tenant_config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    cfg = normalize_config(tenant_config)
    all_keys = all_permission_keys(cfg)
    return {
        "groups": cfg["groups"],
        "roles": {
            role: sorted(_role_base(role, cfg))
            if "*" not in cfg["role_permissions"].get(role, [])
            else sorted(all_keys)
            for role in TENANT_ROLES
        },
        "role_permissions": cfg["role_permissions"],
        "all_permissions": sorted(all_keys),
    }


def slugify_key(text: str) -> str:
    return re.sub(r"[^a-z0-9._-]+", "-", text.lower()).strip("-") or "perm"


def validate_config(body: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize and validate tenant permission config before save."""
    groups = body.get("groups")
    role_permissions = body.get("role_permissions")
    if not isinstance(groups, list) or not groups:
        raise ValueError("At least one permission group is required")
    if not isinstance(role_permissions, dict):
        raise ValueError("role_permissions must be an object")

    seen_group_ids: Set[str] = set()
    seen_perm_keys: Set[str] = set()
    clean_groups: List[Dict[str, Any]] = []

    for g in groups:
        gid = slugify_key(str(g.get("id") or g.get("label") or "group"))
        if gid in seen_group_ids:
            raise ValueError(f"Duplicate group id: {gid}")
        seen_group_ids.add(gid)
        label = str(g.get("label") or gid).strip() or gid
        perms_in: List[Dict[str, Any]] = g.get("permissions") or []
        clean_perms: List[Dict[str, Any]] = []
        for p in perms_in:
            key = slugify_key(str(p.get("key") or p.get("label") or "perm"))
            if not key:
                continue
            if key in seen_perm_keys:
                raise ValueError(f"Duplicate permission key: {key}")
            seen_perm_keys.add(key)
            clean_perms.append({
                "key": key,
                "label": str(p.get("label") or key).strip() or key,
            })
        clean_groups.append({"id": gid, "label": label, "permissions": clean_perms})

    clean_roles: Dict[str, List[str]] = {}
    for role in TENANT_ROLES:
        raw = role_permissions.get(role, DEFAULT_ROLE_PERMISSIONS.get(role, []))
        if not isinstance(raw, list):
            raw = []
        if "*" in raw:
            clean_roles[role] = ["*"]
        else:
            clean_roles[role] = sorted(set(raw) & seen_perm_keys)

    return {"groups": clean_groups, "role_permissions": clean_roles}
