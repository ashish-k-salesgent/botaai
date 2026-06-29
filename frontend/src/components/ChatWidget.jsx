import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { MessageSquare, X, Send, UserRound } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const QUICK = ["Ask Question", "Report Bug", "Request Feature", "Billing", "Talk to Human"];

export default function ChatWidget({ clientId }) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(null);
  const [bot, setBot] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (open && !session && clientId) {
      axios.post(`${API}/widget/init`, {
        client_id: clientId,
        visitor_name: "Guest",
      }).then((r) => {
        setSession(r.data.session_id);
        setBot(r.data.bot);
        setTenant(r.data.tenant);
        // initial bot greeting
        setMessages([{ id: "g", sender: "bot", text: r.data.greeting, sender_name: r.data.bot?.name || "Bot" }]);
      }).catch(() => {
        setMessages([{ id: "err", sender: "bot", text: "Invalid client ID. Please check Settings.", sender_name: "System" }]);
      });
    }
  }, [open, clientId]);

  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), [messages]);

  const send = async (msgText) => {
    if (!session || !msgText.trim() || sending) return;
    const userMsg = { id: Math.random().toString(), sender: "user", text: msgText };
    setMessages((m) => [...m, userMsg]);
    setText("");
    setSending(true);
    try {
      const r = await axios.post(`${API}/widget/message`, { session_id: session, text: msgText });
      if (r.data.bot_message) {
        setMessages((m) => [...m, r.data.bot_message]);
      }
      if (r.data.ticket) {
        setMessages((m) => [...m, {
          id: Math.random().toString(),
          sender: "system",
          text: `✓ Ticket ${r.data.ticket.code} created · Priority: ${r.data.ticket.priority} · Category: ${r.data.ticket.category}`,
        }]);
      }
    } catch {
      setMessages((m) => [...m, { id: "e", sender: "bot", text: "Something went wrong.", sender_name: "System" }]);
    } finally {
      setSending(false);
    }
  };

  const escalate = async () => {
    if (!session) return;
    await axios.post(`${API}/widget/escalate`, { session_id: session });
    setMessages((m) => [...m, { id: "esc", sender: "system", text: "Escalated to human. An agent will join shortly." }]);
  };

  const theme = bot?.theme_color || tenant?.branding?.primary_color || "#002FA7";

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          data-testid="widget-bubble"
          style={{ background: theme }}
          className="fixed bottom-6 right-6 w-14 h-14 text-white shadow-lg hover:scale-105 transition-transform z-50 flex items-center justify-center"
        >
          <MessageSquare size={22} />
        </button>
      )}

      {open && (
        <div data-testid="widget-window" className="fixed bottom-6 right-6 w-96 max-w-[calc(100vw-3rem)] h-[560px] max-h-[calc(100vh-3rem)] bg-white border border-[var(--text-primary)] shadow-2xl flex flex-col z-50">
          <div style={{ background: theme }} className="text-white px-4 py-3 flex items-center justify-between">
            <div>
              <div className="font-display font-black tracking-tight">{tenant?.name || "BotAAI"}</div>
              <div className="text-xs opacity-80">{bot?.name || "AI assistant"} · online</div>
            </div>
            <button onClick={() => setOpen(false)} data-testid="widget-close"><X size={18} /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[var(--bg-soft)]">
            {messages.map((m) => <WMsg key={m.id} m={m} theme={theme} />)}
            {sending && <div className="text-xs text-[var(--text-muted)] font-mono">Bot is thinking…</div>}
            <div ref={bottomRef} />
          </div>

          {messages.length <= 1 && (
            <div className="px-4 py-2 border-t border-[var(--border)] flex flex-wrap gap-2 bg-white">
              {QUICK.map((q) => (
                <button
                  key={q}
                  onClick={() => q === "Talk to Human" ? escalate() : send(q)}
                  data-testid={`widget-quick-${q.replace(/\s+/g, '-').toLowerCase()}`}
                  className="border border-[var(--border)] text-xs px-2.5 py-1 hover:border-[var(--text-primary)]"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="border-t border-[var(--border)] p-3 flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              data-testid="widget-input"
              placeholder="Ask anything…"
              className="flex-1 border border-[var(--border)] px-3 py-2 text-sm"
            />
            <button data-testid="widget-send" style={{ background: theme }} className="text-white px-3 flex items-center justify-center disabled:opacity-50" disabled={sending}>
              <Send size={14} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}

function WMsg({ m, theme }) {
  if (m.sender === "system") {
    return <div className="text-xs font-mono text-[var(--brand-primary)] bg-blue-50 border border-blue-200 px-2 py-1.5">{m.text}</div>;
  }
  if (m.sender === "user") {
    return (
      <div className="max-w-[85%] ml-auto" style={{ background: theme }}>
        <div className="px-3 py-2 text-sm text-white">{m.text}</div>
      </div>
    );
  }
  return (
    <div className="max-w-[85%]">
      <div className="bg-white border border-[var(--border)] px-3 py-2 text-sm">
        <div className="label-mono text-[var(--text-muted)] mb-1">{m.sender_name || "Bot"}</div>
        {m.text}
      </div>
    </div>
  );
}
