import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";

const COLUMNS = [
  { id: "new", label: "New" },
  { id: "open", label: "Open" },
  { id: "in_progress", label: "In Progress" },
  { id: "development", label: "Development" },
  { id: "qa", label: "QA" },
  { id: "testing", label: "Testing" },
  { id: "waiting", label: "Waiting" },
  { id: "done", label: "Done" },
  { id: "closed", label: "Closed" },
];

const PRIORITY_COLOR = { low: "#9CA3AF", medium: "#FFCC00", high: "#FF8C00", critical: "#FF3B30" };

export default function Tickets() {
  const [tickets, setTickets] = useState([]);
  const [open, setOpen] = useState(false);

  const load = () => api.get("/tickets").then((r) => setTickets(r.data));
  useEffect(() => { load(); }, []);

  const onDrop = async (status, e) => {
    e.preventDefault();
    e.currentTarget.classList.remove("drag-over");
    const id = e.dataTransfer.getData("ticket-id");
    if (!id) return;
    const t = tickets.find((x) => x.id === id);
    if (!t || t.status === status) return;
    setTickets((curr) => curr.map((x) => (x.id === id ? { ...x, status } : x)));
    try {
      await api.patch(`/tickets/${id}`, { status });
      toast.success(`Moved to ${status.replace("_", " ")}`);
    } catch {
      toast.error("Failed to update");
      load();
    }
  };

  return (
    <div className="p-6 h-full flex flex-col" data-testid="tickets-page">
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <div className="label-mono text-[var(--brand-primary)] mb-2">/ Tickets</div>
          <h1 className="font-display font-black tracking-tighter text-4xl">Board</h1>
        </div>
        <button
          onClick={() => setOpen(true)}
          data-testid="new-ticket-btn"
          className="inline-flex items-center gap-2 bg-[var(--text-primary)] text-white px-4 py-2 text-sm font-semibold hover:bg-black"
        >
          <Plus size={14} /> New ticket
        </button>
      </div>

      <div className="flex-1 overflow-x-auto no-scrollbar pb-4">
        <div className="flex gap-3 min-w-max">
          {COLUMNS.map((c) => {
            const items = tickets.filter((t) => t.status === c.id);
            return (
              <div
                key={c.id}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("drag-over"); }}
                onDragLeave={(e) => e.currentTarget.classList.remove("drag-over")}
                onDrop={(e) => onDrop(c.id, e)}
                data-testid={`kanban-column-${c.id}`}
                className="w-72 border border-[var(--border)] bg-white flex flex-col"
              >
                <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between bg-[var(--bg-soft)]">
                  <span className="label-mono">{c.label}</span>
                  <span className="text-xs font-mono text-[var(--text-muted)]">{items.length}</span>
                </div>
                <div className="p-2 space-y-2 min-h-[200px] flex-1">
                  {items.map((t) => (
                    <Link
                      key={t.id}
                      to={`/app/tickets/${t.id}`}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("ticket-id", t.id);
                        e.currentTarget.classList.add("dragging");
                      }}
                      onDragEnd={(e) => e.currentTarget.classList.remove("dragging")}
                      data-testid={`ticket-card-${t.code}`}
                      className="ticket-card block border border-[var(--border)] bg-white p-3 cursor-grab active:cursor-grabbing"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="label-mono text-[var(--text-muted)]">{t.code}</span>
                        <span
                          className="w-2 h-2"
                          style={{ background: PRIORITY_COLOR[t.priority] || "#9CA3AF" }}
                          title={t.priority}
                        />
                      </div>
                      <div className="text-sm font-semibold leading-tight mb-2">{t.title}</div>
                      <div className="flex items-center justify-between text-xs font-mono text-[var(--text-muted)]">
                        <span>{t.category}</span>
                        {t.assignee_name ? <span>· {t.assignee_name}</span> : <span>· unassigned</span>}
                      </div>
                    </Link>
                  ))}
                  {items.length === 0 && (
                    <div className="text-xs text-[var(--text-muted)] py-6 text-center font-mono">empty</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {open && <NewTicketModal onClose={() => setOpen(false)} onCreated={() => { setOpen(false); load(); }} />}
    </div>
  );
}

function NewTicketModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", category: "Bug" });
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/tickets", form);
      toast.success("Ticket created");
      onCreated();
    } catch {
      toast.error("Failed");
    } finally { setLoading(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white border border-[var(--text-primary)] w-full max-w-md" data-testid="new-ticket-modal">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
          <span className="label-mono">New ticket</span>
          <button type="button" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="label-mono block mb-1">Title</label>
            <input
              required value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              data-testid="ticket-title"
              className="w-full border border-[var(--border)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="label-mono block mb-1">Description</label>
            <textarea
              required value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={4}
              data-testid="ticket-description"
              className="w-full border border-[var(--border)] px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-mono block mb-1">Priority</label>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full border border-[var(--border)] px-3 py-2 text-sm">
                {["low", "medium", "high", "critical"].map((x) => <option key={x}>{x}</option>)}
              </select>
            </div>
            <div>
              <label className="label-mono block mb-1">Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full border border-[var(--border)] px-3 py-2 text-sm">
                {["Question", "Bug", "Feature Request", "Billing", "Integration", "Performance", "Login Issue", "Technical Support"].map((x) => <option key={x}>{x}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-[var(--border)] flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-[var(--border)]">Cancel</button>
          <button type="submit" disabled={loading} data-testid="ticket-submit" className="px-4 py-2 text-sm bg-[var(--brand-primary)] text-white">
            {loading ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
