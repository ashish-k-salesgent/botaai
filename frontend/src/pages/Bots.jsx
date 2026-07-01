import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Bot as BotIcon, Plus } from "lucide-react";
import { can } from "@/lib/permissions";
import { useAuth } from "@/lib/auth";

export default function Bots() {
  const { user } = useAuth();
  const canEdit = can(user, "bots.edit");
  const [bots, setBots] = useState([]);
  const [active, setActive] = useState(null);

  const load = () => api.get("/bots").then((r) => {
    setBots(r.data);
    if (r.data.length && !active) setActive(r.data[0]);
  });
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!active) return;
    const r = await api.patch(`/bots/${active.id}`, {
      name: active.name,
      greeting: active.greeting,
      theme_color: active.theme_color,
      system_prompt: active.system_prompt,
      language: active.language,
      fallback_message: active.fallback_message,
      temperature: active.temperature,
      model: active.model,
      confidence_threshold: active.confidence_threshold,
      working_hours: active.working_hours,
    });
    setActive(r.data);
    toast.success("Saved");
    load();
  };

  const createBot = async () => {
    const r = await api.post("/bots", {
      name: "New Bot",
      greeting: "Hello! How can I help today?",
      system_prompt: "You are a helpful support agent.",
    });
    setActive(r.data);
    load();
  };

  return (
    <div className="p-8 max-w-6xl mx-auto" data-testid="bots-page">
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <div className="label-mono text-[var(--brand-primary)] mb-2">/ Bots</div>
          <h1 className="font-display font-black tracking-tighter text-4xl">Bot Studio</h1>
        </div>
        {canEdit && (
        <button onClick={createBot} data-testid="new-bot-btn" className="inline-flex items-center gap-2 btn-solid px-4 py-2 text-sm font-semibold">
          <Plus size={14} /> New bot
        </button>
        )}
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        <div className="space-y-2">
          {bots.map((b) => (
            <button
              key={b.id}
              onClick={() => setActive(b)}
              data-testid={`bot-item-${b.id}`}
              className={`w-full text-left border p-3 ${
                active?.id === b.id
                  ? "border-[var(--inverse-bg)] bg-[var(--inverse-bg)] text-[var(--inverse-fg)]"
                  : "border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] hover:bg-[var(--bg-soft)]"
              }`}
            >
              <div className="flex items-center gap-2">
                <BotIcon size={14} />
                <span className="font-semibold text-sm">{b.name}</span>
              </div>
              <div className="label-mono opacity-60 mt-1">{b.language?.toUpperCase()} · {b.model}</div>
            </button>
          ))}
        </div>

        {active && (
          <div className="lg:col-span-3 border border-[var(--border)] bg-[var(--bg)] p-6">
            <div className="grid md:grid-cols-2 gap-5">
              {[
                ["name", "Name", "text"],
                ["greeting", "Greeting", "text"],
                ["theme_color", "Theme color", "color"],
                ["language", "Language", "text"],
                ["fallback_message", "Fallback", "text"],
                ["working_hours", "Working hours", "text"],
                ["temperature", "Temperature", "number"],
                ["confidence_threshold", "Confidence threshold", "number"],
              ].map(([k, label, type]) => (
                <div key={k}>
                  <label className="label-mono block mb-1">{label}</label>
                  <input
                    type={type}
                    step={type === "number" ? "0.05" : undefined}
                    value={active[k] || ""}
                    onChange={(e) => setActive({ ...active, [k]: type === "number" ? parseFloat(e.target.value) : e.target.value })}
                    data-testid={`bot-${k}`}
                    disabled={!canEdit}
                    className="w-full border border-[var(--border)] bg-[var(--input-bg)] text-[var(--text-primary)] px-3 py-2 text-sm disabled:opacity-60"
                  />
                </div>
              ))}
              <div className="md:col-span-2">
                <label className="label-mono block mb-1">System prompt</label>
                <textarea
                  rows={5}
                  value={active.system_prompt || ""}
                  onChange={(e) => setActive({ ...active, system_prompt: e.target.value })}
                  data-testid="bot-system-prompt"
                  disabled={!canEdit}
                  className="w-full border border-[var(--border)] bg-[var(--input-bg)] text-[var(--text-primary)] px-3 py-2 text-sm font-mono disabled:opacity-60"
                />
              </div>
              <div className="md:col-span-2">
                <label className="label-mono block mb-1">Model</label>
                <select value={active.model} disabled={!canEdit} onChange={(e) => setActive({ ...active, model: e.target.value })} className="w-full border border-[var(--border)] bg-[var(--input-bg)] text-[var(--text-primary)] px-3 py-2 text-sm disabled:opacity-60">
                  {["gemini-3-flash-preview", "gemini-3.5-flash", "gemini-3.1-pro-preview"].map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>
            {canEdit && (
            <button onClick={save} data-testid="bot-save" className="mt-6 btn-primary px-5 py-2 text-sm font-semibold">
              Save changes
            </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
