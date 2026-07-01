const FIELD_LABELS = {
  status: "status",
  priority: "priority",
  category: "category",
  title: "title",
  description: "description",
  assignees: "assignees",
  assignee_id: "assignee",
  tags: "tags",
  blocked_by: "blocker",
  attachments: "attachments",
  labels: "labels",
};

const SKIP_FIELDS = new Set(["updated_at", "activity", "assignee_name"]);

/** Turn raw activity row into human-readable line(s). */
export function formatActivity(entry) {
  if (entry.summary && entry.summary !== "updated") {
    return entry.details?.length > 1 ? entry.details : [entry.summary];
  }
  if (entry.details?.length) {
    return entry.details;
  }
  if (entry.event === "created") {
    return [entry.summary || "Ticket created"];
  }
  if (entry.event === "comment") {
    return [entry.summary || "Added a comment"];
  }
  if (entry.changes?.length) {
    const fields = entry.changes.filter(
      (f) => !SKIP_FIELDS.has(f) && !(f === "assignee_id" && entry.changes.includes("assignees"))
    );
    if (fields.length === 1) {
      const label = FIELD_LABELS[fields[0]] || fields[0];
      return [`Updated ${label}`];
    }
    if (fields.length > 1) {
      const labels = fields.map((f) => FIELD_LABELS[f] || f).join(", ");
      return [`Updated ${labels}`];
    }
  }
  return null;
}
