/** Trial countdown helpers (14-day trial from trial_ends_at). */

function pad2(n) {
  return String(n).padStart(2, "0");
}

export function getTrialRemaining(tenant, now = Date.now()) {
  if (!tenant || tenant.status !== "trial" || !tenant.trial_ends_at) return null;
  const end = new Date(tenant.trial_ends_at);
  if (Number.isNaN(end.getTime())) return null;

  const ms = end.getTime() - now;
  if (ms <= 0) {
    return { expired: true, timer: "00:00:00", tone: "danger", days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);

  const timer =
    days > 0
      ? `${days}d ${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`
      : `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;

  const tone = days < 1 ? "danger" : days < 3 ? "warn" : "muted";

  return { expired: false, timer, days, hours, minutes, seconds, tone };
}

export function isTenantBlocked(tenant) {
  return tenant?.status === "expired" || tenant?.status === "suspended";
}
