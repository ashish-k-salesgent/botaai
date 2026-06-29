import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

export default function Chats() {
  const [sessions, setSessions] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const bottomRef = useRef(null);
  const { user } = useAuth();

  const loadSessions = () => api.get("/chats").then((r) => setSessions(r.data));
  const loadMessages = (id) => api.get(`/chats/${id}/messages`).then((r) => setMessages(r.data));

  useEffect(() => {
    loadSessions();
    const id = setInterval(() => {
      loadSessions();
      if (active) loadMessages(active.id);
    }, 4000);
    return () => clearInterval(id);
  }, [active]);

  useEffect(() => {
    if (active) loadMessages(active.id);
  }, [active]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || !active) return;
    await api.post(`/chats/${active.id}/messages`, { text, sender: "agent" });
    setText("");
    loadMessages(active.id);
  };

  const claim = async () => {
    await api.post(`/chats/${active.id}/claim`);
    toast.success("Chat claimed");
    loadSessions();
  };

  const close = async () => {
    await api.post(`/chats/${active.id}/close`);
    toast.success("Chat closed");
    setActive(null);
    loadSessions();
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex" data-testid="chats-page">
      {/* Session list */}
      <div className="w-72 border-r border-[var(--border)] bg-white flex flex-col">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <div className="label-mono text-[var(--brand-primary)] mb-1">/ Live chat</div>
          <div className="font-display font-black text-xl">Conversations</div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sessions.length === 0 && (
            <div className="p-4 text-sm text-[var(--text-muted)]">No chats yet.</div>
          )}
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s)}
              data-testid={`chat-session-${s.id}`}
              className={`w-full text-left px-4 py-3 border-b border-[var(--border)] hover:bg-[var(--bg-soft)] ${active?.id === s.id ? "bg-[var(--bg-soft)]" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm truncate">{s.visitor_name}</span>
                <StatusDot status={s.status} />
              </div>
              <div className="text-xs font-mono text-[var(--text-muted)] mt-0.5">
                {new Date(s.last_message_at).toLocaleTimeString()} · {s.status}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Active conversation */}
      <div className="flex-1 flex flex-col bg-[var(--bg-soft)]">
        {!active && (
          <div className="flex-1 flex items-center justify-center text-sm text-[var(--text-muted)]">
            Select a conversation
          </div>
        )}
        {active && (
          <>
            <div className="h-16 border-b border-[var(--border)] bg-white px-6 flex items-center justify-between">
              <div>
                <div className="font-semibold">{active.visitor_name}</div>
                <div className="text-xs font-mono text-[var(--text-muted)]">{active.visitor_email || "no email"} · {active.status}</div>
              </div>
              <div className="flex gap-2">
                {active.status !== "live" && (
                  <button onClick={claim} data-testid="chat-claim-btn" className="border border-[var(--text-primary)] px-3 py-1.5 text-xs font-semibold hover:bg-[var(--text-primary)] hover:text-white">
                    Claim
                  </button>
                )}
                {active.status !== "closed" && (
                  <button onClick={close} data-testid="chat-close-btn" className="border border-[var(--brand-destructive)] text-[var(--brand-destructive)] px-3 py-1.5 text-xs font-semibold hover:bg-red-50">
                    Close
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {messages.map((m) => (
                <Bubble key={m.id} m={m} self={m.sender === "agent"} />
              ))}
              <div ref={bottomRef} />
            </div>

            <form onSubmit={send} className="border-t border-[var(--border)] bg-white p-4 flex gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                data-testid="chat-input"
                placeholder="Type a reply…"
                className="flex-1 border border-[var(--border)] px-3 py-2 text-sm"
              />
              <button data-testid="chat-send" className="bg-[var(--brand-primary)] text-white px-5 text-sm font-semibold">
                Send
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function Bubble({ m, self }) {
  if (m.sender === "bot") {
    return (
      <div className="max-w-[70%] bg-white border border-[var(--border)] px-3 py-2 text-sm">
        <div className="label-mono text-[var(--brand-primary)] mb-1">AI · {m.sender_name}</div>
        {m.text}
      </div>
    );
  }
  if (self) {
    return (
      <div className="max-w-[70%] ml-auto bg-[var(--brand-primary)] text-white px-3 py-2 text-sm">
        <div className="label-mono opacity-80 mb-1">Agent</div>
        {m.text}
      </div>
    );
  }
  return (
    <div className="max-w-[70%] bg-[var(--text-primary)] text-white px-3 py-2 text-sm">
      <div className="label-mono opacity-80 mb-1">{m.sender_name || "Visitor"}</div>
      {m.text}
    </div>
  );
}

function StatusDot({ status }) {
  const c = { ai: "#34C759", queue: "#FFCC00", live: "#002FA7", closed: "#9CA3AF" }[status] || "#9CA3AF";
  return <span className="w-2 h-2 inline-block" style={{ background: c }} title={status} />;
}
