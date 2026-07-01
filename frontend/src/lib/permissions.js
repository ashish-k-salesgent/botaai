/** Client-side permission helpers (mirrors backend/permissions.py). */

import { canNavModule } from "./modules";

export const NAV_PERMISSIONS = {
  dashboard: "dashboard.view",
  tickets: "tickets.view",
  chats: "chats.view",
  knowledge: "knowledge.view",
  bots: "bots.view",
  users: "team.view",
  analytics: "analytics.view",
  settings: "settings.view",
};

const ALL_PERMISSIONS = [
  "dashboard.view",
  "tickets.view", "tickets.create", "tickets.edit", "tickets.delete",
  "chats.view", "chats.reply", "chats.close",
  "knowledge.view", "knowledge.edit", "knowledge.delete",
  "bots.view", "bots.edit",
  "team.view", "team.manage", "team.permissions",
  "analytics.view",
  "settings.view", "settings.edit",
];

const ROLE_PERMISSIONS = {
  admin: ["*"],
  support: [
    "dashboard.view", "tickets.view", "tickets.create", "tickets.edit",
    "chats.view", "chats.reply", "chats.close", "knowledge.view",
    "analytics.view", "settings.view", "team.view",
  ],
  developer: [
    "dashboard.view", "tickets.view", "tickets.create", "tickets.edit", "tickets.delete",
    "chats.view", "chats.reply", "knowledge.view", "knowledge.edit",
    "bots.view", "bots.edit", "analytics.view", "settings.view", "team.view",
  ],
  qa: [
    "dashboard.view", "tickets.view", "tickets.edit", "chats.view",
    "knowledge.view", "analytics.view", "team.view",
  ],
  viewer: ["dashboard.view", "tickets.view", "analytics.view"],
};

function roleBase(role) {
  if (role === "super_admin") return [...ALL_PERMISSIONS];
  const perms = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.viewer;
  if (perms.includes("*")) return [...ALL_PERMISSIONS];
  return perms;
}

export function resolvePermissions(role, overrides = {}) {
  const base = new Set(roleBase(role));
  const grants = new Set(overrides.grant || overrides.grants || []);
  const denies = new Set(overrides.deny || overrides.denies || []);
  const effective = [...base, ...grants].filter((p) => !denies.has(p));
  if (role === "admin" && !denies.size) return [...ALL_PERMISSIONS];
  return effective.filter((p) => ALL_PERMISSIONS.includes(p));
}

/** Ensure user.permissions is populated (API may omit on older backend). */
export function ensureUserPermissions(user) {
  if (!user) return user;
  if (user.permissions?.length) return user;
  return {
    ...user,
    permissions: resolvePermissions(user.role, user.permission_overrides || {}),
  };
}

export function can(user, permission) {
  if (!user) return false;
  if (user.role === "super_admin" || user.role === "admin") return true;
  const u = ensureUserPermissions(user);
  return (u.permissions || []).includes(permission);
}

export function canNav(user, key) {
  const perm = NAV_PERMISSIONS[key];
  return perm ? can(user, perm) : false;
}

export const ROLE_LABELS = {
  admin: "Admin",
  support: "Support",
  developer: "Developer",
  qa: "QA",
  viewer: "Viewer",
};

const APP_ROUTE_ORDER = [
  ["dashboard.view", "/app", "dashboard"],
  ["tickets.view", "/app/tickets", "tickets"],
  ["tickets.view", "/app/inbox", "inbox"],
  ["chats.view", "/app/chats", "chats"],
  ["knowledge.view", "/app/knowledge", "knowledge"],
  ["bots.view", "/app/bots", "bots"],
  ["team.view", "/app/users", "users"],
  ["analytics.view", "/app/analytics", "analytics"],
  ["settings.view", "/app/settings", "settings"],
];

export function firstAppPath(user, tenant = null) {
  if (!user) return "/login";
  if (user.role === "super_admin") return "/superadmin";
  for (const [perm, path, navKey] of APP_ROUTE_ORDER) {
    if (!can(user, perm)) continue;
    if (tenant && navKey !== "dashboard" && !canNavModule(tenant, navKey)) continue;
    return path;
  }
  return "/app/settings";
}
