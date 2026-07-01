import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Search, UserRound, Ticket } from "lucide-react";

export default function BlockerPicker({
  ticketId,
  blockedBy,
  users = [],
  onSave,
  onClear,
}) {
  const [mode, setMode] = useState(blockedBy?.type === "user" ? "user" : "ticket");
  const [ticketQuery, setTicketQuery] = useState(blockedBy?.type === "ticket" ? blockedBy.code || "" : "");
  const [ticketResults, setTicketResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [note, setNote] = useState(blockedBy?.note || "");
  const [userQuery, setUserQuery] = useState("");
  const [selection, setSelection] = useState(null);
  const searchRef = useRef(null);

  useEffect(() => {
    setMode(blockedBy?.type === "user" ? "user" : "ticket");
    setTicketQuery(blockedBy?.type === "ticket" ? blockedBy.code || "" : "");
    setNote(blockedBy?.note || "");
    if (blockedBy?.type) {
      setSelection({
        type: blockedBy.type,
        ticket_id: blockedBy.ticket_id,
        user_id: blockedBy.user_id,
        code: blockedBy.code,
        name: blockedBy.name,
      });
    }
  }, [blockedBy?.type, blockedBy?.ticket_id, blockedBy?.user_id, blockedBy?.code, blockedBy?.name, blockedBy?.note]);

  useEffect(() => {
    const q = ticketQuery.trim();
    if (mode !== "ticket" || q.length < 2) {
      setTicketResults([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await api.get("/tickets", { params: { q } });
        setTicketResults(
          (r.data || []).filter((x) => x.id !== ticketId).slice(0, 6)
        );
      } catch {
        setTicketResults([]);
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [ticketQuery, ticketId, mode]);

  const active = selection || blockedBy;
  const hasSelection = active?.type === "ticket"
    ? Boolean(active.ticket_id)
    : active?.type === "user"
      ? Boolean(active.user_id)
      : false;

  const commit = (sel, noteText = note) => {
    if (!sel?.type) return;
    if (sel.type === "ticket" && !sel.ticket_id) return;
    if (sel.type === "user" && !sel.user_id) return;
    onSave({ ...sel, note: noteText });
  };

  const saveNote = () => {
    if (!hasSelection) return;
    commit(active, note);
  };

  const pickTicket = (ticket) => {
    const sel = { type: "ticket", ticket_id: ticket.id, code: ticket.code };
    setSelection(sel);
    setTicketQuery(ticket.code);
    setTicketResults([]);
    commit(sel);
  };

  const pickUser = (user) => {
    const sel = { type: "user", user_id: user.id, name: user.name };
    setSelection(sel);
    commit(sel);
  };

  const filteredUsers = users
    .filter((u) => u.active !== false)
    .filter((u) => {
      const q = userQuery.trim().toLowerCase();
      if (!q) return true;
      return (u.name || "").toLowerCase().includes(q) || (u.email || "").toLowerCase().includes(q);
    });

  const modeBtn = (activeMode) =>
    `flex-1 text-[10px] font-mono py-1.5 border ${
      mode === activeMode
        ? "border-[var(--inverse-bg)] btn-solid"
        : "border-[var(--border)] bg-[var(--input-bg)] text-[var(--text-muted)]"
    }`;

  return (
    <div className="space-y-2 border border-[var(--warning-border)] bg-[var(--warning-surface)] p-2 rounded-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="label-mono text-[10px] text-[var(--warning-text)]">Blocked by</span>
        <button
          type="button"
          onClick={() => { setSelection(null); onClear(); }}
          className="text-[10px] font-mono text-[var(--text-muted)] hover:text-[var(--brand-destructive)]"
        >
          Clear
        </button>
      </div>

      {hasSelection && (
        <div className="text-xs font-mono border border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] px-2 py-1.5">
          {active.type === "ticket" ? (
            <>
              <Ticket size={11} className="inline mr-1 -mt-px" />
              {active.code ? (
                <Link to={`/app/tickets/${active.ticket_id}`} className="font-semibold text-[var(--brand-primary)] hover:underline">
                  {active.code}
                </Link>
              ) : (
                <span className="font-semibold">Ticket</span>
              )}
            </>
          ) : (
            <>
              <UserRound size={11} className="inline mr-1 -mt-px" />
              <span className="font-semibold">{active.name}</span>
            </>
          )}
          {note && <div className="text-[10px] text-[var(--text-secondary)] mt-1">· {note}</div>}
        </div>
      )}

      <div className="flex gap-1">
        <button type="button" onClick={() => setMode("ticket")} className={modeBtn("ticket")}>
          Ticket ID
        </button>
        <button type="button" onClick={() => setMode("user")} className={modeBtn("user")}>
          Team member
        </button>
      </div>

      {mode === "ticket" ? (
        <div className="relative" ref={searchRef}>
          <div className="flex items-center gap-1 border border-[var(--border)] bg-[var(--input-bg)] px-2">
            <Search size={12} className="text-[var(--text-muted)] shrink-0" />
            <input
              type="search"
              value={ticketQuery}
              onChange={(e) => setTicketQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || !ticketResults.length) return;
                e.preventDefault();
                const exact = ticketResults.find(
                  (tk) => tk.code.toLowerCase() === ticketQuery.trim().toLowerCase()
                );
                pickTicket(exact || ticketResults[0]);
              }}
              placeholder="BOTAAI-104 or search…"
              className="w-full py-1.5 text-xs border-0 outline-none bg-transparent text-[var(--text-primary)]"
              autoComplete="off"
            />
          </div>
          {searching && (
            <div className="absolute z-10 left-0 right-0 mt-px border border-[var(--border)] bg-[var(--bg)] px-2 py-2 text-[10px] font-mono text-[var(--text-muted)]">
              Searching…
            </div>
          )}
          {!searching && ticketQuery.trim().length >= 2 && ticketResults.length > 0 && (
            <ul className="absolute z-10 left-0 right-0 mt-px border border-[var(--border)] bg-[var(--bg)] shadow-sm max-h-40 overflow-y-auto">
              {ticketResults.map((tk) => (
                <li key={tk.id}>
                  <button
                    type="button"
                    onClick={() => pickTicket(tk)}
                    className="w-full text-left px-2 py-2 text-xs hover:bg-[var(--bg-soft)] border-b border-[var(--border)] last:border-0 text-[var(--text-primary)]"
                  >
                    <span className="font-mono text-[var(--brand-primary)]">{tk.code}</span>
                    <span className="text-[var(--text-muted)] ml-2 truncate">{tk.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!searching && ticketQuery.trim().length >= 2 && ticketResults.length === 0 && (
            <div className="text-[10px] font-mono text-[var(--text-muted)] px-1 pt-1">No tickets found</div>
          )}
        </div>
      ) : (
        <div className="space-y-1">
          <input
            type="search"
            value={userQuery}
            onChange={(e) => setUserQuery(e.target.value)}
            placeholder="Filter team…"
            className="w-full border border-[var(--border)] bg-[var(--input-bg)] text-[var(--text-primary)] px-2 py-1.5 text-xs"
          />
          <div className="max-h-36 overflow-y-auto border border-[var(--border)] bg-[var(--bg)] divide-y divide-[var(--border)]">
            {filteredUsers.length === 0 && (
              <div className="px-2 py-3 text-[10px] font-mono text-[var(--text-muted)]">No team members</div>
            )}
            {filteredUsers.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => pickUser(u)}
                className={`w-full text-left px-2 py-2 text-xs hover:bg-[var(--bg-soft)] text-[var(--text-primary)] ${
                  active?.user_id === u.id ? "bg-[var(--bg-soft)] font-semibold" : ""
                }`}
              >
                <div>{u.name}</div>
                {u.email && <div className="text-[10px] font-mono text-[var(--text-muted)]">{u.email}</div>}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-1">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              saveNote();
            }
          }}
          onBlur={saveNote}
          disabled={!hasSelection}
          placeholder={hasSelection ? "Why blocked? (Enter to save)" : "Pick blocker first"}
          className="flex-1 border border-[var(--border)] bg-[var(--input-bg)] text-[var(--text-primary)] px-2 py-1.5 text-xs disabled:opacity-50"
        />
        <button
          type="button"
          onClick={saveNote}
          disabled={!hasSelection || !note.trim()}
          className="text-[10px] font-mono border border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] px-2 hover:bg-[var(--bg-soft)] disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </div>
  );
}
