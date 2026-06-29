import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, Trash2 } from "lucide-react";
import { StatusBadge, PriorityBadge } from "./Dashboard";

const STATUSES = ["new", "open", "in_progress", "development", "qa", "testing", "waiting", "done", "closed"];

export default function TicketDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [t, setT] = useState(null);
  const [comment, setComment] = useState("");
  const [users, setUsers] = useState([]);

  const load = () => api.get(`/tickets/${id}`).then((r) => setT(r.data));
  useEffect(() => {
    load();
    api.get("/users").then((r) => setUsers(r.data));
  }, [id]);

  if (!t) return <div className="p-8 font-mono text-sm">Loading…</div>;

  const patch = async (changes) => {
    const r = await api.patch(`/tickets/${id}`, changes);
    setT(r.data);
    toast.success("Updated");
  };

  const addComment = async (e) => {
    e.preventDefault();
    if (!comment.trim()) return;
    await api.post(`/tickets/${id}/comments`, { body: comment });
    setComment("");
    load();
  };

  return (
    <div className="p-8 max-w-5xl mx-auto" data-testid="ticket-detail-page">
      <Link to="/app/tickets" className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] mb-6 hover:text-[var(--text-primary)]">
        <ArrowLeft size={14} /> Back to board
      </Link>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 border border-[var(--border)] bg-white">
          <div className="px-6 pt-6 pb-4 border-b border-[var(--border)]">
            <div className="flex items-center gap-3 mb-2">
              <span className="label-mono text-[var(--text-muted)]">{t.code}</span>
              <span className="label-mono text-[var(--brand-primary)]">{t.category}</span>
            </div>
            <h1 className="font-display font-black tracking-tighter text-3xl">{t.title}</h1>
            <p className="text-[var(--text-secondary)] mt-3 whitespace-pre-wrap text-sm">{t.description}</p>
          </div>

          <div className="px-6 py-4">
            <div className="label-mono mb-3">Comments ({(t.comments || []).length})</div>
            <div className="space-y-3 mb-4">
              {(t.comments || []).map((c) => (
                <div key={c.id} className="border border-[var(--border)] p-3">
                  <div className="flex items-center justify-between text-xs font-mono text-[var(--text-muted)] mb-1">
                    <span className="font-semibold text-[var(--text-primary)]">{c.author_name}</span>
                    <span>{new Date(c.created_at).toLocaleString()}</span>
                  </div>
                  <div className="text-sm">{c.body}</div>
                </div>
              ))}
            </div>
            <form onSubmit={addComment} className="flex gap-2">
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                data-testid="ticket-comment-input"
                placeholder="Leave a comment…"
                className="flex-1 border border-[var(--border)] px-3 py-2 text-sm"
              />
              <button data-testid="ticket-comment-submit" className="bg-[var(--brand-primary)] text-white px-4 text-sm font-semibold">Send</button>
            </form>
          </div>

          <div className="px-6 py-4 border-t border-[var(--border)]">
            <div className="label-mono mb-3">Activity</div>
            <ul className="space-y-1 text-xs font-mono text-[var(--text-muted)]">
              {(t.activity || []).map((a, i) => (
                <li key={i}>· {new Date(a.at).toLocaleString()} — {a.by} {a.event} {a.changes ? `(${a.changes.join(", ")})` : ""}</li>
              ))}
            </ul>
          </div>
        </div>

        <aside className="border border-[var(--border)] bg-white p-5 h-fit space-y-5">
          <div>
            <div className="label-mono mb-1">Status</div>
            <select
              value={t.status}
              onChange={(e) => patch({ status: e.target.value })}
              data-testid="ticket-status-select"
              className="w-full border border-[var(--border)] px-3 py-2 text-sm"
            >
              {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
          </div>
          <div>
            <div className="label-mono mb-1">Priority</div>
            <select value={t.priority} onChange={(e) => patch({ priority: e.target.value })} className="w-full border border-[var(--border)] px-3 py-2 text-sm">
              {["low", "medium", "high", "critical"].map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <div className="label-mono mb-1">Assignee</div>
            <select value={t.assignee_id || ""} onChange={(e) => patch({ assignee_id: e.target.value || null })} className="w-full border border-[var(--border)] px-3 py-2 text-sm">
              <option value="">— Unassigned</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
            </select>
          </div>
          <div className="pt-3 border-t border-[var(--border)] text-xs font-mono text-[var(--text-muted)] space-y-1">
            <div>Reporter: <span className="text-[var(--text-primary)]">{t.reporter_name || "—"}</span></div>
            <div>Email: <span className="text-[var(--text-primary)]">{t.reporter_email || "—"}</span></div>
            <div>Sentiment: <span className="text-[var(--text-primary)]">{t.sentiment}</span></div>
            <div>Urgency: <span className="text-[var(--text-primary)]">{t.urgency_score}</span></div>
            <div>Created: <span className="text-[var(--text-primary)]">{new Date(t.created_at).toLocaleString()}</span></div>
          </div>
          <button
            onClick={async () => {
              if (!window.confirm("Delete ticket?")) return;
              await api.delete(`/tickets/${id}`);
              toast.success("Deleted");
              nav("/app/tickets");
            }}
            data-testid="ticket-delete-btn"
            className="w-full flex items-center justify-center gap-2 border border-[var(--brand-destructive)] text-[var(--brand-destructive)] py-2 text-sm hover:bg-red-50"
          >
            <Trash2 size={14} /> Delete ticket
          </button>
        </aside>
      </div>
    </div>
  );
}
