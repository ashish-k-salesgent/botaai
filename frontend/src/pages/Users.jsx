import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

const ROLES = ["admin", "support", "developer", "qa", "viewer"];

export default function Users() {
  const [users, setUsers] = useState([]);
  const [open, setOpen] = useState(false);

  const load = () => api.get("/users").then((r) => setUsers(r.data));
  useEffect(() => { load(); }, []);

  return (
    <div className="p-8 max-w-5xl mx-auto" data-testid="users-page">
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <div className="label-mono text-[var(--brand-primary)] mb-2">/ Team</div>
          <h1 className="font-display font-black tracking-tighter text-4xl">Members &amp; Roles</h1>
        </div>
        <button onClick={() => setOpen(true)} data-testid="add-user-btn" className="inline-flex items-center gap-2 bg-[var(--text-primary)] text-white px-4 py-2 text-sm font-semibold hover:bg-black">
          <Plus size={14} /> Add member
        </button>
      </div>

      <div className="border border-[var(--border)] bg-white">
        <div className="grid grid-cols-12 gap-4 px-5 py-2 border-b border-[var(--border)] bg-[var(--bg-soft)] label-mono">
          <span className="col-span-4">Name</span>
          <span className="col-span-4">Email</span>
          <span className="col-span-3">Role</span>
          <span className="col-span-1"></span>
        </div>
        {users.map((u) => (
          <div key={u.id} className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-[var(--border)] text-sm items-center hover:bg-[var(--bg-soft)]">
            <span className="col-span-4 font-semibold">{u.name}</span>
            <span className="col-span-4 font-mono text-xs">{u.email}</span>
            <select
              value={u.role}
              onChange={async (e) => {
                await api.patch(`/users/${u.id}`, { role: e.target.value });
                toast.success("Role updated");
                load();
              }}
              data-testid={`user-role-${u.id}`}
              className="col-span-3 border border-[var(--border)] px-2 py-1 text-sm"
            >
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
            <button
              onClick={async () => {
                if (!window.confirm("Remove member?")) return;
                await api.delete(`/users/${u.id}`);
                toast.success("Removed");
                load();
              }}
              data-testid={`user-delete-${u.id}`}
              className="col-span-1 text-[var(--text-muted)] hover:text-[var(--brand-destructive)] justify-self-end"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {open && <AddUserModal onClose={() => setOpen(false)} onDone={() => { setOpen(false); load(); }} />}
    </div>
  );
}

function AddUserModal({ onClose, onDone }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "support" });
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/users", form);
      toast.success("Member added");
      onDone();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed");
    } finally { setLoading(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white border border-[var(--text-primary)] w-full max-w-md" data-testid="add-user-modal">
        <div className="px-5 py-3 border-b border-[var(--border)] label-mono">Add team member</div>
        <div className="p-5 space-y-4">
          {[["name", "Name", "text"], ["email", "Email", "email"], ["password", "Temp password", "password"]].map(([k, label, type]) => (
            <div key={k}>
              <label className="label-mono block mb-1">{label}</label>
              <input required type={type} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} data-testid={`new-user-${k}`} className="w-full border border-[var(--border)] px-3 py-2 text-sm" />
            </div>
          ))}
          <div>
            <label className="label-mono block mb-1">Role</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} data-testid="new-user-role" className="w-full border border-[var(--border)] px-3 py-2 text-sm">
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-[var(--border)] flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-[var(--border)]">Cancel</button>
          <button disabled={loading} data-testid="new-user-submit" className="px-4 py-2 text-sm bg-[var(--brand-primary)] text-white">
            {loading ? "Adding…" : "Add"}
          </button>
        </div>
      </form>
    </div>
  );
}
