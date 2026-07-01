import { useEffect, useMemo, useRef, useState } from "react";
import api from "@/lib/api";

export default function TagInput({
  tags = [],
  onChange,
  placeholder = "Add tag…",
  compact = false,
  suggestions: suggestionsProp,
}) {
  const [draft, setDraft] = useState("");
  const [suggestions, setSuggestions] = useState(suggestionsProp || []);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (suggestionsProp) {
      setSuggestions(suggestionsProp);
      return;
    }
    api.get("/tickets/tags").then((r) => setSuggestions(r.data || [])).catch(() => {});
  }, [suggestionsProp]);

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const matches = useMemo(() => {
    const q = draft.trim().toLowerCase();
    return suggestions
      .filter((t) => !tags.includes(t))
      .filter((t) => !q || t.includes(q))
      .slice(0, 8);
  }, [draft, suggestions, tags]);

  const pick = (tag) => {
    if (!tag || tags.includes(tag)) return;
    onChange([...tags, tag]);
    if (!suggestions.includes(tag)) {
      setSuggestions((prev) => [...prev, tag].sort((a, b) => a.localeCompare(b)));
    }
    setDraft("");
    setOpen(false);
  };

  const add = (e) => {
    e?.preventDefault();
    const tag = draft.trim().toLowerCase().replace(/\s+/g, "-");
    if (!tag || tags.includes(tag)) {
      setDraft("");
      setOpen(false);
      return;
    }
    onChange([...tags, tag]);
    if (!suggestions.includes(tag)) {
      setSuggestions((prev) => [...prev, tag].sort((a, b) => a.localeCompare(b)));
    }
    setDraft("");
    setOpen(false);
  };

  const inputCls = compact
    ? "flex-1 field-input-sm"
    : "flex-1 field-input";
  const btnCls = compact
    ? "text-[10px] font-mono border border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] px-2 hover:bg-[var(--bg-soft)]"
    : "text-xs font-mono border border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] px-3 py-2 hover:bg-[var(--bg-soft)]";

  return (
    <div className="space-y-2" ref={wrapRef}>
      {tags.length > 0 && (
        <div className={`flex flex-wrap ${compact ? "gap-1" : "gap-1.5"}`}>
          {tags.map((tag) => (
            <span
              key={tag}
              className={`inline-flex items-center gap-1 font-mono border border-[var(--border)] bg-[var(--bg-soft)] ${compact ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-0.5"}`}
            >
              {tag}
              <button
                type="button"
                onClick={() => onChange(tags.filter((x) => x !== tag))}
                className={compact ? "opacity-60 hover:opacity-100" : "text-[var(--text-muted)] hover:text-[var(--brand-destructive)]"}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <form onSubmit={add} className={compact ? "flex gap-1 relative" : "flex gap-2 relative"}>
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className={inputCls}
          autoComplete="off"
        />
        <button type="submit" className={btnCls}>{compact ? "+" : "Add"}</button>
        {open && matches.length > 0 && (
          <ul
            className="absolute left-0 right-0 top-full z-20 mt-1 max-h-40 overflow-y-auto border border-[var(--border)] bg-[var(--bg)] shadow-sm"
            role="listbox"
          >
            {matches.map((tag) => (
              <li key={tag}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(tag)}
                  className="w-full text-left px-3 py-2 text-xs font-mono hover:bg-[var(--bg-soft)] text-[var(--text-primary)]"
                >
                  {tag}
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>
    </div>
  );
}
