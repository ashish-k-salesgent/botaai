import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import TagInput from "@/components/TagInput";
import { resolveWorkflowColumns } from "@/lib/workflow";
import { useAuth } from "@/lib/auth";

const PRIORITIES = ["low", "medium", "high", "critical"];

function blockValue(blocked) {
  if (!blocked?.type) return "";
  if (blocked.type === "ticket" && blocked.ticket_id) return `ticket:${blocked.ticket_id}`;
  if (blocked.type === "user" && blocked.user_id) return `user:${blocked.user_id}`;
  return "";
}

export default function TicketSidebar({
  ticket,
  ticketId,
  users,
  allTickets,
  blockDraft,
  setBlockDraft,
  onPatch,
  onSaveBlocked,
  onDelete,
}) {
  const { tenant } = useAuth();
  const workflowColumns = resolveWorkflowColumns(tenant);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);

  const assignees = ticket.assignees?.length
    ? ticket.assignees
    : ticket.assignee_id
      ? [{ id: ticket.assignee_id, name: ticket.assignee_name }]
      : [];

  const available = users.filter((u) => !assignees.some((a) => a.id === u.id));

  const setAssignees = (next) => {
    onPatch({ assignees: next.map((a) => ({ id: a.id })) });
  };

  const blocked = ticket.blocked_by;
  const blockedSelect = blockValue(blocked) || blockValue({
    type: blockDraft.type,
    ticket_id: blockDraft.ticket_id,
    user_id: blockDraft.user_id,
  });

  const onBlockSelect = (val) => {
    if (!val) {
      onSaveBlocked({ type: "", ticket_id: "", user_id: "", note: "" });
      return;
    }
    const [kind, refId] = val.split(":");
    if (kind === "ticket") onSaveBlocked({ type: "ticket", ticket_id: refId, user_id: "", note: blockDraft.note });
    if (kind === "user") onSaveBlocked({ type: "user", user_id: refId, ticket_id: "", note: blockDraft.note });
  };

  return (
    <aside className="panel h-fit">
      <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-soft)]">
        <div className="label-mono text-[10px] text-[var(--text-muted)]">{ticket.code}</div>
        <div className="text-sm font-semibold truncate">{ticket.title}</div>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label-mono text-[10px] text-[var(--text-muted)] block mb-1">Status</label>
            <select
              value={ticket.status}
              onChange={(e) => onPatch({ status: e.target.value })}
              data-testid="ticket-status-select"
              className="field-input-sm"
            >
              {workflowColumns.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-mono text-[10px] text-[var(--text-muted)] block mb-1">Priority</label>
            <select
              value={ticket.priority}
              onChange={(e) => onPatch({ priority: e.target.value })}
              className="field-input-sm"
            >
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="label-mono text-[10px] text-[var(--text-muted)] block mb-1.5">Assignees</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {assignees.length === 0 && (
              <span className="text-xs text-[var(--text-muted)]">None</span>
            )}
            {assignees.map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1 text-xs font-mono border border-[var(--border)] bg-[var(--bg-soft)] px-2 py-0.5"
              >
                {a.name}
                <button
                  type="button"
                  onClick={() => setAssignees(assignees.filter((x) => x.id !== a.id))}
                  className="text-[var(--text-muted)] hover:text-[var(--brand-destructive)]"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          {available.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                const u = users.find((x) => x.id === e.target.value);
                if (u) setAssignees([...assignees, { id: u.id, name: u.name }]);
              }}
              className="field-input-sm text-[var(--text-secondary)]"
            >
              <option value="">+ Add assignee</option>
              {available.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          )}
        </div>

        {blocked && (
          <div className="text-xs font-mono alert-warning px-2.5 py-2 rounded-sm">
            Blocked by{" "}
            {blocked.type === "ticket" ? (
              <Link to={`/app/tickets/${blocked.ticket_id}`} className="font-semibold underline">
                {blocked.code}
              </Link>
            ) : (
              <span className="font-semibold">{blocked.name}</span>
            )}
            {blocked.note ? ` · ${blocked.note}` : ""}
            <button
              type="button"
              onClick={() => onSaveBlocked({ type: "", ticket_id: "", user_id: "", note: "" })}
              className="block mt-1 text-[10px] underline opacity-80 hover:opacity-100"
            >
              Clear blocker
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => setExtrasOpen((o) => !o)}
          className="w-full flex items-center justify-between text-xs font-mono text-[var(--text-secondary)] py-1"
        >
          <span>Tags & blocked by</span>
          {extrasOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        {extrasOpen && (
          <div className="space-y-3 pl-1 border-l-2 border-[var(--border)] ml-1 pl-3">
            <div>
              <label className="label-mono text-[10px] text-[var(--text-muted)] block mb-1">Tags</label>
              <TagInput tags={ticket.tags || []} onChange={(tags) => onPatch({ tags })} placeholder="Type tag, press Add" />
            </div>
            {!blocked && (
              <div>
                <label className="label-mono text-[10px] text-[var(--text-muted)] block mb-1">Blocked by</label>
                <select
                  value={blockedSelect}
                  onChange={(e) => onBlockSelect(e.target.value)}
                  className="field-input-sm mb-2"
                >
                  <option value="">Not blocked</option>
                  {allTickets.filter((x) => x.id !== ticketId).length > 0 && (
                    <optgroup label="Tickets">
                      {allTickets
                        .filter((x) => x.id !== ticketId)
                        .map((x) => (
                          <option key={x.id} value={`ticket:${x.id}`}>
                            {x.code} — {x.title.slice(0, 40)}
                          </option>
                        ))}
                    </optgroup>
                  )}
                  <optgroup label="Team">
                    {users.map((u) => (
                      <option key={u.id} value={`user:${u.id}`}>{u.name}</option>
                    ))}
                  </optgroup>
                </select>
                {blockedSelect && (
                  <input
                    value={blockDraft.note}
                    onChange={(e) => setBlockDraft((d) => ({ ...d, note: e.target.value }))}
                    onBlur={() => onSaveBlocked()}
                    placeholder="Reason (optional)"
                    className="field-input-sm"
                  />
                )}
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => setDetailsOpen((o) => !o)}
          className="w-full flex items-center justify-between text-xs font-mono text-[var(--text-secondary)] py-1 border-t border-[var(--border)] pt-3"
        >
          <span>Details</span>
          {detailsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        {detailsOpen && (
          <div className="text-xs font-mono text-[var(--text-muted)] space-y-1.5 pl-1">
            <div>Reporter: <span className="text-[var(--text-primary)]">{ticket.reporter_name || "—"}</span></div>
            <div>Email: <span className="text-[var(--text-primary)]">{ticket.reporter_email || "—"}</span></div>
            <div>Category: <span className="text-[var(--text-primary)]">{ticket.category}</span></div>
            <div>Created: <span className="text-[var(--text-primary)]">{new Date(ticket.created_at).toLocaleString()}</span></div>
          </div>
        )}

        <button
          type="button"
          onClick={onDelete}
          data-testid="ticket-delete-btn"
          className="w-full flex items-center justify-center gap-1.5 text-xs text-[var(--brand-destructive)] pt-2 hover:underline"
        >
          <Trash2 size={12} /> Delete ticket
        </button>
      </div>
    </aside>
  );
}
