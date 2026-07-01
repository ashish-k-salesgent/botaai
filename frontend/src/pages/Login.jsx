import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { firstAppPath } from "@/lib/permissions";
import { toast } from "sonner";

export default function Login() {
  const { login, user, tenant, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const blockedReason = params.get("reason");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && user) nav(firstAppPath(user, tenant), { replace: true });
  }, [user, authLoading, nav, tenant]);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const r = await login(email, password);
      toast.success(`Welcome back, ${r.user.name}`);
      nav(firstAppPath(r.user, r.data.tenant), { replace: true });
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-[var(--inverse-bg)] text-[var(--inverse-fg)] p-12 grid-bg">
        <Link to="/" className="font-display font-black text-2xl">BotAAI</Link>
        <div>
          <h1 className="font-display font-black tracking-tighter text-5xl leading-tight">
            Welcome back.<br />Your tickets miss you.
          </h1>
          <p className="opacity-60 mt-4 max-w-sm">
            Sign in to your admin dashboard, manage live chats, and ship faster fixes.
          </p>
        </div>
        <div className="label-mono opacity-40">© 2026 BotAAI</div>
      </div>

      <div className="flex items-center justify-center p-8">
        <form onSubmit={submit} className="w-full max-w-sm" data-testid="login-form">
          <div className="label-mono text-[var(--brand-primary)] mb-2">/ Login</div>
          <h2 className="font-display font-black tracking-tighter text-4xl mb-8">Sign in</h2>

          {blockedReason === "expired" && (
            <div className="mb-4 p-3 border border-amber-300 bg-amber-50 text-amber-900 text-xs">
              Your 14-day trial has ended. Sign in is disabled until you upgrade — contact support.
            </div>
          )}
          {blockedReason === "suspended" && (
            <div className="mb-4 p-3 border border-red-300 bg-red-50 text-red-900 text-xs">
              This workspace is suspended. Contact support to restore access.
            </div>
          )}

          <label className="label-mono block mb-1">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            data-testid="login-email"
            className="field-input mb-4"
            placeholder="you@company.com"
          />

          <label className="label-mono block mb-1">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            data-testid="login-password"
            className="field-input mb-6"
            placeholder="••••••••"
          />

          <button
            type="submit"
            disabled={submitting}
            data-testid="login-submit"
            className="w-full btn-primary py-3 text-sm font-semibold disabled:opacity-50"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>

          <div className="mt-6 text-sm text-[var(--text-secondary)]">
            No account?{" "}
            <Link to="/signup" className="text-[var(--brand-primary)] font-semibold underline underline-offset-4">
              Start free trial
            </Link>
          </div>

          <div className="mt-8 p-3 border border-dashed border-[var(--border)] text-xs font-mono text-[var(--text-secondary)]">
            <div className="label-mono mb-1">Super admin (demo)</div>
            super@botaai.io / SuperAdmin@123
          </div>
        </form>
      </div>
    </div>
  );
}
