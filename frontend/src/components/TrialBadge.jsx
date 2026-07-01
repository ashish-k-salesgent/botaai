import { useEffect, useState } from "react";
import { getTrialRemaining } from "@/lib/trial";

export default function TrialBadge({ tenant }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (tenant?.status !== "trial") return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [tenant?.status, tenant?.trial_ends_at]);

  if (tenant?.status === "expired") {
    return <span className="text-[10px] font-mono text-red-600">Trial ended</span>;
  }
  if (tenant?.status === "suspended") {
    return <span className="text-[10px] font-mono text-red-600">Suspended</span>;
  }
  if (tenant?.status !== "trial") {
    return <span className="label-mono text-[var(--text-muted)]">{tenant?.plan?.toUpperCase()}</span>;
  }

  const rem = getTrialRemaining(tenant, now);
  if (!rem) {
    return <span className="label-mono text-[var(--text-muted)]">TRIAL</span>;
  }
  if (rem.expired) {
    return <span className="text-[10px] font-mono text-red-600">Trial ended</span>;
  }

  const toneCls =
    rem.tone === "danger"
      ? "text-red-600"
      : rem.tone === "warn"
        ? "text-amber-700"
        : "text-[var(--text-secondary)]";

  const endLabel = new Date(tenant.trial_ends_at).toLocaleString();

  return (
    <div
      className="mt-0.5"
      data-testid="trial-countdown"
      title={`Trial ends ${endLabel}`}
    >
      <div className="text-[9px] label-mono text-[var(--text-muted)] uppercase tracking-wider leading-none mb-1">
        Trial
      </div>
      <div className={`font-mono text-[11px] tabular-nums tracking-tight leading-none ${toneCls}`}>
        {rem.timer}
      </div>
    </div>
  );
}
