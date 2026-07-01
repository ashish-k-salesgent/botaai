import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, Trash2, Shield, RefreshCw, Plus } from "lucide-react";
import { DEFAULT_MODULES, MODULE_LABELS, resolveModules } from "@/lib/modules";

const PLANS = ["trial", "monthly", "quarterly", "yearly", "custom"];
const STATUSES = ["trial", "active", "suspended", "expired"];

function ModuleToggles({ value, onChange, compact = false, disabled = false }) {
  const mods = resolveModules(value);

  const set = (key, checked) => {
    if (disabled) return;
    const next = { ...mods, [key]: checked };
    if (key === "bot" && !checked) next.live_chat = false;
    if (key === "live_chat" && checked && !next.bot) return;
    onChange(next);
  };

  return (
    <div className={`flex ${compact ? "flex-col gap-1.5" : "flex-wrap gap-3"}`} onClick={(e) => e.stopPropagation()}>
      {Object.keys(MODULE_LABELS).map((k) => (
        <label
          key={k}
          className={`flex items-center gap-2 text-xs cursor-pointer select-none ${
            k === "live_chat" && !mods.bot ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          <input
            type="checkbox"
            className="module-checkbox"
            checked={!!mods[k]}
            disabled={disabled || (k === "live_chat" && !mods.bot)}
            onChange={(e) => set(k, e.target.checked)}
          />
          {MODULE_LABELS[k]}
        </label>
      ))}
    </div>
  );
}

export default function SuperAdmin() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [tenants, setTenants] = useState([]);
  const [stats, setStats] = useState(null);
  const [repairing, setRepairing] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    company_name: "",
    admin_name: "",
    admin_email: "",
    admin_password: "",
    plan: "trial",
    status: "trial",
    max_spaces: 0,
    modules: { ...DEFAULT_MODULES },
  });

  const load = () => {
    api.get("/admin/tenants").then((r) => {
      setTenants(
        r.data.map((t) => ({
          ...t,
          modules: resolveModules(t.modules),
        }))
      );
    });
    api.get("/admin/stats").then((r) => setStats(r.data));
  };

  useEffect(() => {
    if (user?.role !== "super_admin") { nav("/app"); return; }
    load();
  }, [user]);

  const update = async (id, patch, { silent = false } = {}) => {
    try {
      const r = await api.patch(`/admin/tenants/${id}`, patch);
      if (patch.modules) {
        const saved = resolveModules(r.data?.modules ?? patch.modules);
        setTenants((prev) => prev.map((t) => (t.id === id ? { ...t, modules: saved } : t)));
      } else {
        load();
      }
      if (!silent) toast.success("Updated");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Update failed");
      load();
    }
  };

  const updateModules = (id, modules) => {
    const next = resolveModules(modules);
    setTenants((prev) => prev.map((t) => (t.id === id ? { ...t, modules: next } : t)));
    update(id, { modules: next }, { silent: true });
  };

  const provisionBoards = async (id) => {
    setRepairing(id);
    try {
      const r = await api.post(`/admin/tenants/${id}/provision-boards`);
      toast.success(`Boards OK · ${r.data.tickets_moved_to_customer_inbox} ticket(s) moved`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to provision boards");
    } finally {
      setRepairing(null);
    }
  };

  const del = async (id) => {
    if (!window.confirm("Delete tenant + ALL data?")) return;
    await api.delete(`/admin/tenants/${id}`);
    toast.success("Tenant deleted");
    load();
  };

  const createTenant = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const r = await api.post("/admin/tenants", form);
      toast.success(`Tenant created · ${r.data.name}`);
      if (r.data.client_secret) {
        toast.message(`Client secret: ${r.data.client_secret}`, { duration: 12000 });
      }
      setCreateOpen(false);
      setForm({
        company_name: "",
        admin_name: "",
        admin_email: "",
        admin_password: "",
        plan: "trial",
        status: "trial",
        max_spaces: 0,
        modules: { ...DEFAULT_MODULES },
      });
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create tenant");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]" data-testid="superadmin-page">
      <header className="border-b border-[var(--border)] bg-[var(--bg)]">
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

        <div className="flex items-start justify-between gap-4 mb-6">
          <p className="text-sm text-[var(--text-muted)] max-w-3xl">
            Sell <strong>Boards</strong> (internal Kanban only), <strong>Bot + Knowledge</strong> (embed widget + Customer Inbox), and <strong>Live chat</strong> separately.
            Boards-only tenants get General + custom boards — no widget or Customer Inbox. Bot without Boards still captures widget tickets in Customer Inbox. Live chat requires Bot.
          </p>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            data-testid="create-tenant-btn"
            className="inline-flex items-center gap-2 btn-primary px-4 py-2 text-sm font-semibold shrink-0"
          >
            <Plus size={14} /> Create tenant
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-[var(--border)] border border-[var(--border)] mb-8">
          {stats && [
            ["Tenants", stats.tenants],
            ["Users", stats.users],
            ["Tickets", stats.tickets],
            ["Chats", stats.chats],
            ["KB docs", stats.kb_docs],
          ].map(([l, v]) => (
            <div key={l} className="panel p-5">
              <div className="label-mono text-[var(--text-muted)]">{l}</div>
              <div className="font-display font-black text-3xl mt-2">{v}</div>
            </div>
          ))}
        </div>

        <div className="panel overflow-x-auto">
          <div className="grid grid-cols-12 gap-2 px-5 py-2 border-b border-[var(--border)] bg-[var(--bg-soft)] label-mono text-[10px] min-w-[900px]">
            <span className="col-span-2">Name</span>
            <span className="col-span-2">Products</span>
            <span className="col-span-2">Status / Plan</span>
            <span className="col-span-1">Extra</span>
            <span className="col-span-2">Boards</span>
            <span className="col-span-1">Users</span>
            <span className="col-span-1">Tickets</span>
            <span className="col-span-1"></span>
          </div>
          {tenants.map((t) => (
            <div key={t.id} className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-[var(--border)] text-sm items-start min-w-[900px]">
              <div className="col-span-2">
                <div className="font-semibold">{t.name}</div>
                <div className="label-mono text-[var(--text-muted)] text-[10px]">{t.slug}</div>
              </div>
              <div className="col-span-2">
                <ModuleToggles
                  compact
                  value={t.modules}
                  onChange={(modules) => updateModules(t.id, modules)}
                />
              </div>
              <div className="col-span-2 space-y-1">
                <select value={t.status} onChange={(e) => update(t.id, { status: e.target.value })} className="w-full border border-[var(--border)] px-2 py-1 text-xs field-input-sm">
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
                <select value={t.plan} onChange={(e) => update(t.id, { plan: e.target.value })} className="w-full border border-[var(--border)] px-2 py-1 text-xs field-input-sm">
                  {PLANS.map((p) => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div className="col-span-1">
                <input
                  type="number"
                  min={0}
                  defaultValue={t.max_spaces}
                  onBlur={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!Number.isNaN(v) && v >= 0 && v !== t.max_spaces) update(t.id, { max_spaces: v });
                  }}
                  title="Extra custom boards (General always; Customer Inbox when Bot is on)"
                  className="w-full field-input-sm"
                />
              </div>
              <div className="col-span-2 text-[10px] font-mono leading-relaxed">
                {(t.modules?.boards ?? true) ? (
                  <>
                    <span className={t.has_general_board ? "text-green-700" : "text-red-600"}>General {t.has_general_board ? "✓" : "✗"}</span>
                    {(t.modules?.bot ?? true) && (
                      <>
                        {" · "}
                        <span className={t.has_customer_board ? "text-teal-700" : "text-red-600"}>Customer {t.has_customer_board ? "✓" : "✗"}</span>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => provisionBoards(t.id)}
                      disabled={repairing === t.id}
                      className="mt-1 flex items-center gap-1 text-[var(--brand-primary)] hover:underline disabled:opacity-50"
                    >
                      <RefreshCw size={10} className={repairing === t.id ? "animate-spin" : ""} />
                      Repair
                    </button>
                  </>
                ) : (t.modules?.bot ?? true) ? (
                  <>
                    <span className={t.has_customer_board ? "text-teal-700" : "text-red-600"}>Customer Inbox {t.has_customer_board ? "✓" : "✗"}</span>
                    <button
                      type="button"
                      onClick={() => provisionBoards(t.id)}
                      disabled={repairing === t.id}
                      className="mt-1 flex items-center gap-1 text-[var(--brand-primary)] hover:underline disabled:opacity-50"
                    >
                      <RefreshCw size={10} className={repairing === t.id ? "animate-spin" : ""} />
                      Repair
                    </button>
                  </>
                ) : (
                  <span className="text-[var(--text-muted)]">No board products</span>
                )}
              </div>
              <span className="col-span-1 font-mono text-xs">{t.user_count}</span>
              <span className="col-span-1 font-mono text-xs">{t.ticket_count}</span>
              <button onClick={() => del(t.id)} className="col-span-1 text-[var(--text-muted)] hover:text-[var(--brand-destructive)] justify-self-end">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {tenants.length === 0 && <div className="p-6 text-sm text-[var(--text-muted)]">No tenants yet.</div>}
        </div>
      </div>

      {createOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={createTenant} className="modal-shell w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-3 border-b border-[var(--border)] label-mono modal-header">Create tenant</div>
            <div className="p-5 space-y-4">
              {[["company_name", "Company name"], ["admin_name", "Admin name"], ["admin_email", "Admin email"], ["admin_password", "Admin password"]].map(([k, label]) => (
                <div key={k}>
                  <label className="label-mono block mb-1">{label}</label>
                  <input
                    required
                    type={k === "admin_password" ? "password" : k === "admin_email" ? "email" : "text"}
                    value={form[k]}
                    onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                    className="field-input"
                  />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-mono block mb-1">Plan</label>
                  <select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} className="field-input">
                    {PLANS.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label-mono block mb-1">Extra boards</label>
                  <input
                    type="number"
                    min={0}
                    value={form.max_spaces}
                    onChange={(e) => setForm({ ...form, max_spaces: parseInt(e.target.value, 10) || 0 })}
                    className="field-input"
                  />
                </div>
              </div>
              <div>
                <label className="label-mono block mb-2">Products</label>
                <ModuleToggles
                  value={form.modules}
                  onChange={(modules) => setForm({ ...form, modules })}
                />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-[var(--border)] flex justify-end gap-2">
              <button type="button" onClick={() => setCreateOpen(false)} className="px-4 py-2 text-sm border border-[var(--border)]">Cancel</button>
              <button type="submit" disabled={creating} className="px-4 py-2 text-sm btn-primary">{creating ? "Creating…" : "Create"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
