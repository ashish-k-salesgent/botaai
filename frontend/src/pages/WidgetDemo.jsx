import { useState } from "react";
import { Link } from "react-router-dom";
import ChatWidget from "@/components/ChatWidget";

export default function WidgetDemo() {
  const [clientId, setClientId] = useState("");
  const [active, setActive] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="font-display font-black text-xl">BotAAI</Link>
          <Link to="/app" className="text-sm font-semibold">Dashboard →</Link>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-6 py-16">
        <div className="label-mono text-[var(--brand-primary)] mb-3">/ Widget demo</div>
        <h1 className="font-display font-black tracking-tighter text-5xl mb-4">Try the embed.</h1>
        <p className="text-[var(--text-secondary)] mb-8">
          Paste a Client ID from your <Link to="/app/settings" className="underline">Settings page</Link>, then click Launch.
          The widget will appear in the bottom-right just like it would inside any of your products.
        </p>

        <div className="panel p-6">
          <label className="label-mono block mb-2">Client ID</label>
          <div className="flex gap-2">
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              data-testid="widget-client-id"
              placeholder="botaai_xxxxxxxxxxxx"
              className="flex-1 field-input font-mono"
            />
            <button
              onClick={() => setActive(true)}
              disabled={!clientId.trim()}
              data-testid="widget-launch"
              className="btn-primary px-5 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Launch widget
            </button>
          </div>
        </div>

        <div className="mt-12 text-sm text-[var(--text-secondary)]">
          <div className="label-mono mb-2">What you'll see:</div>
          <ul className="space-y-1">
            <li>· Floating bubble bottom-right → click to open chat</li>
            <li>· AI answers from your tenant's knowledge base</li>
            <li>· "Talk to a human" creates a queue entry for your agents</li>
            <li>· Bug-like messages auto-create tickets in the Kanban board</li>
          </ul>
        </div>
      </section>

      {active && <ChatWidget clientId={clientId} />}
    </div>
  );
}
