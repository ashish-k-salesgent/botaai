/** Tenant product modules (boards, bot, live chat). */

export const DEFAULT_MODULES = { boards: true, bot: true, live_chat: true };

export const MODULE_LABELS = {
  boards: "Boards",
  bot: "Bot + Knowledge",
  live_chat: "Live chat",
};

export function resolveModules(modules) {
  const m = {
    boards: modules?.boards ?? DEFAULT_MODULES.boards,
    bot: modules?.bot ?? DEFAULT_MODULES.bot,
    live_chat: modules?.live_chat ?? DEFAULT_MODULES.live_chat,
  };
  if (m.live_chat && !m.bot) m.live_chat = false;
  return m;
}

export function tenantModules(tenant) {
  return resolveModules(tenant?.modules);
}

export function hasModule(tenant, key) {
  const m = tenantModules(tenant);
  if (key === "live_chat") return m.live_chat && m.bot;
  return !!m[key];
}

/** Bot without Boards: widget tickets go to Customer Inbox only. */
export function hasInboxOnly(tenant) {
  return hasModule(tenant, "bot") && !hasModule(tenant, "boards");
}

export function canNavModule(tenant, navKey) {
  if (navKey === "inbox") return hasInboxOnly(tenant);
  if (navKey === "tickets") return hasModule(tenant, "boards");
  const map = {
    chats: "live_chat",
    knowledge: "bot",
    bots: "bot",
  };
  const mod = map[navKey];
  if (!mod) return true;
  return hasModule(tenant, mod);
}
