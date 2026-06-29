import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, Trash2, Shield } from "lucide-react";

export default function SuperAdmin() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [tenants, setTenants] = useState([]);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (user?.role !== "super_admin") { nav("/app"); return; }
    api.get("/admin/tenants").then((r) => setTenants(r.data));
    api.get("/admin/stats").then((r) => setStats(r.data));
  }, [user]);

  const update = async (id, patch) => {
    await api.patch(`/admin/tenants/${id}`, patch);
    toast.success("Updated");
    const r = await api.get("/admin/tenants"); setTenants(r.data);
  };

  const del = async (id) => {
    if (!window.confirm("Delete tenant + ALL data?")) return;
    await api.delete(`/admin/tenants/${id}`);
    toast.success("Tenant deleted");
    const r = await api.get("/admin/tenants"); setTenants(r.data);
  };

  return (
    <div className="min-h-screen bg-white" data-testid="superadmin-page">
      <header className="border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield size={18} className="text-[var(--brand-destructive)]" />
            <span className="font-display font-black tracking-tight text-xl">BotAAI · Super Admin</span>
          </div>
          <button onClick={logout} className="text-sm">Logout</button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <Link to="/" className="inline-flex items-center gap-2 text-sm mb-6"><ArrowLeft size={14} /> Home</Link>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-[var(--border)] border border-[var(--border)] mb-8">
          {stats && [
            ["Tenants", stats.tenants],
            ["Users", stats.users],
            ["Tickets", stats.tickets],
            ["Chats", stats.chats],
            ["KB docs", stats.kb_docs],
          ].map(([l, v]) => (
            <div key={l} className="bg-white p-5">
              <div className="label-mono text-[var(--text-muted)]">{l}</div>
              <div className="font-display font-black text-3xl mt-2">{v}</div>
            </div>
          ))}
        </div>

        <div className="border border-[var(--border)] bg-white">
          <div className="grid grid-cols-12 gap-2 px-5 py-2 border-b border-[var(--border)] bg-[var(--bg-soft)] label-mono">
            <span className="col-span-3">Name</span>
            <span className="col-span-2">Status</span>
            <span className="col-span-2">Plan</span>
            <span className="col-span-1">Users</span>
            <span className="col-span-1">Tickets</span>
            <span className="col-span-2">Created</span>
            <span className="col-span-1"></span>
          </div>
          {tenants.map((t) => (
            <div key={t.id} className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-[var(--border)] text-sm items-center">
              <div className="col-span-3">
                <div className="font-semibold">{t.name}</div>
                <div className="label-mono text-[var(--text-muted)]">{t.slug}</div>
              </div>
              <select value={t.status} onChange={(e) => update(t.id, { status: e.target.value })} data-testid={`tenant-status-${t.id}`} className="col-span-2 border border-[var(--border)] px-2 py-1 text-xs">
                {["trial", "active", "suspended", "expired"].map((s) => <option key={s}>{s}</option>)}
              </select>
              <select value={t.plan} onChange={(e) => update(t.id, { plan: e.target.value })} data-testid={`tenant-plan-${t.id}`} className="col-span-2 border border-[var(--border)] px-2 py-1 text-xs">
                {["trial", "monthly", "quarterly", "yearly", "custom"].map((p) => <option key={p}>{p}</option>)}
              </select>
              <span className="col-span-1 font-mono text-xs">{t.user_count}</span>
              <span className="col-span-1 font-mono text-xs">{t.ticket_count}</span>
              <span className="col-span-2 font-mono text-xs">{new Date(t.created_at).toLocaleDateString()}</span>
              <button onClick={() => del(t.id)} data-testid={`tenant-delete-${t.id}`} className="col-span-1 text-[var(--text-muted)] hover:text-[var(--brand-destructive)] justify-self-end">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {tenants.length === 0 && <div className="p-6 text-sm text-[var(--text-muted)]">No tenants yet.</div>}
        </div>
      </div>
    </div>
  );
}
