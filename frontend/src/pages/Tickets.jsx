import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { can } from "@/lib/permissions";
import { useAuth } from "@/lib/auth";
import BoardSelect from "@/components/BoardSelect";
import AssigneeSelect from "@/components/AssigneeSelect";
import { formatDueDate, isTicketOverdue, isQaIncomplete, isSubtask, isSubtaskComplete, isCustomerTicket, qaIncompleteLabel, ticketCardClass, TICKET_CATEGORIES } from "@/lib/tickets";
import AttachmentUpload from "@/components/AttachmentUpload";
import TagInput from "@/components/TagInput";
import { Download, Filter, GitBranch, Plus, X, ArrowRightLeft, CheckSquare, Square, Link2, Check, Columns3 } from "lucide-react";
import BoardColumnsCustomize, { buildNewColumn } from "@/components/BoardColumnsCustomize";
import { columnLabel, resolveWorkflowColumns } from "@/lib/workflow";

const CATEGORIES = TICKET_CATEGORIES;
const PRIORITIES = ["low", "medium", "high", "critical"];
const PRIORITY_COLOR = { low: "#9CA3AF", medium: "#FFCC00", high: "#FF8C00", critical: "#FF3B30" };

const SUBTASKS_BOARD_KEY = "botaai-board-show-subtasks";

/** Parents only, or parent + all subtasks nested under parent in parent's column */
function buildBoardByColumn(tickets, showSubtasks, columns) {
  const byColumn = Object.fromEntries(columns.map((c) => [c.id, []]));

  if (!showSubtasks) {
    tickets.filter((t) => !t.parent_id).forEach((t) => {
      const col = byColumn[t.status] ? t.status : columns[0]?.id;
      if (col && byColumn[col]) byColumn[col].push({ ticket: t, nested: false });
    });
    return byColumn;
  }

  const byParent = new Map();
  tickets.forEach((t) => {
    if (!t.parent_id) return;
    if (!byParent.has(t.parent_id)) byParent.set(t.parent_id, []);
    byParent.get(t.parent_id).push(t);
  });

  const nestedUnderParent = new Set();

  const fallbackCol = columns[0]?.id;

  tickets.filter((t) => !t.parent_id).forEach((parent) => {
    const col = byColumn[parent.status] ? parent.status : fallbackCol;
    if (!col || !byColumn[col]) return;
    byColumn[col].push({ ticket: parent, nested: false });
    (byParent.get(parent.id) || []).forEach((child) => {
      byColumn[col].push({ ticket: child, nested: true });
      nestedUnderParent.add(child.id);
    });
  });

  tickets.filter((t) => t.parent_id && !nestedUnderParent.has(t.id)).forEach((child) => {
    const col = byColumn[child.status] ? child.status : fallbackCol;
    if (col && byColumn[col]) byColumn[col].push({ ticket: child, nested: true });
  });

  return byColumn;
}

const EMPTY_FILTERS = {
  status: "",
  priority: "",
  category: "",
  assignee_id: "",
  tag: "",
  blocked: "",
  overdue: "",
  due: "",
  q: "",
};

