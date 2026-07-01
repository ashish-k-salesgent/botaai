import { useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";

const textWrap = "break-words [overflow-wrap:anywhere] [word-break:break-word]";

export default function QAScenarios({ scenarios = [], canEdit, onChange }) {
  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ title: "", steps: "", expected: "" });
  const [expanded, setExpanded] = useState({});

  const done = scenarios.filter((s) => s.completed).length;
  const total = scenarios.length;

  const save = (next) => onChange(next);

  const toggle = (id) => {
    const next = scenarios.map((s) =>
      s.id === id ? { ...s, completed: !s.completed } : s
    );
    save(next);
  };

  const remove = (id) => save(scenarios.filter((s) => s.id !== id));

  const addScenario = (e) => {
    e.preventDefault();
    if (!draft.title.trim()) return;
    const id = crypto.randomUUID();
    save([
      ...scenarios,
      {
        id,
        title: draft.title.trim(),
        steps: draft.steps.trim(),
        expected: draft.expected.trim(),
        completed: false,
      },
    ]);
    setDraft({ title: "", steps: "", expected: "" });
    setAdding(false);
  };

  return (
    <div className="border-t border-[var(--border)] min-w-0 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-3 flex items-center justify-between text-xs font-mono hover:bg-[var(--bg-soft)]"
      >
        <span>
          QA scenarios
          <span className="ml-2 text-[var(--text-muted)]">
            {total ? `${done}/${total} passed` : "none"}
          </span>
        </span>
        <ChevronDown size={14} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-5 pb-4 space-y-2 min-w-0">
          {scenarios.length === 0 && !adding && (
            <p className="text-xs text-[var(--text-muted)]">No QA scenarios yet.</p>
          )}

          {scenarios.map((s) => {
            const hasDetails = !!(s.steps || s.expected);
            const showDetails = hasDetails && expanded[s.id];

            return (
              <div
                key={s.id}
                className={`border p-3 text-sm min-w-0 overflow-hidden ${
                  s.completed
                    ? "alert-success border"
                    : "border-[var(--border)] bg-[var(--bg)]"
                }`}
              >
                <div className="flex items-start gap-2 min-w-0">
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => canEdit && toggle(s.id)}
                    className={`mt-0.5 w-4 h-4 border flex items-center justify-center shrink-0 disabled:opacity-50 ${
                      s.completed ? "bg-green-600 border-green-600 text-white" : "border-[var(--border)]"
                    }`}
                    aria-label={s.completed ? "Mark incomplete" : "Mark passed"}
                  >
                    {s.completed && <Check size={10} />}
                  </button>

                  <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="flex items-start gap-2 min-w-0">
                      <p className={`font-semibold text-sm flex-1 min-w-0 ${textWrap}`}>
                        {s.title}
                      </p>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => remove(s.id)}
                          className="text-[10px] font-mono text-[var(--text-muted)] hover:text-red-600 shrink-0 pt-0.5"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    {s.completed && (
                      <div className={`text-[10px] font-mono text-[var(--success-text)] mt-1 ${textWrap}`}>
                        Passed by {s.completed_by_name || "—"}
                        {s.completed_at ? ` · ${new Date(s.completed_at).toLocaleString()}` : ""}
                      </div>
                    )}

                    {hasDetails && (
                      <button
                        type="button"
                        onClick={() => setExpanded((e) => ({ ...e, [s.id]: !showDetails }))}
                        className="text-[10px] font-mono text-[var(--brand-primary)] mt-1 hover:underline"
                      >
                        {showDetails ? "Hide details" : "Show details"}
                      </button>
                    )}

                    {showDetails && (
                      <div className="mt-2 space-y-2 min-w-0">
                        {s.steps && (
                          <div className="border border-[var(--border)] bg-[var(--bg-soft)] p-2 min-w-0 overflow-hidden">
                            <div className="label-mono text-[10px] text-[var(--text-muted)] mb-1">Steps</div>
                            <p className={`text-xs text-[var(--text-secondary)] whitespace-pre-wrap max-h-32 overflow-y-auto ${textWrap}`}>
                              {s.steps}
                            </p>
                          </div>
                        )}
                        {s.expected && (
                          <div className="border border-[var(--border)] bg-[var(--bg-soft)] p-2 min-w-0 overflow-hidden">
                            <div className="label-mono text-[10px] text-[var(--text-muted)] mb-1">Expected</div>
                            <p className={`text-xs text-[var(--text-secondary)] whitespace-pre-wrap max-h-32 overflow-y-auto ${textWrap}`}>
                              {s.expected}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {canEdit && !adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1 text-xs font-mono text-[var(--brand-primary)] hover:underline"
            >
              <Plus size={12} /> Add QA scenario
            </button>
          )}

          {canEdit && adding && (
            <form onSubmit={addScenario} className="border border-[var(--border)] p-3 space-y-2 bg-[var(--bg-soft)] min-w-0">
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Scenario title *"
                className="w-full border border-[var(--border)] px-2 py-1.5 text-xs bg-[var(--input-bg)] text-[var(--text-primary)]"
                autoFocus
              />
              <textarea
                value={draft.steps}
                onChange={(e) => setDraft({ ...draft, steps: e.target.value })}
                placeholder="Test steps (optional)"
                rows={3}
                className="w-full border border-[var(--border)] px-2 py-1.5 text-xs bg-[var(--input-bg)] text-[var(--text-primary)] resize-y"
              />
              <textarea
                value={draft.expected}
                onChange={(e) => setDraft({ ...draft, expected: e.target.value })}
                placeholder="Expected result (optional)"
                rows={3}
                className="w-full border border-[var(--border)] px-2 py-1.5 text-xs bg-[var(--input-bg)] text-[var(--text-primary)] resize-y"
              />
              <div className="flex gap-2">
                <button type="submit" className="text-xs font-semibold btn-primary px-3 py-1.5">
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => { setAdding(false); setDraft({ title: "", steps: "", expected: "" }); }}
                  className="text-xs border border-[var(--border)] px-3 py-1.5 bg-[var(--bg)] text-[var(--text-primary)]"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
