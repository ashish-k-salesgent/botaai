import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";

export default function AccountBlocked({ status = "expired" }) {
  const { logout, tenant } = useAuth();
  const expired = status === "expired";

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-[var(--bg-soft)]">
      <div className="panel max-w-md w-full p-8 text-center">
        <div className="label-mono text-[var(--brand-primary)] mb-2">/ {tenant?.name || "Workspace"}</div>
        <h1 className="font-display font-black text-3xl tracking-tighter mb-3">
          {expired ? "Trial ended" : "Account suspended"}
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          {expired
            ? "Your 14-day trial has ended. Upgrade to keep using BotAAI."
            : "This workspace is suspended. Contact support to restore access."}
        </p>
        <div className="flex flex-col gap-2">
          <a href="mailto:support@botaai.io" className="btn-primary py-2.5 text-sm font-semibold">
            Contact support
          </a>
          <button type="button" onClick={logout} className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            Sign out
          </button>
          <Link to="/" className="text-xs label-mono text-[var(--text-muted)] hover:underline">
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