export default function Tickets({ inboxOnly = false }) {
  const { user, tenant, setTenant } = useAuth();
  const canCreate = can(user, "tickets.create");
  const canEdit = can(user, "tickets.edit");
  const canSettings = can(user, "settings.edit");
  const canViewTeam = can(user, "team.view");
  const columns = useMemo(() => resolveWorkflowColumns(tenant), [tenant]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [tickets, setTickets] = useState([]);
  const [spacesMeta, setSpacesMeta] = useState({ spaces: [], max_spaces: 1, used: 0, can_create: false, locked_count: 0, mode: "boards" });
  const isInboxMode = inboxOnly || spacesMeta.mode === "inbox_only";
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [users, setUsers] = useState([]);
  const [open, setOpen] = useState(false);
  const [spaceOpen, setSpaceOpen] = useState(false);
  const [view, setView] = useState("board"); // board | overdue
  const [allTags, setAllTags] = useState([]);
  const [showSubtasks, setShowSubtasks] = useState(() => {
    try {
      return localStorage.getItem(SUBTASKS_BOARD_KEY) === "1";
    } catch {
      return false;
    }
  });

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [moveTargetSpace, setMoveTargetSpace] = useState("");
  const [moving, setMoving] = useState(false);
  const [quickAddColumn, setQuickAddColumn] = useState(null);
  const [columnEditMode, setColumnEditMode] = useState(false);
  const [draftColumns, setDraftColumns] = useState([]);
  const [newColumnLabel, setNewColumnLabel] = useState("");
  const [savingColumns, setSavingColumns] = useState(false);

  const toggleSubtasks = () => {
    setShowSubtasks((v) => {
      const next = !v;
      try {
        localStorage.setItem(SUBTASKS_BOARD_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const includeChildren = showSubtasks || view === "overdue";

  const exportCsv = async () => {
    try {
      const r = await api.get("/tickets/export", { params: { space_id: activeSpaceId }, responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "tickets-export.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch {
      toast.error("Export failed");
    }
  };

  const activeSpaceId = useMemo(() => {
    const spaces = spacesMeta.spaces || [];
    const fromUrl = searchParams.get("space");
    if (fromUrl && spaces.some((s) => s.id === fromUrl)) return fromUrl;
    return (spaces.find((s) => s.is_default) || spaces[0])?.id || "";
  }, [searchParams, spacesMeta.spaces]);

  const selectSpace = (id) => setSearchParams({ space: id }, { replace: true });

  const loadSpaces = useCallback(async () => {
    try {
      const r = await api.get("/spaces");
      setSpacesMeta(r.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to load spaces");
    }
  }, []);

  useEffect(() => {
    loadSpaces();
    if (canViewTeam) api.get("/users").then((r) => setUsers(r.data || [])).catch(() => {});
    api.get("/tickets/tags").then((r) => setAllTags(r.data || [])).catch(() => {});
  }, [loadSpaces, canViewTeam]);

  useEffect(() => {
    const spaces = spacesMeta.spaces || [];
    if (!spaces.length) return;
    const fromUrl = searchParams.get("space");
    const fallback = (spaces.find((s) => s.is_default) || spaces[0]).id;
    if (fromUrl && !spaces.some((s) => s.id === fromUrl)) {
      toast.info("That space is not on your plan.");
      setSearchParams({ space: fallback }, { replace: true });
    } else if (!fromUrl) {
      setSearchParams({ space: fallback }, { replace: true });
    }
  }, [spacesMeta.spaces, searchParams, setSearchParams]);

  const loadTickets = useCallback(async (spaceId, f, withChildren = false) => {
    if (!spaceId) return;
    const params = { space_id: spaceId };
    if (withChildren) params.include_children = true;
    Object.entries(f).forEach(([k, v]) => {
      if (v) params[k] = v;
    });
    try {
      const r = await api.get("/tickets", { params });
      setTickets(r.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to load tickets");
    }
  }, []);

  useEffect(() => {
    if (activeSpaceId) loadTickets(activeSpaceId, filters, includeChildren);
  }, [activeSpaceId, filters, includeChildren, loadTickets]);

  const activeFilters = useMemo(
    () => Object.values(filters).filter(Boolean).length,
    [filters]
  );

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setView("board");
  };

  const visibleColumns = useMemo(
    () => (filters.status ? columns.filter((c) => c.id === filters.status) : columns),
    [filters.status, columns]
  );

  const boardByColumn = useMemo(
    () => buildBoardByColumn(tickets, showSubtasks, columns),
    [tickets, showSubtasks, columns]
  );

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
      toast.success(`Moved to ${columnLabel(columns, status)}`);
      loadTickets(activeSpaceId, filters, includeChildren);
    } catch {
      toast.error("Failed to update");
      loadTickets(activeSpaceId, filters, includeChildren);
    }
  };

  const activeSpace = spacesMeta.spaces.find((s) => s.id === activeSpaceId);

  const toggleSelect = (ticketId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(ticketId)) next.delete(ticketId);
      else next.add(ticketId);
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setMoveTargetSpace("");
    setSelectMode(false);
  };

  const startMoveMode = () => {
    setSelectMode(true);
    setSelectedIds(new Set());
    setMoveTargetSpace("");
  };

  const bulkMoveBoard = async () => {
    if (!moveTargetSpace || selectedIds.size === 0 || !canEdit) return;
    const target = spacesMeta.spaces.find((s) => s.id === moveTargetSpace);
    if (!target) return;
    setMoving(true);
    try {
      const fromCustomer = activeSpace?.is_customer;
      await Promise.all(
        [...selectedIds].map(async (ticketId) => {
          const t = tickets.find((x) => x.id === ticketId);
          const changes = { space_id: moveTargetSpace };
          if (fromCustomer && !target.is_customer && t?.status === "new") {
            changes.status = "open";
          }
          await api.patch(`/tickets/${ticketId}`, changes);
        })
      );
      toast.success(`Moved ${selectedIds.size} ticket(s) to ${target.name}`);
      clearSelection();
      loadTickets(activeSpaceId, filters, includeChildren);
      loadSpaces();
    } catch {
      toast.error("Failed to move tickets");
    } finally {
      setMoving(false);
    }
  };

  const canQuickAdd =
    canCreate && view === "board" && !selectMode && !isInboxMode && !activeSpace?.is_customer && !columnEditMode;

  const enterColumnEdit = () => {
    setDraftColumns([...columns].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((c) => ({ ...c })));
    setNewColumnLabel("");
    setColumnEditMode(true);
    setQuickAddColumn(null);
    setSelectMode(false);
  };

  const cancelColumnEdit = () => {
    setColumnEditMode(false);
    setDraftColumns([]);
    setNewColumnLabel("");
  };

  const addDraftColumn = () => {
    const col = buildNewColumn(draftColumns, newColumnLabel);
    if (!col) return;
    setDraftColumns([...draftColumns, col]);
    setNewColumnLabel("");
  };

  const saveColumnEdit = async () => {
    setSavingColumns(true);
    try {
      const r = await api.put("/workflow/columns", {
        columns: draftColumns.map((c, i) => ({ ...c, order: i })),
      });
      setTenant((prev) => (prev ? { ...prev, workflow_columns: r.data.columns } : prev));
      toast.success("Board columns saved");
      setColumnEditMode(false);
      loadTickets(activeSpaceId, filters, includeChildren);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save columns");
    } finally {
      setSavingColumns(false);
    }
  };

  return (
    <div className="p-6 h-full flex flex-col" data-testid="tickets-page">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="label-mono text-[var(--brand-primary)] mb-2">{isInboxMode ? "/ Inbox" : "/ Spaces"}</div>
          <h1 className="font-display font-black tracking-tighter text-4xl">{isInboxMode ? "Customer Inbox" : "Board"}</h1>
          {isInboxMode && (
            <p className="text-xs text-[var(--text-muted)] mt-2 max-w-lg">
              Bot-only plan: widget customers submit tickets here. Upgrade to Boards for internal Kanban spaces.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <input
            type="search"
            placeholder="Filter this board…"
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            className="border border-[var(--border)] px-3 py-2 text-sm w-44"
            data-testid="board-filter-search"
            title="Filter tickets on the current board only. Use header search for all boards."
          />
          <button type="button" onClick={exportCsv} className="inline-flex items-center gap-1 px-3 py-2 text-sm border border-[var(--border)]">
            <Download size={14} /> Export
          </button>
          {canEdit && view === "board" && (
            <button
              type="button"
              onClick={selectMode ? clearSelection : startMoveMode}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm border ${
                selectMode
                  ? "border-[var(--brand-primary)] text-[var(--brand-primary)] bg-[var(--bg-soft)]"
                  : "border-[var(--border)] hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)]"
              }`}
            >
              <ArrowRightLeft size={14} />
              {selectMode ? "Cancel" : "Move"}
            </button>
          )}
          {canSettings && view === "board" && !isInboxMode && !columnEditMode && (
            <button
              type="button"
              onClick={enterColumnEdit}
              data-testid="board-columns-btn"
              className="inline-flex items-center gap-1 px-3 py-2 text-sm border border-[var(--border)] hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)]"
            >
              <Columns3 size={14} /> Customize columns
            </button>
          )}
          <button
            type="button"
            onClick={toggleSubtasks}
            className={`inline-flex items-center gap-1 px-3 py-2 text-sm border ${
              showSubtasks ? "border-[var(--brand-primary)] text-[var(--brand-primary)] bg-[var(--bg-soft)]" : "border-[var(--border)]"
            }`}
          >
            <GitBranch size={14} />
            {showSubtasks ? "Hide subtasks" : "Show subtasks"}
          </button>
          <button
            type="button"
            onClick={() => { setView("overdue"); setFilters({ ...filters, overdue: "yes", status: "" }); }}
            className={`px-3 py-2 text-sm border ${view === "overdue" ? "border-red-600 text-red-700 bg-red-50" : "border-[var(--border)]"}`}
          >
            Overdue
          </button>
          <button
            type="button"
            onClick={() => { setView("board"); setFilters({ ...filters, overdue: "" }); }}
            className={`px-3 py-2 text-sm border ${view === "board" ? "border-[var(--inverse-bg)] bg-[var(--inverse-bg)] text-[var(--inverse-fg)]" : "border-[var(--border)]"}`}
          >
            Board
          </button>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            data-testid="board-filters-toggle"
            className={`inline-flex items-center gap-2 px-3 py-2 text-sm border ${
              activeFilters ? "border-[var(--brand-primary)] text-[var(--brand-primary)]" : "border-[var(--border)]"
            }`}
          >
            <Filter size={14} />
            Filters{activeFilters ? ` (${activeFilters})` : ""}
          </button>
          {(activeFilters > 0 || view === "overdue") && (
            <button
              type="button"
              onClick={clearFilters}
              data-testid="board-clear-filters"
              className="inline-flex items-center gap-1 px-3 py-2 text-sm border border-[var(--border)] text-[var(--brand-primary)] hover:bg-[var(--bg-soft)]"
            >
              <X size={14} />
              Clear filters
            </button>
          )}
          {canCreate && !isInboxMode && !activeSpace?.is_customer && (
          <button
            onClick={() => setOpen(true)}
            data-testid="new-ticket-btn"
            className="inline-flex items-center gap-2 btn-solid px-4 py-2 text-sm font-semibold"
          >
            <Plus size={14} /> New ticket
          </button>
          )}
        </div>
      </div>

      {!isInboxMode && (
      <div className="flex items-center gap-2 mb-4 overflow-x-auto no-scrollbar pb-1">
        {spacesMeta.spaces.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => selectSpace(s.id)}
            data-testid={`space-tab-${s.slug}`}
            className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm border whitespace-nowrap ${
              activeSpaceId === s.id
                ? s.is_customer
                  ? "border-teal-700 bg-teal-700 text-white"
                  : "border-[var(--text-primary)] bg-[var(--inverse-bg)] text-[var(--inverse-fg)]"
                : s.is_customer
                  ? "border-teal-300 bg-teal-50/50 hover:border-teal-500 dark:border-teal-600 dark:bg-[var(--customer-surface)]"
                  : "border-[var(--border)] bg-[var(--bg)] hover:border-[var(--text-muted)]"
            }`}
          >
            <span className="w-2 h-2 shrink-0" style={{ background: s.color || "#002FA7" }} />
            {s.name}
            <span className="text-[10px] font-mono opacity-70">{s.ticket_count}</span>
          </button>
        ))}
        {canCreate && (
        <button
          type="button"
          onClick={() => (spacesMeta.can_create ? setSpaceOpen(true) : toast.error("Space limit reached. Upgrade or contact super admin."))}
          data-testid="new-space-btn"
          disabled={!spacesMeta.can_create}
          title={spacesMeta.can_create ? "New space" : `${spacesMeta.used}/${spacesMeta.max_spaces} spaces used`}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-dashed border-[var(--border)] disabled:opacity-40"
        >
          <Plus size={14} /> Space
        </button>
        )}
        <span className="text-[10px] font-mono text-[var(--text-muted)] ml-1">
          {spacesMeta.used}/{spacesMeta.max_spaces}
          {spacesMeta.locked_count > 0 && (
            <span className="text-amber-700 ml-1">({spacesMeta.locked_count} locked)</span>
          )}
        </span>
      </div>
      )}

      {selectMode && view === "board" && !isInboxMode && (
        <div className="mb-3 flex flex-wrap items-center gap-2 sm:gap-3 border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
          <CheckSquare size={15} className="text-[var(--brand-primary)] shrink-0" />
          <span className="text-xs font-mono tabular-nums whitespace-nowrap">
            <span className="font-semibold text-[var(--text-primary)]">{selectedIds.size}</span>
            <span className="text-[var(--text-muted)]"> selected</span>
          </span>
          <span className="hidden sm:inline text-[var(--text-muted)] text-xs">→</span>
          <div className="w-full sm:w-52">
            <BoardSelect
              spaces={spacesMeta.spaces}
              value={moveTargetSpace}
              onChange={setMoveTargetSpace}
              excludeId={activeSpaceId}
              placeholder="Move to board…"
              compact
            />
          </div>
          <button
            type="button"
            disabled={selectedIds.size === 0 || !moveTargetSpace || moving}
            onClick={bulkMoveBoard}
            className="text-xs font-semibold px-3 py-1.5 btn-solid disabled:opacity-40 whitespace-nowrap"
          >
            {moving ? "Moving…" : "Move"}
          </button>
          <button
            type="button"
            onClick={clearSelection}
            className="sm:ml-auto text-xs font-mono text-[var(--text-muted)] hover:text-[var(--text-primary)] whitespace-nowrap"
          >
            Cancel
          </button>
        </div>
      )}

      {selectMode && view === "board" && selectedIds.size === 0 && (
        <p className="text-[11px] font-mono text-[var(--text-muted)] -mt-1 mb-3">Click ticket cards to select them</p>
      )}

      {showFilters && (
        <div className="border border-[var(--border)] bg-[var(--bg-soft)] p-3 mb-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="board-filters">
          <FilterSelect label="Status" value={filters.status} onChange={(v) => setFilters({ ...filters, status: v })}>
            <option value="">All</option>
            {columns.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </FilterSelect>
          <FilterSelect label="Priority" value={filters.priority} onChange={(v) => setFilters({ ...filters, priority: v })}>
            <option value="">All</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </FilterSelect>
          <FilterSelect label="Category" value={filters.category} onChange={(v) => setFilters({ ...filters, category: v })}>
            <option value="">All</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </FilterSelect>
          <FilterSelect label="Assignee" value={filters.assignee_id} onChange={(v) => setFilters({ ...filters, assignee_id: v })}>
            <option value="">All</option>
            <option value="unassigned">Unassigned</option>
            {users.filter((u) => u.active !== false).map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </FilterSelect>
          <FilterSelect label="Tag" value={filters.tag} onChange={(v) => setFilters({ ...filters, tag: v })}>
            <option value="">All</option>
            {allTags.map((tag) => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </FilterSelect>
          <FilterSelect label="Blocked" value={filters.blocked} onChange={(v) => setFilters({ ...filters, blocked: v })}>
            <option value="">All</option>
            <option value="yes">Blocked</option>
            <option value="no">Not blocked</option>
          </FilterSelect>
          <FilterSelect label="Due" value={filters.due} onChange={(v) => setFilters({ ...filters, due: v })}>
            <option value="">Any</option>
            <option value="today">Due today</option>
            <option value="week">Due this week</option>
          </FilterSelect>
          <FilterSelect label="Overdue" value={filters.overdue} onChange={(v) => setFilters({ ...filters, overdue: v })}>
            <option value="">All</option>
            <option value="yes">Overdue only</option>
            <option value="no">Not overdue</option>
          </FilterSelect>
          {activeFilters > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="col-span-full text-xs font-mono text-[var(--brand-primary)] text-left hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-x-auto no-scrollbar pb-4">
        {columnEditMode && view === "board" && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border border-[var(--brand-primary)]/30 bg-[var(--bg-soft)] px-4 py-3">
            <div>
              <div className="text-sm font-semibold">Customize board columns</div>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Rename, reorder, add, or remove columns. Drag cards or use arrows — left-to-right is board order (1st, 2nd…). QA columns cannot be removed.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cancelColumnEdit}
                className="px-3 py-1.5 text-sm border border-[var(--border)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveColumnEdit}
                disabled={savingColumns}
                data-testid="board-columns-save"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm btn-primary disabled:opacity-50"
              >
                <Check size={14} />
                {savingColumns ? "Saving…" : "Save columns"}
              </button>
            </div>
          </div>
        )}
        {view === "overdue" ? (
          <div className="border border-[var(--border)] bg-[var(--bg-soft)] p-4">
            <div className="label-mono text-red-600 mb-3">Overdue tickets</div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {tickets.filter((t) => isTicketOverdue(t)).map((t) => (
                <TicketCard key={t.id} t={t} activeSpaceId={activeSpaceId} />
              ))}
              {tickets.filter((t) => isTicketOverdue(t)).length === 0 && (
                <p className="text-sm text-[var(--text-muted)]">No overdue tickets</p>
              )}
            </div>
          </div>
        ) : columnEditMode ? (
        <BoardColumnsCustomize
          columns={draftColumns}
          onChange={setDraftColumns}
          newLabel={newColumnLabel}
          onNewLabelChange={setNewColumnLabel}
          onAdd={addDraftColumn}
        />
        ) : (
        <div className="flex gap-3 min-w-max">
          {visibleColumns.map((c) => {
            const items = boardByColumn[c.id] || [];
            return (
              <div
                key={c.id}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("drag-over"); }}
                onDragLeave={(e) => e.currentTarget.classList.remove("drag-over")}
                onDrop={(e) => onDrop(c.id, e)}
                data-testid={`kanban-column-${c.id}`}
                className="w-72 border border-[var(--border)] bg-[var(--bg)] flex flex-col"
              >
                <div className="px-3 py-2 border-b border-[var(--border)] flex items-center justify-between gap-2 bg-[var(--bg-soft)]">
                  <span className="label-mono truncate">{c.label}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {canQuickAdd && (
                      <button
                        type="button"
                        onClick={() => setQuickAddColumn((prev) => (prev === c.id ? null : c.id))}
                        data-testid={`column-add-${c.id}`}
                        title={`Add task to ${c.label}`}
                        aria-label={`Add task to ${c.label}`}
                        className={`inline-flex items-center justify-center w-5 h-5 transition-colors ${
                          quickAddColumn === c.id
                            ? "text-[var(--brand-primary)] bg-[var(--bg)]"
                            : "text-[var(--text-muted)] hover:text-[var(--brand-primary)] hover:bg-[var(--bg)]"
                        }`}
                      >
                        <Plus size={13} strokeWidth={2.5} />
                      </button>
                    )}
                    <span className="text-xs font-mono text-[var(--text-muted)] tabular-nums">{items.length}</span>
                  </div>
                </div>
                {canQuickAdd && quickAddColumn === c.id && (
                  <ColumnQuickAdd
                    key={`quick-add-${c.id}`}
                    columnId={c.id}
                    columnLabel={c.label}
                    spaceId={activeSpaceId}
                    users={users}
                    canViewTeam={canViewTeam}
                    onClose={() => setQuickAddColumn(null)}
                    onCreated={() => {
                      setQuickAddColumn(null);
                      loadTickets(activeSpaceId, filters, includeChildren);
                      loadSpaces();
                    }}
                  />
                )}
                <div className="p-2 space-y-2 min-h-[200px] flex-1 bg-[var(--bg-soft)]">
                  {items.map(({ ticket, nested }) => (
                    <TicketCard
                      key={ticket.id}
                      t={ticket}
                      activeSpaceId={activeSpaceId}
                      draggable={!selectMode}
                      nested={nested}
                      columnId={c.id}
                      selectMode={selectMode}
                      selected={selectedIds.has(ticket.id)}
                      onToggleSelect={() => toggleSelect(ticket.id)}
                    />
                  ))}
                  {items.length === 0 && quickAddColumn !== c.id && (
                    <div className="text-xs text-[var(--text-muted)] py-6 text-center font-mono">empty</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        )}
      </div>

      {open && (
        <NewTicketModal
          spaceId={activeSpaceId}
          spaceName={activeSpace?.name}
          onClose={() => setOpen(false)}
          onCreated={() => { setOpen(false); loadTickets(activeSpaceId, filters, includeChildren); loadSpaces(); }}
        />
      )}
      {spaceOpen && (
        <NewSpaceModal
          onClose={() => setSpaceOpen(false)}
          onCreated={() => { setSpaceOpen(false); loadSpaces(); }}
        />
      )}

    </div>
  );
}

function ColumnQuickAdd({
  columnId,
  columnLabel,
  spaceId,
  users,
  canViewTeam,
  onClose,
  onCreated,
}) {
  const [title, setTitle] = useState("");
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState([]);
  const [loading, setLoading] = useState(false);

  const close = () => {
    setTitle("");
    setSelectedAssigneeIds([]);
    onClose();
  };

  const submit = async (e) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      const payload = {
        title: trimmed,
        description: trimmed,
        space_id: spaceId,
        status: columnId,
        category: "Task",
        priority: "medium",
      };
      if (selectedAssigneeIds.length > 0) {
        payload.assignees = selectedAssigneeIds.map((id) => ({ id }));
      }
      await api.post("/tickets", payload);
      toast.success(`Added to ${columnLabel}`);
      setTitle("");
      setSelectedAssigneeIds([]);
      onCreated();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create ticket");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="px-2 py-2 border-b border-[var(--border)] bg-[var(--bg)] space-y-2"
      data-testid={`column-quick-form-${columnId}`}
    >
      <input
        autoFocus
        required
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task name…"
        data-testid={`column-quick-title-${columnId}`}
        className="w-full border border-[var(--border)] px-2 py-1.5 text-xs field-input"
      />
      {canViewTeam && users.length > 0 && (
        <AssigneeSelect
          users={users}
          value={selectedAssigneeIds}
          onChange={setSelectedAssigneeIds}
          placeholder="Assignees (optional)"
          multiple
          inline
        />
      )}
      <div className="flex gap-1">
        <button
          type="submit"
          disabled={loading || !title.trim()}
          className="flex-1 btn-primary py-1.5 text-[10px] font-semibold disabled:opacity-50"
        >
          {loading ? "Adding…" : "Add task"}
        </button>
        <button
          type="button"
          onClick={close}
          title="Cancel"
          className="px-2 py-1.5 text-[10px] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <X size={12} />
        </button>
      </div>
    </form>
  );
}

function TicketCopyLink({ ticketId, spaceId, code }) {
  const [copied, setCopied] = useState(false);

  const copy = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const params = new URLSearchParams();
    if (spaceId) params.set("space", spaceId);
    const qs = params.toString();
    const url = `${window.location.origin}/app/tickets/${ticketId}${qs ? `?${qs}` : ""}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy link");
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      onMouseDown={(e) => e.stopPropagation()}
      data-testid={`copy-ticket-link-${code}`}
      title={copied ? "Copied" : "Copy link"}
      aria-label="Copy link to ticket"
      className={`inline-flex items-center justify-center p-0 leading-none shrink-0 transition-colors ${
        copied ? "text-green-600" : "text-[var(--text-muted)]/60 hover:text-[var(--brand-primary)]"
      }`}
    >
      {copied ? <Check size={11} strokeWidth={2.5} /> : <Link2 size={11} strokeWidth={2} />}
    </button>
  );
}

function TicketCard({
  t,
  activeSpaceId,
  draggable = false,
  nested = false,
  columnId,
  selectMode = false,
  selected = false,
  onToggleSelect,
}) {
  const overdue = isTicketOverdue(t);
  const subtask = isSubtask(t);
  const childCount = subtask ? 0 : (t.child_count ?? 0);
  const childDone = subtask ? 0 : (t.child_done ?? 0);
  const showPhase = subtask && nested && columnId && t.status !== columnId;
  const ticketHref = `/app/tickets/${t.id}?space=${activeSpaceId || ""}`;
  const shellCls = `${ticketCardClass(t)} ticket-card relative ${subtask && nested ? "ml-3 p-2 border-dashed border-l-2 border-l-[var(--brand-primary)]" : "p-3"} ${selectMode ? "pl-8" : ""} ${selected ? "border-[var(--brand-primary)] bg-[var(--bg-soft)] shadow-sm" : ""} ${selectMode ? "cursor-pointer hover:border-[var(--brand-primary)]" : ""}`;

  return (
    <div className={shellCls}>
      {selectMode && (
        <span
          className={`absolute top-2.5 left-2 z-10 pointer-events-none ${
            selected ? "text-[var(--brand-primary)]" : "text-[var(--text-muted)]"
          }`}
          aria-hidden
        >
          {selected ? <CheckSquare size={16} strokeWidth={2.5} /> : <Square size={16} strokeWidth={2} />}
        </span>
      )}

      {subtask && (
        <div className="text-[9px] font-mono text-[var(--brand-primary)] mb-1 truncate">
          ↳ Subtask{t.parent_code ? ` of ${t.parent_code}` : ""}
          {showPhase && (
            <span className="text-amber-700"> · {t.status.replace(/_/g, " ")}</span>
          )}
          {isSubtaskComplete(t) && <span className="text-green-700 ml-1">· done</span>}
        </div>
      )}

      <div className="flex items-center justify-between mb-1.5 gap-2 min-w-0">
        <Link
          to={ticketHref}
          onClick={selectMode ? (e) => e.preventDefault() : undefined}
          className={`label-mono text-[10px] shrink-0 hover:text-[var(--brand-primary)] transition-colors ${overdue ? "text-red-600 font-semibold" : "text-[var(--text-muted)]"}`}
        >
          {t.code}
        </Link>
        <div className="flex items-center gap-1 shrink-0">
          {isCustomerTicket(t) && (
            <span className="text-[9px] font-mono text-[var(--customer-text)] border border-[var(--customer-border)] bg-[var(--customer-surface)] px-1 py-0.5">
              Customer
            </span>
          )}
          {childCount > 0 && (
            <span
              className="inline-flex items-center gap-0.5 text-[9px] font-mono text-[var(--brand-primary)] border border-[var(--border)] bg-[var(--bg-soft)] px-1 py-0.5"
              title={`${childDone} of ${childCount} subtasks done`}
            >
              <GitBranch size={10} />
              {childDone}/{childCount}
            </span>
          )}
          <span className="w-2 h-2 shrink-0" style={{ background: PRIORITY_COLOR[t.priority] || "#9CA3AF" }} title={t.priority} />
          {!selectMode && <TicketCopyLink ticketId={t.id} spaceId={activeSpaceId} code={t.code} />}
        </div>
      </div>

    <Link
      to={ticketHref}
      draggable={draggable}
      onDragStart={draggable ? (e) => {
        e.dataTransfer.setData("ticket-id", t.id);
        e.currentTarget.classList.add("dragging");
      } : undefined}
      onDragEnd={draggable ? (e) => e.currentTarget.classList.remove("dragging") : undefined}
      onClick={selectMode ? (e) => { e.preventDefault(); onToggleSelect?.(); } : undefined}
      data-testid={`ticket-card-${t.code}`}
      className={`block text-inherit no-underline ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <div className={`text-sm font-semibold leading-tight mb-2 break-words ${overdue ? "text-red-800" : ""}`}>{t.title}</div>
      {t.due_date && (
        <div className={`text-[10px] font-mono mb-2 ${overdue ? "text-red-600" : "text-[var(--text-muted)]"}`}>
          Due {formatDueDate(t.due_date)}{overdue ? " · overdue" : ""}
        </div>
      )}
      {isQaIncomplete(t) && (
        <div className="text-[9px] font-mono mb-2 alert-warning px-1.5 py-0.5 inline-block">
          {qaIncompleteLabel(t)}
        </div>
      )}
      <div className="flex flex-wrap gap-1 mb-2">
        {(t.tags || []).slice(0, 3).map((tag) => (
          <span key={tag} className="text-[9px] font-mono border border-[var(--border)] px-1 py-0.5 bg-[var(--bg-soft)]">{tag}</span>
        ))}
      </div>
      <div className="flex items-center justify-between text-xs font-mono text-[var(--text-muted)]">
        <span>{t.category}</span>
        <span>{(t.assignees?.length ? t.assignees.map((a) => a.name).join(", ") : t.assignee_name) || "unassigned"}</span>
      </div>
      {childCount > 0 && (
        <div className="mt-2 pt-2 border-t border-[var(--border)] flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)]">
          <span className="inline-flex items-center gap-1 text-[var(--brand-primary)]">
            <GitBranch size={11} />
            {childCount} subtask{childCount !== 1 ? "s" : ""}
          </span>
          <span className={childDone === childCount ? "text-green-700" : ""}>
            {childDone}/{childCount} done
          </span>
        </div>
      )}
      {t.blocked_by && (
        <div className="text-[9px] font-mono text-amber-700 mt-1">
          blocked · {t.blocked_by.type === "ticket" ? t.blocked_by.code : t.blocked_by.name}
          {t.blocked_by.note ? ` · ${t.blocked_by.note}` : ""}
        </div>
      )}
    </Link>
    </div>
  );
}

function FilterSelect({ label, value, onChange, children }) {
  return (
    <div>
      <label className="label-mono block mb-1 text-[10px]">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-[var(--border)] px-2 py-1.5 text-xs bg-[var(--input-bg)] text-[var(--text-primary)]"
      >
        {children}
      </select>
    </div>
  );
}

function NewSpaceModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: "", description: "", color: "#002FA7" });
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/spaces", form);
      toast.success("Space created");
      onCreated();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed");
    } finally { setLoading(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <form onSubmit={submit} className="modal-shell w-full max-w-md" data-testid="new-space-modal">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
          <span className="label-mono">New space</span>
          <button type="button" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="label-mono block mb-1">Name</label>
            <input
              required value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="field-input"
            />
          </div>
          <div>
            <label className="label-mono block mb-1">Description</label>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="field-input"
            />
          </div>
          <div>
            <label className="label-mono block mb-1">Color</label>
            <input
              type="color"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              className="h-9 w-16 border border-[var(--border)]"
            />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-[var(--border)] flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-[var(--border)] text-[var(--text-primary)]">Cancel</button>
          <button type="submit" disabled={loading} className="px-4 py-2 text-sm btn-primary">
            {loading ? "Creating…" : "Create space"}
          </button>
        </div>
      </form>
    </div>
  );
}

function NewTicketModal({ onClose, onCreated, spaceId, spaceName }) {
  const [form, setForm] = useState({ title: "", description: "", priority: "medium", category: "Bug", attachments: [], tags: [], due_date: "" });
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/tickets", { ...form, space_id: spaceId, due_date: form.due_date || null });
      toast.success("Ticket created");
      onCreated();
    } catch {
      toast.error("Failed");
    } finally { setLoading(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <form onSubmit={submit} className="modal-shell w-full max-w-md" data-testid="new-ticket-modal">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
          <span className="label-mono">New ticket{spaceName ? ` · ${spaceName}` : ""}</span>
          <button type="button" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="label-mono block mb-1">Title</label>
            <input
              required value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              data-testid="ticket-title"
              className="field-input"
            />
          </div>
          <div>
            <label className="label-mono block mb-1">Description</label>
            <textarea
              required value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={4}
              data-testid="ticket-description"
              className="field-input"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-mono block mb-1">Priority</label>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="field-input">
                {PRIORITIES.map((x) => <option key={x}>{x}</option>)}
              </select>
            </div>
            <div>
              <label className="label-mono block mb-1">Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="field-input">
                {CATEGORIES.map((x) => <option key={x}>{x}</option>)}
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
            <TagInput
              tags={form.tags}
              onChange={(tags) => setForm({ ...form, tags })}
            />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-[var(--border)] flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-[var(--border)] text-[var(--text-primary)]">Cancel</button>
          <button type="submit" disabled={loading} data-testid="ticket-submit" className="px-4 py-2 text-sm btn-primary">
            {loading ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
