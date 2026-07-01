import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import TicketSearchResults from "@/components/TicketSearchResults";

export default function GlobalTicketSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setResults([]);
      setSearching(false);
      return undefined;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const r = await api.get("/tickets/search", { params: { q, limit: 20 } });
        setResults(r.data || []);
      } catch (err) {
        setResults([]);
        if (err?.response?.status !== 401) {
          console.error("Ticket search failed", err?.response?.data || err);
        }
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (t) => {
    setOpen(false);
    setQuery("");
    navigate(`/app/tickets/${t.id}?space=${t.space_id}`);
  };

  const showMenu = open && query.trim().length > 0;

  return (
    <div className="relative" ref={wrapRef}>
      <input
        type="search"
        placeholder="Search tickets (ID, title, subtask, tag)…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        className="bg-transparent outline-none w-72 sm:w-96 placeholder:text-[var(--text-muted)] text-sm"
        data-testid="global-search"
      />
      {showMenu && (
        <TicketSearchResults
          variant="dropdown"
          results={results}
          searching={searching}
          query={query}
          onPick={pick}
        />
      )}
    </div>
  );
}
