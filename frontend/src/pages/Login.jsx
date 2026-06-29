import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await login(email, password);
      toast.success(`Welcome back, ${r.user.name}`);
      nav(r.user.role === "super_admin" ? "/superadmin" : "/app");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-[var(--text-primary)] text-white p-12 grid-bg">
        <Link to="/" className="font-display font-black text-2xl">BotAAI</Link>
        <div>
          <h1 className="font-display font-black tracking-tighter text-5xl leading-tight">
            Welcome back.<br />Your tickets miss you.
          </h1>
          <p className="text-white/60 mt-4 max-w-sm">
            Sign in to your admin dashboard, manage live chats, and ship faster fixes.
          </p>
        </div>
        <div className="label-mono text-white/40">© 2026 BotAAI</div>
      </div>

      <div className="flex items-center justify-center p-8">
        <form onSubmit={submit} className="w-full max-w-sm" data-testid="login-form">
          <div className="label-mono text-[var(--brand-primary)] mb-2">/ Login</div>
          <h2 className="font-display font-black tracking-tighter text-4xl mb-8">Sign in</h2>

          <label className="label-mono block mb-1">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            data-testid="login-email"
            className="w-full border border-[var(--border)] px-3 py-2 text-sm mb-4 focus:border-[var(--brand-primary)]"
            placeholder="you@company.com"
          />

          <label className="label-mono block mb-1">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            data-testid="login-password"
            className="w-full border border-[var(--border)] px-3 py-2 text-sm mb-6 focus:border-[var(--brand-primary)]"
            placeholder="••••••••"
          />

          <button
            type="submit"
            disabled={loading}
            data-testid="login-submit"
            className="w-full bg-[var(--brand-primary)] text-white py-3 text-sm font-semibold hover:bg-[var(--brand-primary-hover)] disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
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
