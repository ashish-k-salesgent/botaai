import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, ChevronDown, GitBranch, Trash2, X } from "lucide-react";
import AttachmentUpload from "@/components/AttachmentUpload";
import AttachmentList from "@/components/AttachmentList";
import TagInput from "@/components/TagInput";
import ChildTickets from "@/components/ChildTickets";
import QAScenarios from "@/components/QAScenarios";
import ConfirmDialog from "@/components/ConfirmDialog";
import BlockerPicker from "@/components/BlockerPicker";
import BoardSelect from "@/components/BoardSelect";
import { formatActivity } from "@/lib/activity";
import { can } from "@/lib/permissions";
import { useAuth } from "@/lib/auth";
import { formatDueDate, isTicketOverdue, isQaIncomplete, isCustomerTicket, qaIncompleteLabel } from "@/lib/tickets";
import { resolveWorkflowColumns } from "@/lib/workflow";

function SidebarField({ label, children }) {
  return (
    <div>
      <div className="label-mono text-[10px] text-[var(--text-muted)] mb-1.5">{label}</div>
      {children}
    </div>
  );
}

export default function TicketDetail() {
  const { user, tenant } = useAuth();
  const workflowColumns = resolveWorkflowColumns(tenant);
  const canEdit = can(user, "tickets.edit");
  const canDelete = can(user, "tickets.delete");
  const canCreate = can(user, "tickets.create");
  const canViewTeam = can(user, "team.view");
  const { id } = useParams();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const boardSpace = searchParams.get("space");
  const [t, setT] = useState(null);
  const [comment, setComment] = useState("");
  const [users, setUsers] = useState([]);
  const [blockDraft, setBlockDraft] = useState({ type: "", ticket_id: "", user_id: "", note: "" });
  const [showBlocker, setShowBlocker] = useState(false);
  const [showMeta, setShowMeta] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [spaces, setSpaces] = useState([]);
  const [moveTargetSpace, setMoveTargetSpace] = useState("");

  const load = () => api.get(`/tickets/${id}`).then((r) => setT(r.data)).catch((err) => {
    if (err.response?.status === 403) {
      toast.error(err.response?.data?.detail || "This ticket is in a locked space.");
      nav("/app/tickets");
    }
  });
  useEffect(() => {
    load();
    if (canViewTeam) api.get("/users").then((r) => setUsers(r.data));
    api.get("/spaces").then((r) => setSpaces(r.data?.spaces || [])).catch(() => {});
  }, [id, canViewTeam]);

  useEffect(() => {
    if (!t) return;
    setBlockDraft({
      type: t.blocked_by?.type || "",
      ticket_id: t.blocked_by?.ticket_id || "",
      user_id: t.blocked_by?.user_id || "",
      note: t.blocked_by?.note || "",
    });
    setShowBlocker(!!t.blocked_by);
  }, [t?.id, t?.blocked_by, t?.updated_at]);

  if (!t) return <div className="p-8 font-mono text-sm">Loading…</div>;

  const assignees = t.assignees?.length
    ? t.assignees
    : t.assignee_id
      ? [{ id: t.assignee_id, name: t.assignee_name }]
      : [];

  const customerSpace = spaces.find((s) => s.is_customer);
  const currentSpace = spaces.find((s) => s.id === t.space_id);
  const otherSpaces = spaces.filter((s) => s.id !== t.space_id);
  const onCustomerBoard = Boolean(customerSpace && t.space_id === customerSpace.id);

  const moveToBoard = async (spaceId) => {
    if (!canEdit || !spaceId || spaceId === t.space_id) return;
    const space = spaces.find((s) => s.id === spaceId);
    if (!space) return;
    const changes = { space_id: spaceId };
    if (onCustomerBoard && !space.is_customer && t.status === "new") {
      changes.status = "open";
    }
    await patch(changes, true);
    toast.success(`Moved to ${space.name}`);
    setMoveTargetSpace("");
    nav(`/app/tickets/${id}?space=${spaceId}`, { replace: true });
  };

  const patch = async (changes, quiet = false) => {
    if (!canEdit) return;
    try {
      const r = await api.patch(`/tickets/${id}`, changes);
      setT(r.data);
      if (!quiet) toast.success("Saved");
    } catch (err) {
      const msg = err?.response?.data?.detail;
      toast.error(typeof msg === "string" ? msg : "Update failed");
    }
  };

  const saveBlockedBy = async (overrides = {}) => {
    const draft = { ...blockDraft, ...overrides };
    setBlockDraft(draft);
    if (!draft.type) {
      await patch({ blocked_by: null });
      setShowBlocker(false);
      return;
    }
    if (draft.type === "ticket") {
      if (!draft.ticket_id) return;
      await patch({ blocked_by: { type: "ticket", ticket_id: draft.ticket_id, note: draft.note || "" } });
      return;
    }
    if (draft.type === "user" && draft.user_id) {
      await patch({ blocked_by: { type: "user", user_id: draft.user_id, note: draft.note || "" } });
    }
  };

  const clearBlocker = () => saveBlockedBy({ type: "", ticket_id: "", user_id: "", note: "" });

  const applyBlocker = (draft) => {
    setBlockDraft((prev) => ({ ...prev, ...draft }));
    saveBlockedBy(draft);
  };

  const addAssignee = (userId) => {
    if (!userId || assignees.some((a) => a.id === userId)) return;
    const user = users.find((u) => u.id === userId);
    if (!user) return;
    patch({ assignees: [...assignees, { id: user.id }].map((a) => ({ id: a.id })) }, true);
  };

  const removeAssignee = (userId) => {
    patch({ assignees: assignees.filter((a) => a.id !== userId).map((a) => ({ id: a.id })) }, true);
  };

  const addComment = async (e) => {
    e.preventDefault();
    if (!canEdit || !comment.trim()) return;
    await api.post(`/tickets/${id}/comments`, { body: comment });
    setComment("");
    load();
  };

  const unassignedUsers = users.filter((u) => !assignees.some((a) => a.id === u.id));

  const backToBoard = boardSpace || t?.space_id
    ? `/app/tickets?space=${boardSpace || t?.space_id}`
    : "/app/tickets";

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto" data-testid="ticket-detail-page">
      <Link to={backToBoard} className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] mb-5 hover:text-[var(--text-primary)]">
        <ArrowLeft size={14} /> Back to board
      </Link>

      <div className="grid lg:grid-cols-[1fr_280px] gap-6 min-w-0">
        {/* Main */}
        <div className="border border-[var(--border)] bg-[var(--bg)] min-w-0">
          <div className="px-5 py-5 border-b border-[var(--border)]">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="label-mono text-[var(--text-muted)]">{t.code}</span>
              <span className="label-mono text-[var(--brand-primary)]">{t.category}</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 border border-[var(--border)]">{t.priority}</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 border border-[var(--border)]">{t.status.replace("_", " ")}</span>
              {isCustomerTicket(t) && (
                <span className="alert-banner alert-customer text-[10px] px-1.5 py-0.5 inline-block">
                  Customer ticket
                </span>
              )}
              {(t.child_count > 0) && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 border border-[var(--brand-primary)] text-[var(--brand-primary)] inline-flex items-center gap-1">
                  <GitBranch size={10} />
                  {t.child_done ?? 0}/{t.child_count} subtasks
                </span>
              )}
            </div>
            <h1 className="font-display font-black tracking-tighter text-2xl lg:text-3xl">{t.title}</h1>
            {t.parent_id && t.parent_code && (
              <div className="mt-2 text-xs font-mono">
                Child of{" "}
                <Link
                  to={`/app/tickets/${t.parent_id}${boardSpace || t.space_id ? `?space=${boardSpace || t.space_id}` : ""}`}
                  className="text-[var(--brand-primary)] font-semibold hover:underline"
                >
                  {t.parent_code}
                </Link>
                {t.parent_title ? ` · ${t.parent_title}` : ""}
              </div>
            )}
            {(t.due_date || isTicketOverdue(t)) && (
              <div className={`mt-2 alert-banner inline-block ${isTicketOverdue(t) ? "alert-danger" : "border-[var(--border)] text-[var(--text-secondary)]"}`}>
                Due {formatDueDate(t.due_date)}{isTicketOverdue(t) ? " · OVERDUE" : ""}
              </div>
            )}
            {t.blocked_by && (
              <div className="mt-3 alert-banner alert-warning">
                Blocked by{" "}
                {t.blocked_by.type === "ticket" ? (
                  <Link to={`/app/tickets/${t.blocked_by.ticket_id}`} className="font-semibold">{t.blocked_by.code}</Link>
                ) : (
                  <span className="font-semibold">{t.blocked_by.name}</span>
                )}
                {t.blocked_by.note ? ` · ${t.blocked_by.note}` : ""}
              </div>
            )}
            {isQaIncomplete(t) && (
              <div className="mt-3 alert-banner alert-warning">
                QA scenarios incomplete — {qaIncompleteLabel(t)}. Complete all scenarios before QA sign-off.
              </div>
            )}
            <p className="text-[var(--text-secondary)] mt-3 whitespace-pre-wrap text-sm leading-relaxed">{t.description}</p>
          </div>

          <div className="px-5 py-4 border-b border-[var(--border)]">
              <div className="flex items-center justify-between mb-3">
                <span className="label-mono text-xs">Attachments</span>
                {canEdit && (
                <AttachmentUpload
                  showList={false}
                  label="Add"
                  value={t.attachments || []}
                  onChange={(attachments) => patch({ attachments }, true)}
                />
                )}
              </div>
              <AttachmentList
                items={t.attachments}
                preview
                onRemove={canEdit ? async (fileId) => {
                  const attachments = (t.attachments || []).filter((a) => a.id !== fileId);
                  const r = await api.patch(`/tickets/${id}`, { attachments });
                  setT(r.data);
                  toast.success("Removed");
                } : undefined}
              />
          </div>

          <QAScenarios
            scenarios={t.qa_scenarios || []}
            canEdit={canEdit}
            onChange={(qa_scenarios) => patch({ qa_scenarios }, true)}
          />

          <ChildTickets
            parent={t}
            childTickets={t.children || []}
            canCreate={canCreate}
            boardSpace={boardSpace}
            onCreated={load}
          />

          <div className="px-5 py-4">
            <div className="label-mono text-xs mb-3">Comments</div>
            <div className="space-y-2 mb-3">
              {(t.comments || []).map((c) => (
                <div key={c.id} className="border border-[var(--border)] p-3 text-sm">
                  <div className="flex justify-between text-[10px] font-mono text-[var(--text-muted)] mb-1">
                    <span className="font-semibold text-[var(--text-primary)]">{c.author_name}</span>
                    <span>{new Date(c.created_at).toLocaleString()}</span>
                  </div>
                  {c.body}
                </div>
              ))}
              {(t.comments || []).length === 0 && (
                <p className="text-xs text-[var(--text-muted)]">No comments yet.</p>
              )}
            </div>
            {canEdit && (
            <form onSubmit={addComment} className="flex gap-2">
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                data-testid="ticket-comment-input"
                placeholder="Write a comment…"
                className="flex-1 border border-[var(--border)] bg-[var(--input-bg)] text-[var(--text-primary)] px-3 py-2 text-sm"
              />
              <button data-testid="ticket-comment-submit" className="btn-primary px-4 text-sm font-semibold shrink-0">Send</button>
            </form>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowActivity(!showActivity)}
            className="w-full px-5 py-3 border-t border-[var(--border)] flex items-center justify-between text-xs font-mono text-[var(--text-muted)] hover:bg-[var(--bg-soft)]"
          >
            Activity ({(t.activity || []).length})
            <ChevronDown size={14} className={`transition-transform ${showActivity ? "rotate-180" : ""}`} />
          </button>
          {showActivity && (
            <ul className="px-5 pb-4 space-y-3 border-t border-[var(--border)] pt-3">
              {[...(t.activity || [])]
                .reverse()
                .map((a) => ({ a, lines: formatActivity(a) }))
                .filter(({ lines }) => lines?.length)
                .map(({ a, lines }, i) => (
                  <li key={i} className="text-xs border-l-2 border-[var(--border)] pl-3">
                    <div className="font-mono text-[10px] text-[var(--text-muted)] mb-0.5">
                      {new Date(a.at).toLocaleString()} · <span className="text-[var(--text-primary)]">{a.by}</span>
                    </div>
                    {lines.length > 1 ? (
                      <ul className="space-y-0.5 text-[var(--text-secondary)]">
                        {lines.map((line, j) => (
                          <li key={j}>· {line}</li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-[var(--text-secondary)]">{lines[0]}</div>
                    )}
                  </li>
                ))}
            </ul>
          )}
        </div>

        {/* Sidebar — essentials only */}
        <aside className="border border-[var(--border)] bg-[var(--bg)] p-4 h-fit space-y-4 lg:sticky lg:top-6">
          {canEdit && spaces.length > 0 && (
            <SidebarField label="Board">
              <div className="flex items-center gap-2 text-xs font-semibold mb-2 px-2 py-1.5 border border-[var(--border)] bg-[var(--bg-soft)]">
                <span className="w-2 h-2 shrink-0" style={{ background: currentSpace?.color || "#9CA3AF" }} />
                <span className="truncate">{currentSpace?.name || "Unknown board"}</span>
                {currentSpace?.is_customer && (
                  <span className="text-[9px] font-mono text-[var(--customer-text)] ml-auto shrink-0">inbox</span>
                )}
              </div>
              {otherSpaces.length > 0 ? (
                <div className="space-y-2">
                  <BoardSelect
                    spaces={spaces}
                    value={moveTargetSpace}
                    onChange={setMoveTargetSpace}
                    excludeId={t.space_id}
                    placeholder="Move to board…"
                    compact
                  />
                  <button
                    type="button"
                    disabled={!moveTargetSpace}
                    onClick={() => moveToBoard(moveTargetSpace)}
                    data-testid="move-to-board-btn"
                    className="w-full text-xs font-semibold px-3 py-2 border border-[var(--inverse-bg)] btn-solid disabled:opacity-40"
                  >
                    Move ticket
                  </button>
                </div>
              ) : (
                <div className="text-[10px] font-mono text-[var(--text-muted)]">Only board on your plan</div>
              )}
            </SidebarField>
          )}
          {isCustomerTicket(t) && !onCustomerBoard && (
            <div className="alert-banner alert-customer text-[10px]">
              Customer ticket · on {currentSpace?.name || "team board"}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <SidebarField label="Status">
              <select value={t.status} disabled={!canEdit} onChange={(e) => patch({ status: e.target.value }, true)} data-testid="ticket-status-select" className="w-full border border-[var(--border)] px-2 py-1.5 text-xs disabled:opacity-60">
                {workflowColumns.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </SidebarField>
            <SidebarField label="Priority">
              <select value={t.priority} disabled={!canEdit} onChange={(e) => patch({ priority: e.target.value }, true)} className="w-full border border-[var(--border)] px-2 py-1.5 text-xs disabled:opacity-60">
                {["low", "medium", "high", "critical"].map((p) => <option key={p}>{p}</option>)}
              </select>
            </SidebarField>
          </div>

          <SidebarField label="Assignees">
            <div className="flex flex-wrap gap-1 min-h-[28px]">
              {assignees.length === 0 && <span className="text-xs text-[var(--text-muted)]">None</span>}
              {assignees.map((a) => (
                <span key={a.id} className="inline-flex items-center gap-1 text-[10px] font-mono bg-[var(--bg-soft)] border border-[var(--border)] px-1.5 py-0.5">
                  {a.name}
                  {canEdit && (
                  <button type="button" onClick={() => removeAssignee(a.id)} className="opacity-50 hover:opacity-100"><X size={10} /></button>
                  )}
                </span>
              ))}
            </div>
            {canEdit && unassignedUsers.length > 0 && (
              <select defaultValue="" onChange={(e) => { addAssignee(e.target.value); e.target.value = ""; }} className="w-full mt-1.5 border border-[var(--border)] px-2 py-1.5 text-xs text-[var(--text-muted)]">
                <option value="">+ Add assignee</option>
                {unassignedUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            )}
          </SidebarField>

          <SidebarField label="Due date">
            <input
              type="date"
              disabled={!canEdit}
              value={t.due_date || ""}
              onChange={(e) => patch({ due_date: e.target.value || null }, true)}
              className="w-full border border-[var(--border)] px-2 py-1.5 text-xs disabled:opacity-60"
            />
          </SidebarField>

          <SidebarField label="Tags">
            {canEdit ? (
            <TagInput compact tags={t.tags || []} onChange={(tags) => patch({ tags }, true)} placeholder="tag name" />
            ) : (
            <div className="text-xs text-[var(--text-muted)]">{(t.tags || []).join(", ") || "—"}</div>
            )}
          </SidebarField>

          {canEdit && (
          <div className="border-t border-[var(--border)] pt-3">
            {!showBlocker && !t.blocked_by ? (
              <button type="button" onClick={() => setShowBlocker(true)} className="text-xs font-mono text-[var(--brand-primary)] hover:underline">
                + Mark as blocked
              </button>
            ) : (
              <BlockerPicker
                ticketId={id}
                blockedBy={t.blocked_by || blockDraft}
                users={users}
                onSave={applyBlocker}
                onClear={clearBlocker}
              />
            )}
          </div>
          )}

          <button
            type="button"
            onClick={() => setShowMeta(!showMeta)}
            className="w-full flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)] pt-2 border-t border-[var(--border)]"
          >
            Details
            <ChevronDown size={12} className={`transition-transform ${showMeta ? "rotate-180" : ""}`} />
          </button>
          {showMeta && (
            <div className="text-[10px] font-mono text-[var(--text-muted)] space-y-1 pb-1">
              <div>Reporter: <span className="text-[var(--text-primary)]">{t.reporter_name || "—"}</span></div>
              <div>Email: <span className="text-[var(--text-primary)]">{t.reporter_email || "—"}</span></div>
              <div>Created: <span className="text-[var(--text-primary)]">{new Date(t.created_at).toLocaleDateString()}</span></div>
            </div>
          )}

          {canDelete && (
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            data-testid="ticket-delete-btn"
            className="w-full flex items-center justify-center gap-1.5 text-[10px] font-mono text-[var(--brand-destructive)] pt-2 hover:underline"
          >
            <Trash2 size={12} /> Delete ticket
          </button>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete this ticket?"
        description="This permanently removes the ticket and cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        loading={deleting}
        onConfirm={async () => {
          setDeleting(true);
          try {
            await api.delete(`/tickets/${id}`);
            toast.success("Deleted");
            nav(backToBoard);
          } catch {
            toast.error("Could not delete");
          } finally {
            setDeleting(false);
            setDeleteOpen(false);
          }
        }}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
