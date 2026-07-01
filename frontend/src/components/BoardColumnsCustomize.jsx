import { useState } from "react";
import { ChevronLeft, ChevronRight, GripVertical, Lock, Plus, Trash2 } from "lucide-react";
import { slugifyColumnId } from "@/lib/workflow";

export default function BoardColumnsCustomize({
  columns,
  onChange,
  newLabel,
  onNewLabelChange,
  onAdd,
}) {
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);

  const reorder = (from, to) => {
    if (from === to || from < 0 || to < 0 || from >= columns.length || to >= columns.length) return;
    const next = [...columns];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next.map((c, i) => ({ ...c, order: i })));
  };

  const move = (idx, dir) => reorder(idx, idx + dir);

  const remove = (idx) => {
    const col = columns[idx];
    if (col.locked) return;
    onChange(columns.filter((_, i) => i !== idx).map((c, i) => ({ ...c, order: i })));
  };

  const updateLabel = (idx, label) => {
    const next = [...columns];
    next[idx] = { ...columns[idx], label };
    onChange(next);
  };

  const onDragStart = (idx, e) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(idx));
  };

  const onDragOver = (idx, e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOverIdx(idx);
  };

  const onDrop = (idx, e) => {
    e.preventDefault();
    const from = dragIdx ?? Number(e.dataTransfer.getData("text/plain"));
    reorder(from, idx);
    setDragIdx(null);
    setOverIdx(null);
  };

  const onDragEnd = () => {
    setDragIdx(null);
    setOverIdx(null);
  };

  return (
    <div className="flex gap-3 min-w-max" data-testid="board-columns-customize">
      {columns.map((col, idx) => (
        <div
          key={col.id}
          draggable
          onDragStart={(e) => onDragStart(idx, e)}
          onDragOver={(e) => onDragOver(idx, e)}
          onDrop={(e) => onDrop(idx, e)}
          onDragEnd={onDragEnd}
          className={`w-72 border-2 flex flex-col transition-colors ${
            overIdx === idx && dragIdx !== null
              ? "border-[var(--brand-primary)] bg-[var(--bg-soft)]"
              : "border-dashed border-[var(--brand-primary)]/40 bg-[var(--bg-soft)]"
          } ${dragIdx === idx ? "opacity-50" : ""}`}
          data-testid={`customize-column-${col.id}`}
        >
          <div className="px-2 py-2 border-b border-[var(--border)] space-y-2 bg-[var(--bg)]">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="cursor-grab active:cursor-grabbing p-1 text-[var(--text-muted)] hover:text-[var(--brand-primary)] shrink-0"
                title="Drag to reorder"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <GripVertical size={16} />
              </button>
              <span
                className="shrink-0 w-6 h-6 flex items-center justify-center text-[10px] font-mono font-bold border border-[var(--border)] bg-[var(--bg-soft)] tabular-nums"
                title={`Position ${idx + 1}`}
              >
                {idx + 1}
              </span>
              <input
                value={col.label}
                onChange={(e) => updateLabel(idx, e.target.value)}
                className="flex-1 min-w-0 border border-[var(--border)] px-2 py-1.5 text-sm font-mono field-input"
                data-testid={`workflow-col-label-${col.id}`}
              />
            </div>
            <div className="flex items-center justify-between gap-1 pl-8">
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => move(idx, -1)}
                  className="p-1 border border-[var(--border)] disabled:opacity-30 hover:bg-[var(--bg-soft)]"
                  title="Move earlier"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  type="button"
                  disabled={idx === columns.length - 1}
                  onClick={() => move(idx, 1)}
                  className="p-1 border border-[var(--border)] disabled:opacity-30 hover:bg-[var(--bg-soft)]"
                  title="Move later"
                >
                  <ChevronRight size={14} />
                </button>
                <span className="text-[10px] font-mono text-[var(--text-muted)] ml-1">
                  {idx === 0 ? "First" : idx === columns.length - 1 ? "Last" : `Before “${columns[idx + 1]?.label}”`}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {col.qa_track && (
                  <span className="text-[10px] font-mono text-amber-700 px-1.5 py-0.5 border border-amber-200 bg-amber-50">
                    QA
                  </span>
                )}
                {col.locked ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono text-[var(--text-muted)]" title="Required column">
                    <Lock size={12} />
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => remove(idx)}
                    className="p-1 text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200"
                    title="Remove column"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="flex-1 min-h-[120px] flex items-center justify-center p-3">
            <span className="text-[10px] font-mono text-[var(--text-muted)] text-center">
              {col.terminal ? "Done column" : col.qa_track ? "QA scenarios tracked" : "Column on board"}
            </span>
          </div>
        </div>
      ))}

      <div className="w-72 border-2 border-dashed border-[var(--border)] bg-[var(--bg)] flex flex-col">
        <div className="p-3 flex-1 flex flex-col justify-center gap-2">
          <div className="label-mono text-[10px] text-[var(--text-muted)]">New column</div>
          <input
            value={newLabel}
            onChange={(e) => onNewLabelChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onAdd();
              }
            }}
            placeholder="Column name…"
            className="w-full border border-[var(--border)] px-2 py-1.5 text-sm field-input"
            data-testid="workflow-new-column-input"
          />
          <button
            type="button"
            onClick={onAdd}
            disabled={!newLabel.trim()}
            className="inline-flex items-center justify-center gap-1.5 w-full py-2 text-xs border border-[var(--border)] disabled:opacity-40 hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)]"
          >
            <Plus size={14} /> Add column
          </button>
        </div>
      </div>
    </div>
  );
}

export function buildNewColumn(columns, label) {
  const trimmed = label.trim();
  if (!trimmed) return null;
  const base = slugifyColumnId(trimmed);
  const existing = new Set(columns.map((c) => c.id));
  let id = base;
  let n = 2;
  while (existing.has(id)) {
    id = `${base}_${n}`;
    n += 1;
  }
  return { id, label: trimmed, locked: false, order: columns.length };
}
