import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, X } from "lucide-react";

function UserAvatar({ name, size = "sm" }) {
  const cls = size === "sm" ? "w-4 h-4 text-[8px]" : "w-5 h-5 text-[9px]";
  return (
    <span className={`${cls} shrink-0 bg-[var(--bg-soft)] border border-[var(--border)] flex items-center justify-center font-mono font-semibold uppercase`}>
      {(name || "?").slice(0, 1)}
    </span>
  );
}

export default function AssigneeSelect({
  users = [],
  value,
  onChange,
  placeholder = "Assignee (optional)",
  multiple = false,
  compact = true,
  inline = false,
  dropUp = false,
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [menuPos, setMenuPos] = useState(null);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  const selectedIds = multiple
    ? (Array.isArray(value) ? value : [])
    : value
      ? [String(value)]
      : [];

  const selectedUsers = useMemo(
    () => selectedIds.map((id) => users.find((u) => u.id === id)).filter(Boolean),
    [selectedIds, users]
  );

  const available = useMemo(
    () => users.filter((u) => !selectedIds.includes(u.id)),
    [users, selectedIds]
  );

  const filtered = useMemo(() => {
    const pool = multiple ? available : users;
    const needle = q.trim().toLowerCase();
    if (!needle) return pool;
    return pool.filter(
      (u) =>
        u.name.toLowerCase().includes(needle) ||
        (u.email || "").toLowerCase().includes(needle)
    );
  }, [users, available, multiple, q]);

  const closeMenu = () => {
    setOpen(false);
    setQ("");
  };

  const updateMenuPos = () => {
    if (!btnRef.current || inline) return;
    const rect = btnRef.current.getBoundingClientRect();
    const width = Math.max(rect.width, 200);
    const spaceBelow = window.innerHeight - rect.bottom;
    const shouldDropUp = dropUp || (spaceBelow < 180 && rect.top > spaceBelow);
    setMenuPos({
      top: shouldDropUp ? rect.top - 4 : rect.bottom + 4,
      left: rect.left,
      width,
      dropUp: shouldDropUp,
    });
  };

  useLayoutEffect(() => {
    if (!open || inline) return;
    updateMenuPos();
    const onScroll = () => updateMenuPos();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, inline, dropUp]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      const t = e.target;
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      closeMenu();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pickSingle = (id) => {
    onChange(id);
    closeMenu();
  };

  const addUser = (id) => {
    if (!multiple) {
      pickSingle(id);
      return;
    }
    if (!selectedIds.includes(id)) {
      onChange([...selectedIds, id]);
    }
    setQ("");
    if (!inline) closeMenu();
  };

  const removeUser = (id) => {
    if (!multiple) {
      onChange("");
      return;
    }
    onChange(selectedIds.filter((x) => x !== id));
  };

  const toggle = () => {
    setOpen((v) => {
      if (v) setQ("");
      return !v;
    });
  };

  const triggerLabel = () => {
    if (multiple) {
      if (selectedUsers.length === 0) return placeholder;
      if (selectedUsers.length === 1) return selectedUsers[0].name;
      return `${selectedUsers.length} assignees`;
    }
    if (selectedUsers.length === 1) return selectedUsers[0].name;
    return placeholder;
  };

  const btnCls = compact
    ? "w-full flex items-center justify-between gap-1 border border-[var(--border)] bg-[var(--input-bg)] text-[var(--text-primary)] px-2 py-1.5 text-xs text-left"
    : "w-full flex items-center justify-between gap-2 border border-[var(--border)] bg-[var(--input-bg)] text-[var(--text-primary)] px-3 py-2 text-sm text-left";

  const showSearch = users.length > 5;

  const menuList = (
    <>
      {showSearch && (
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search team…"
          className="w-full border-0 border-b border-[var(--border)] px-2 py-1.5 text-xs outline-none bg-[var(--input-bg)] text-[var(--text-primary)]"
          autoFocus={open}
        />
      )}
      <ul className={inline ? "max-h-28 overflow-y-auto" : "max-h-48 overflow-y-auto"}>
        {!multiple && (
          <li>
            <button
              type="button"
              onClick={() => pickSingle("")}
              className={`w-full text-left px-2 py-1.5 text-xs hover:bg-[var(--bg-soft)] border-b border-[var(--border)] ${
                !value ? "bg-[var(--bg-soft)] font-semibold text-[var(--text-primary)]" : "text-[var(--text-muted)]"
              }`}
            >
              Unassigned
            </button>
          </li>
        )}
        {filtered.length === 0 && (
          <li className="px-2 py-2 text-xs text-[var(--text-muted)]">
            {multiple && selectedIds.length === users.length ? "Everyone assigned" : "No members found"}
          </li>
        )}
        {filtered.map((u) => {
          const picked = selectedIds.includes(u.id);
          return (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => (multiple ? addUser(u.id) : pickSingle(u.id))}
                className={`w-full text-left px-2 py-1.5 text-xs hover:bg-[var(--bg-soft)] flex items-center gap-2 border-b border-[var(--border)] last:border-0 ${
                  picked ? "bg-[var(--bg-soft)] font-semibold" : ""
                }`}
              >
                <UserAvatar name={u.name} />
                <span className="truncate flex-1">{u.name}</span>
                {multiple && picked && <Check size={12} className="shrink-0 text-[var(--brand-primary)]" />}
              </button>
            </li>
          );
        })}
      </ul>
      {inline && multiple && (
        <button
          type="button"
          onClick={closeMenu}
          className="w-full border-t border-[var(--border)] py-1.5 text-[10px] font-mono text-[var(--brand-primary)] hover:bg-[var(--bg-soft)]"
        >
          Done
        </button>
      )}
    </>
  );

  const portalMenu = !inline && open && menuPos && createPortal(
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
      {menuList}
    </div>,
    document.body
  );

  return (
    <div className="relative w-full" ref={wrapRef}>
      {multiple && selectedUsers.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {selectedUsers.map((u) => (
            <span
              key={u.id}
              className="inline-flex items-center gap-1 pl-1 pr-0.5 py-0.5 text-[9px] font-mono border border-[var(--border)] bg-[var(--bg-soft)] max-w-full"
            >
              <UserAvatar name={u.name} />
              <span className="truncate max-w-[72px]">{u.name}</span>
              <button
                type="button"
                onClick={() => removeUser(u.id)}
                className="p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                aria-label={`Remove ${u.name}`}
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className={`${btnCls} ${open && inline ? "border-[var(--brand-primary)]" : ""}`}
      >
        <span className="flex items-center gap-2 min-w-0 truncate">
          {!multiple && selectedUsers[0] && <UserAvatar name={selectedUsers[0].name} />}
          <span className={`truncate ${selectedUsers.length ? "" : "text-[var(--text-muted)]"}`}>
            {multiple && selectedUsers.length > 0 ? "+ Add assignee" : triggerLabel()}
          </span>
        </span>
        <ChevronDown size={compact ? 12 : 14} className={`shrink-0 text-[var(--text-muted)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {inline && open && (
        <div
          ref={menuRef}
          className="mt-1 border border-[var(--border)] bg-[var(--bg)] shadow-sm"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {menuList}
        </div>
      )}
      {portalMenu}
    </div>
  );
}
