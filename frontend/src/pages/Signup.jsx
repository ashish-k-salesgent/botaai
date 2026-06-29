import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export default function Signup() {
  const { signup } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: "", company_name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await signup(form);
      toast.success(`Trial activated · ${r.tenant.name}`);
      nav("/app");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-[var(--brand-primary)] text-white p-12">
        <Link to="/" className="font-display font-black text-2xl">BotAAI</Link>
        <div>
          <div className="label-mono text-white/60 mb-3">/ 14-day trial · No card</div>
          <h1 className="font-display font-black tracking-tighter text-5xl leading-tight">
            Spin up a tenant. <br />Ship a bot in 5.
          </h1>
          <ul className="mt-6 space-y-2 text-white/80">
            <li>→ Own bot, KB, tickets &amp; chat</li>
            <li>→ Auto Client ID + Secret</li>
            <li>→ Drop-in widget script</li>
            <li>→ Cancel anytime</li>
          </ul>
        </div>
        <div className="label-mono text-white/40">© 2026 BotAAI</div>
      </div>

      <div className="flex items-center justify-center p-8">
        <form onSubmit={submit} className="w-full max-w-sm" data-testid="signup-form">
          <div className="label-mono text-[var(--brand-primary)] mb-2">/ Create tenant</div>
          <h2 className="font-display font-black tracking-tighter text-4xl mb-8">Start trial</h2>

          {[
            ["company_name", "Company name", "Acme ERP", "text"],
            ["name", "Your name", "Ashish Kumar", "text"],
            ["email", "Work email", "you@company.com", "email"],
            ["password", "Password", "Min 8 chars", "password"],
          ].map(([k, label, ph, type]) => (
            <div key={k} className="mb-4">
              <label className="label-mono block mb-1">{label}</label>
              <input
                type={type}
                required
                minLength={type === "password" ? 6 : 0}
                value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                data-testid={`signup-${k}`}
                className="w-full border border-[var(--border)] px-3 py-2 text-sm focus:border-[var(--brand-primary)]"
                placeholder={ph}
              />
            </div>
          ))}

          <button
            type="submit"
            disabled={loading}
            data-testid="signup-submit"
            className="w-full bg-[var(--text-primary)] text-white py-3 text-sm font-semibold hover:bg-black disabled:opacity-50"
          >
            {loading ? "Provisioning…" : "Start free 14-day trial"}
          </button>

          <div className="mt-6 text-sm text-[var(--text-secondary)]">
            Have an account?{" "}
            <Link to="/login" className="text-[var(--brand-primary)] font-semibold underline underline-offset-4">
              Sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
