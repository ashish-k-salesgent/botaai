import { Link } from "react-router-dom";
import { isCustomerTicket, isSubtask } from "@/lib/tickets";

function SearchRow({ t, onNavigate, compact = false }) {
  const subtask = isSubtask(t);
  const content = (
    <>
      <div className="flex items-center gap-2 min-w-0">
        <span className="label-mono text-[10px] text-[var(--text-muted)] shrink-0">{t.code}</span>
        {subtask && (
          <span className="text-[9px] font-mono text-[var(--brand-primary)] shrink-0">
            subtask{t.parent_code ? ` · ${t.parent_code}` : ""}
          </span>
        )}
        {isCustomerTicket(t) && (
          <span className="text-[9px] font-mono text-teal-700 shrink-0">customer</span>
        )}
      </div>
      <div className={`font-medium truncate ${compact ? "text-xs" : "text-sm"}`}>{t.title}</div>
      <div className="flex items-center gap-2 mt-0.5 text-[10px] font-mono text-[var(--text-muted)]">
        {t.space_name && (
          <span className="inline-flex items-center gap-1 shrink-0">
            <span className="w-1.5 h-1.5" style={{ background: t.space_color || "#9CA3AF" }} />
            {t.space_name}
          </span>
        )}
        <span className="truncate">{t.status?.replace(/_/g, " ")}</span>
        {t.priority && <span className="shrink-0">{t.priority}</span>}
      </div>
    </>
  );

  const cls = compact
    ? "block px-3 py-2 border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-soft)] text-left w-full"
    : "block px-4 py-3 border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-soft)]";

  if (onNavigate) {
    return (
      <button type="button" onClick={() => onNavigate(t)} className={cls}>
        {content}
      </button>
    );
  }

  return (
    <Link to={`/app/tickets/${t.id}?space=${t.space_id}`} className={cls}>
      {content}
    </Link>
  );
}

export default function TicketSearchResults({
  results = [],
  searching = false,
  query = "",
  variant = "list",
  onPick,
}) {
  const q = query.trim();
  if (!q) return null;

  if (variant === "dropdown") {
    return (
      <div className="absolute left-0 top-full mt-1 w-[min(100vw-3rem,28rem)] border border-[var(--border)] bg-[var(--bg)] shadow-lg z-50 max-h-80 overflow-y-auto">
        {searching && <div className="px-3 py-2 text-xs text-[var(--text-muted)]">Searching…</div>}
        {!searching && results.length === 0 && (
          <div className="px-3 py-3 text-xs text-[var(--text-muted)]">No tickets found for “{q}”</div>
        )}
        {results.map((t) => (
          <SearchRow key={t.id} t={t} compact onNavigate={onPick} />
        ))}
      </div>
    );
  }

  return (
    <div className="border border-[var(--border)] bg-[var(--bg)] mb-4">
      <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-soft)] flex items-center justify-between gap-2">
        <span className="text-xs font-mono text-[var(--text-muted)]">
          {searching ? "Searching all boards…" : `${results.length} result${results.length === 1 ? "" : "s"} across all boards`}
        </span>
        <span className="text-[10px] font-mono text-[var(--brand-primary)] truncate">“{q}”</span>
      </div>
      {searching && (
        <div className="px-4 py-6 text-sm text-[var(--text-muted)]">Searching…</div>
      )}
      {!searching && results.length === 0 && (
        <div className="px-4 py-6 text-sm text-[var(--text-muted)]">No tickets found. Try ID, title, subtask name, tag, or reporter.</div>
      )}
      {!searching && results.length > 0 && (
        <div>
          {results.map((t) => (
            <SearchRow key={t.id} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}
