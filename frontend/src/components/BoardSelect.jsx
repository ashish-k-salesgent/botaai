import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

export default function BoardSelect({
  spaces = [],
  value = "",
  onChange,
  excludeId = "",
  placeholder = "Choose board…",
  compact = false,
  dropUp = false,
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [menuPos, setMenuPos] = useState(null);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  const options = useMemo(
    () => spaces.filter((s) => s.id !== excludeId),
    [spaces, excludeId]
  );

  const selected = options.find((s) => s.id === value) || spaces.find((s) => s.id === value);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    return options.filter(
      (s) =>
        s.name.toLowerCase().includes(needle) ||
        (s.slug || "").toLowerCase().includes(needle)
    );
  }, [options, q]);

  const updateMenuPos = () => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const width = Math.max(rect.width, 220);
    setMenuPos({
      top: dropUp ? rect.top - 8 : rect.bottom + 4,
      left: rect.left,
      width,
      dropUp,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPos();
    const onScroll = () => updateMenuPos();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, dropUp]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      const t = e.target;
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
      setQ("");
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pick = (space) => {
    onChange(space.id);
    setOpen(false);
    setQ("");
  };

  const toggle = () => {
    setOpen((v) => {
      if (v) setQ("");
      return !v;
    });
  };

  const btnCls = compact
    ? "w-full flex items-center justify-between gap-1 border border-[var(--border)] bg-[var(--input-bg)] text-[var(--text-primary)] px-2 py-1.5 text-xs text-left"
    : "w-full flex items-center justify-between gap-2 border border-[var(--border)] bg-[var(--input-bg)] text-[var(--text-primary)] px-3 py-2 text-sm text-left";

  const menu = open && menuPos && createPortal(
    <div
      ref={menuRef}
      className="border border-[var(--border)] bg-[var(--bg)] shadow-lg"
      style={{
        position: "fixed",
        top: menuPos.dropUp ? undefined : menuPos.top,
        bottom: menuPos.dropUp ? window.innerHeight - menuPos.top : undefined,
        left: menuPos.left,
        width: menuPos.width,
        zIndex: 9999,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search boards…"
        className="w-full border-0 border-b border-[var(--border)] px-3 py-2 text-sm outline-none bg-[var(--input-bg)] text-[var(--text-primary)]"
        autoFocus
      />
      <ul className="max-h-52 overflow-y-auto">
        {filtered.length === 0 && (
          <li className="px-3 py-3 text-xs text-[var(--text-muted)]">No boards found</li>
        )}
        {filtered.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => pick(s)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--bg-soft)] flex items-center gap-2 border-b border-[var(--border)] last:border-0 ${
                value === s.id ? "bg-[var(--bg-soft)] font-semibold" : ""
              }`}
            >
              <span className="w-2.5 h-2.5 shrink-0 rounded-full" style={{ background: s.color || "#9CA3AF" }} />
              <span className="truncate">{s.name}</span>
              {s.is_customer && (
                <span className="text-[10px] font-mono text-teal-700 ml-auto shrink-0">inbox</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>,
    document.body
  );

  return (
    <div className="relative w-full" ref={wrapRef}>
      <button ref={btnRef} type="button" onClick={toggle} className={btnCls}>
        <span className="flex items-center gap-2 min-w-0 truncate">
          {selected ? (
            <>
              <span className="w-2.5 h-2.5 shrink-0 rounded-full" style={{ background: selected.color || "#9CA3AF" }} />
              <span className="truncate font-medium">{selected.name}</span>
            </>
          ) : (
            <span className="text-[var(--text-muted)]">{placeholder}</span>
          )}
        </span>
        <ChevronDown size={compact ? 12 : 14} className={`shrink-0 text-[var(--text-muted)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {menu}
    </div>
  );
}
