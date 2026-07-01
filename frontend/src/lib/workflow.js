/** Kanban workflow column helpers */

export const DEFAULT_WORKFLOW_COLUMNS = [
  { id: "new", label: "New", locked: true, order: 0 },
  { id: "open", label: "Open", locked: false, order: 1 },
  { id: "in_progress", label: "In Progress", locked: false, order: 2 },
  { id: "development", label: "Development", locked: false, order: 3 },
  { id: "qa", label: "QA", locked: true, qa_track: true, order: 4 },
  { id: "testing", label: "Testing", locked: true, qa_track: true, order: 5 },
  { id: "waiting", label: "Waiting", locked: false, order: 6 },
  { id: "done", label: "Done", locked: true, terminal: true, order: 7 },
  { id: "closed", label: "Closed", locked: true, terminal: true, order: 8 },
];

export function resolveWorkflowColumns(tenant) {
  const cols = tenant?.workflow_columns;
  if (Array.isArray(cols) && cols.length > 0) {
    return [...cols].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
  return DEFAULT_WORKFLOW_COLUMNS;
}

export function slugifyColumnId(label) {
  const s = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return (s || "column").slice(0, 48);
}

export function columnLabel(columns, id) {
  return columns.find((c) => c.id === id)?.label || (id || "").replace(/_/g, " ");
}

export function qaColumnIds(columns) {
  return columns.filter((c) => c.qa_track).map((c) => c.id);
}

export function terminalColumnIds(columns) {
  const ids = columns.filter((c) => c.terminal).map((c) => c.id);
  return ids.length ? ids : ["done", "closed"];
}
