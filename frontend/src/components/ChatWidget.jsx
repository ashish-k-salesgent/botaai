import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { MessageSquare, X, Send, UserRound } from "lucide-react";
import { connectChatWs } from "@/lib/ws";
import AttachmentUpload from "@/components/AttachmentUpload";

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
  const [escalated, setEscalated] = useState(false);
  const [pendingText, setPendingText] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [ticketForm, setTicketForm] = useState({ title: "", description: "", priority: "medium", category: "Question", attachments: [] });
  const bottomRef = useRef(null);
  const sendingRef = useRef(false);

  useEffect(() => {
    if (!session || !open) return undefined;
    const conn = connectChatWs(session, {
      clientId,
      onMessage: (msg) => {
        if (msg.type === "message") {
          setMessages((prev) =>
            prev.some((m) => m.id === msg.data.id) ? prev : [...prev, msg.data]
          );
          if (msg.data.sender === "agent") setEscalated(true);
        }
        if (msg.type === "session" && (msg.data.status === "queue" || msg.data.status === "live")) {
          setEscalated(true);
        }
      },
    });
    return () => conn.close();
  }, [session, open, clientId]);

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
    const msg = msgText.trim();
    if (!session || !msg || sendingRef.current) return;
    setPendingText(msg);
    setMessages((m) => [...m, { id: "__pending__", sender: "user", text: msg }]);
    setText("");
    sendingRef.current = true;
    setSending(true);
    try {
      const r = await axios.post(`${API}/widget/message`, { session_id: session, text: msg });
      setPendingText(null);
      if (r.data.user_message) {
        setMessages((m) => {
          const without = m.filter((x) => x.id !== "__pending__");
          return without.find((x) => x.id === r.data.user_message.id)
            ? without
            : [...without, r.data.user_message];
        });
      }
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
      setPendingText(null);
      setMessages((m) => [
        ...m.filter((x) => x.id !== "__pending__"),
        { id: "e", sender: "bot", text: "Could not send. Try again.", sender_name: "System" },
      ]);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const escalate = async () => {
    if (!session) return;
    await axios.post(`${API}/widget/escalate`, { session_id: session });
    setEscalated(true);
    setMessages((m) => [...m, { id: "esc", sender: "system", text: "Escalated to human. An agent will join shortly.", created_at: new Date().toISOString() }]);
  };

  const restartSession = async () => {
    if (session) {
      try {
        await axios.post(`${API}/widget/close`, { session_id: session });
      } catch {
        /* ignore */
      }
    }
    setMenuOpen(false);
    setTicketOpen(false);
    setEscalated(false);
    setSession(null);
    setMessages([]);
    try {
      const r = await axios.post(`${API}/widget/init`, {
        client_id: clientId,
        visitor_name: "Guest",
        force_new: true,
      });
      setSession(r.data.session_id);
      setBot(r.data.bot);
      setTenant(r.data.tenant);
      setMessages([{ id: "g", sender: "bot", text: r.data.greeting, sender_name: r.data.bot?.name || "Bot" }]);
    } catch {
      setMessages([{ id: "err", sender: "bot", text: "Could not start a new conversation.", sender_name: "System" }]);
    }
  };

  const openTicketModal = () => {
    setMenuOpen(false);
    const userMsgs = messages.filter((m) => m.sender === "user");
    setTicketForm({
      title: userMsgs[userMsgs.length - 1]?.text?.slice(0, 80) || "",
      description: userMsgs.slice(-3).map((m) => m.text).join("\n\n"),
      priority: "medium",
      category: "Question",
      attachments: [],
    });
    setTicketOpen(true);
  };

  const submitTicket = async () => {
    if (!session || !ticketForm.title.trim() || !ticketForm.description.trim()) return;
    try {
      const r = await axios.post(`${API}/widget/ticket`, { session_id: session, ...ticketForm });
      setTicketOpen(false);
      setMessages((m) => [...m, {
        id: Math.random().toString(),
        sender: "system",
        text: `✓ Ticket ${r.data.code} created · ${r.data.priority} · ${r.data.category}`,
      }]);
    } catch (err) {
      setMessages((m) => [...m, {
        id: Math.random().toString(),
        sender: "system",
        text: err.response?.data?.detail || "Could not create ticket",
      }]);
    }
  };

  const subtitle = escalated || messages.some((m) => m.sender === "agent")
    ? "Live agent · online"
    : `${bot?.name || "AI assistant"} · online`;

  const showQuick = !escalated && !messages.some((m) => m.sender === "agent");

  const theme = bot?.theme_color || tenant?.branding?.primary_color || "#002FA7";

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          data-testid="widget-bubble"
          style={{ background: theme }}
          className="fixed bottom-20 right-6 w-14 h-14 text-white shadow-lg hover:scale-105 transition-transform z-50 flex items-center justify-center"
        >
          <MessageSquare size={22} />
        </button>
      )}

      {open && (
        <div data-testid="widget-window" className="fixed bottom-20 right-6 w-96 max-w-[calc(100vw-3rem)] h-[560px] max-h-[calc(100vh-7rem)] bg-white border border-[var(--text-primary)] shadow-2xl flex flex-col z-50 relative">
          <div style={{ background: theme }} className="text-white px-4 py-3 flex items-center justify-between">
            <div>
              <div className="font-display font-black tracking-tight">{tenant?.name || "BotAAI"}</div>
              <div className="text-xs opacity-80">{subtitle}</div>
            </div>
            <div className="flex items-center gap-1 relative">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                className="text-white px-2 py-1"
                title="Options"
              >
                ⋮
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-8 top-full mt-1 z-50 w-48 bg-white border border-[var(--text-primary)] text-[var(--text-primary)] text-sm shadow-lg">
                    <button type="button" onClick={restartSession} className="w-full text-left px-3 py-2 hover:bg-[var(--bg-soft)]">
                      New conversation
                    </button>
                    <button type="button" onClick={openTicketModal} className="w-full text-left px-3 py-2 hover:bg-[var(--bg-soft)]">
                      Create ticket
                    </button>
                  </div>
                </>
              )}
              <button onClick={() => setOpen(false)} data-testid="widget-close"><X size={18} /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[var(--bg-soft)]">
            {messages.map((m) => <WMsg key={m.id} m={m} theme={theme} />)}
            {sending && <div className="text-xs text-[var(--text-muted)] font-mono">Bot is thinking…</div>}
            <div ref={bottomRef} />
          </div>

          {showQuick && (
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
              placeholder={escalated ? "Message the agent…" : "Ask anything…"}
              className="flex-1 border border-[var(--border)] px-3 py-2 text-sm"
            />
            <button data-testid="widget-send" style={{ background: theme }} className="text-white px-3 flex items-center justify-center disabled:opacity-50" disabled={sending}>
              <Send size={14} />
            </button>
          </form>

          {ticketOpen && (
            <div className="absolute inset-0 bg-white z-50 flex flex-col p-4 border-t border-[var(--border)]">
              <div className="font-display font-black text-base mb-3">Create ticket</div>
              <label className="label-mono text-[10px] mb-1">Title</label>
              <input
                value={ticketForm.title}
                onChange={(e) => setTicketForm({ ...ticketForm, title: e.target.value })}
                className="border border-[var(--border)] px-3 py-2 text-sm mb-2"
              />
              <label className="label-mono text-[10px] mb-1">Description</label>
              <textarea
                value={ticketForm.description}
                onChange={(e) => setTicketForm({ ...ticketForm, description: e.target.value })}
                rows={4}
                className="border border-[var(--border)] px-3 py-2 text-sm mb-2"
              />
              <div className="grid grid-cols-2 gap-2 mb-2">
                <select value={ticketForm.priority} onChange={(e) => setTicketForm({ ...ticketForm, priority: e.target.value })} className="border border-[var(--border)] px-2 py-2 text-sm">
                  {["low", "medium", "high", "critical"].map((p) => <option key={p}>{p}</option>)}
                </select>
                <select value={ticketForm.category} onChange={(e) => setTicketForm({ ...ticketForm, category: e.target.value })} className="border border-[var(--border)] px-2 py-2 text-sm">
                  {["Question", "Bug", "Feature Request", "Billing", "Integration", "Technical Support"].map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <AttachmentUpload
                value={ticketForm.attachments}
                onChange={(attachments) => setTicketForm({ ...ticketForm, attachments })}
                clientId={clientId}
                sessionId={session}
                label="Attach files"
              />
              <div className="flex gap-2 mt-3">
                <button type="button" onClick={() => setTicketOpen(false)} className="flex-1 border border-[var(--border)] py-2 text-sm">Cancel</button>
                <button type="button" onClick={submitTicket} style={{ background: theme }} className="flex-1 text-white py-2 text-sm">Create ticket</button>
              </div>
            </div>
          )}
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
  const label = m.sender === "agent" ? (m.sender_name || "Agent") : (m.sender_name || "Bot");
  return (
    <div className="max-w-[85%]">
      <div className="bg-white border border-[var(--border)] px-3 py-2 text-sm">
        <div className="label-mono text-[var(--text-muted)] mb-1">{label}</div>
        {m.text}
      </div>
    </div>
  );
}
