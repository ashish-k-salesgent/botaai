/** Ticket display helpers */

export const PRIORITY_COLOR = {
  low: "#9CA3AF",
  medium: "#FFCC00",
  high: "#FF8C00",
  critical: "#FF3B30",
};

export const COMPLETED_STATUSES = ["done", "closed", "completed"];

export function isSubtaskComplete(t) {
  return COMPLETED_STATUSES.includes(t?.status);
}

export function isSubtask(t) {
  return Boolean(t?.parent_id);
}

export function isTicketOverdue(t) {
  if (!t) return false;
  if (t.is_overdue) return true;
  if (!t.due_date) return false;
  if (["done", "closed", "completed"].includes(t.status)) return false;
  return t.due_date < new Date().toISOString().slice(0, 10);
}

export function isQaIncomplete(t) {
  if (!t) return false;
  if (t.qa_incomplete) return true;
  if (!["qa", "testing"].includes(t.status)) return false;
  const total = t.qa_total ?? (t.qa_scenarios?.length ?? 0);
  const done = t.qa_done ?? (t.qa_scenarios?.filter((s) => s.completed).length ?? 0);
  return total === 0 || done < total;
}

export function qaIncompleteLabel(t) {
  if (!isQaIncomplete(t)) return "";
  const total = t.qa_total ?? (t.qa_scenarios?.length ?? 0);
  const done = t.qa_done ?? (t.qa_scenarios?.filter((s) => s.completed).length ?? 0);
  if (total === 0) return "No QA scenarios defined";
  return `QA ${done}/${total} passed`;
}

export function isCustomerTicket(t) {
  if (!t) return false;
  if (t.is_customer_ticket) return true;
  const labels = t.labels || [];
  if (labels.some((l) => ["customer", "from-widget", "from-chat"].includes(l))) return true;
  if (t.chat_session_id) return true;
  if (t.reporter_email && !t.reporter_id) return true;
  return false;
}

export function ticketCardClass(t) {
  if (isTicketOverdue(t)) {
    return "border border-[var(--danger-border)] border-l-2 border-l-red-500 bg-[var(--danger-surface)]";
  }
  if (isCustomerTicket(t)) {
    return "border border-[var(--customer-border)] border-l-2 border-l-teal-500 bg-[var(--customer-surface)]";
  }
  return "border border-[var(--border)] bg-[var(--bg)]";
}

/** @deprecated use ticketCardClass */
export function overdueCardClass(t) {
  return ticketCardClass(t);
}

export function formatDueDate(due) {
  if (!due) return "—";
  try {
    return new Date(`${due}T12:00:00`).toLocaleDateString();
  } catch {
    return due;
  }
}

export const TICKET_CATEGORIES = [
  "Bug", "Feature Request", "Support", "Task", "Question",
  "Billing", "Integration", "Performance", "Technical Support",
];
