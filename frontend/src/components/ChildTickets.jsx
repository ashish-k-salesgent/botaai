import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, GitBranch, Plus, X } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import AttachmentUpload from "@/components/AttachmentUpload";
import TagInput from "@/components/TagInput";
import { TICKET_CATEGORIES, formatDueDate, isSubtaskComplete } from "@/lib/tickets";

export default function ChildTickets({
  parent,
  childTickets = [],
  canCreate,
  boardSpace,
  onCreated,
}) {
  const [open, setOpen] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    priority: "medium",
    category: "Task",
    due_date: "",
    tags: [],
    attachments: [],
  });

  const spaceQ = boardSpace || parent.space_id ? `?space=${boardSpace || parent.space_id}` : "";

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setLoading(true);
    try {
      await api.post("/tickets", {
        ...form,
        parent_id: parent.id,
        space_id: parent.space_id,
        due_date: form.due_date || null,
      });
      toast.success("Child ticket created");
      setModalOpen(false);
      setForm({
        title: "",
        description: "",
        priority: "medium",
        category: "Task",
        due_date: "",
        tags: [],
        attachments: [],
      });
      onCreated?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create child ticket");
    } finally {
      setLoading(false);
    }
  };

  // Only show child section on parent tickets (not on children themselves)
  if (parent.parent_id) return null;

  const total = childTickets.length;
  const done = childTickets.filter((c) => isSubtaskComplete(c)).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <>
      <div className="border-t border-[var(--border)]">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="w-full px-5 py-3 flex items-center justify-between text-xs font-mono hover:bg-[var(--bg-soft)]"
        >
          <span className="inline-flex items-center gap-1.5">
            <GitBranch size={12} />
            Subtasks
            <span className="text-[var(--text-muted)]">({total})</span>
            {total > 0 && (
              <span className={done === total ? "text-green-700" : "text-[var(--brand-primary)]"}>
                · {done}/{total} done
              </span>
            )}
          </span>
          <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div className="px-5 pb-4">
            <p className="text-[10px] text-[var(--text-muted)] mb-3 leading-relaxed">
              Each subtask has its own status column on the board (enable <strong>Show subtasks</strong>).
              Counts as done when status is Done or Closed.
            </p>
            {total > 0 && (
              <div className="mb-3">
                <div className="h-1.5 bg-[var(--bg-soft)] border border-[var(--border)] overflow-hidden">
                  <div
                    className={`h-full ${done === total ? "bg-green-600" : "bg-[var(--brand-primary)]"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )}
            {total === 0 && (
              <p className="text-xs text-[var(--text-muted)] mb-3">No child tickets yet.</p>
            )}
            <div className="space-y-2 mb-3">
              {childTickets.map((c) => {
                const overdue = c.is_overdue;
                return (
                  <Link
                    key={c.id}
                    to={`/app/tickets/${c.id}${spaceQ}`}
                    className={`block border p-3 hover:bg-[var(--bg-soft)] ${
                      overdue ? "border-red-300 border-l-2 border-l-red-500" : "border-[var(--border)]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className={`font-mono text-[10px] ${overdue ? "text-red-600" : "text-[var(--text-muted)]"}`}>
                        {c.code}
                      </span>
                      <span className="text-[10px] font-mono border border-[var(--border)] px-1 py-0.5">
                        {c.status.replace("_", " ")}
                      </span>
                    </div>
                    <div className="text-sm font-semibold mb-1">{c.title}</div>
                    <div className="flex flex-wrap gap-3 text-[10px] font-mono text-[var(--text-muted)]">
                      <span>{c.priority}</span>
                      <span>{c.category}</span>
                      {c.assignee_name && <span>{c.assignee_name}</span>}
                      {c.due_date && (
                        <span className={overdue ? "text-red-600" : ""}>
                          Due {formatDueDate(c.due_date)}
                        </span>
                      )}
                      {c.qa_total > 0 && (
                        <span className={c.qa_done === c.qa_total ? "text-green-700" : ""}>
                          QA {c.qa_done}/{c.qa_total}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
            {canCreate && (
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="inline-flex items-center gap-1 text-xs font-mono text-[var(--brand-primary)] hover:underline"
              >
                <Plus size={12} /> Add child ticket
              </button>
            )}
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={submit} className="modal-shell w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)] sticky top-0 modal-header">
              <span className="label-mono">Child of {parent.code}</span>
              <button type="button" onClick={() => setModalOpen(false)}><X size={16} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="label-mono block mb-1">Title *</label>
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="field-input"
                />
              </div>
              <div>
                <label className="label-mono block mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="field-input resize-y"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-mono block mb-1">Priority</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    className="field-input-sm"
                  >
                    {["low", "medium", "high", "critical"].map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label-mono block mb-1">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="field-input-sm"
                  >
                    {TICKET_CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="label-mono block mb-1">Due date</label>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                  className="field-input"
                />
              </div>
              <AttachmentUpload
                value={form.attachments}
                onChange={(attachments) => setForm({ ...form, attachments })}
              />
              <div>
                <label className="label-mono block mb-1">Tags</label>
                <TagInput tags={form.tags} onChange={(tags) => setForm({ ...form, tags })} />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-[var(--border)] flex justify-end gap-2 sticky bottom-0 modal-header">
              <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm border border-[var(--border)] text-[var(--text-primary)]">
                Cancel
              </button>
              <button type="submit" disabled={loading} className="px-4 py-2 text-sm btn-primary">
                {loading ? "Creating…" : "Create child"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
