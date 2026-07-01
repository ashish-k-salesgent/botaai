import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api, { getToken } from "@/lib/api";
import { connectAgentWs, connectChatWs } from "@/lib/ws";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import AttachmentUpload from "@/components/AttachmentUpload";
import AttachmentList from "@/components/AttachmentList";

const PRIORITIES = ["low", "medium", "high", "critical"];
const CATEGORIES = ["Bug", "Question", "Feature", "Billing", "Other"];

export default function Chats() {
  const [sessions, setSessions] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [ticketOpen, setTicketOpen] = useState(false);
  const [ticketForm, setTicketForm] = useState({
    title: "", description: "", priority: "medium", category: "Question", attachments: [],
  });
  const bottomRef = useRef(null);
  const chatConnRef = useRef(null);
  const typingTimerRef = useRef(null);
  const activeRef = useRef(null);
  const { user } = useAuth();
  const canReply = can(user, "chats.reply");
  const canClose = can(user, "chats.close");
  const [team, setTeam] = useState([]);
  const [presenceAgents, setPresenceAgents] = useState([]);
  const [teamInfoOpen, setTeamInfoOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [customerTickets, setCustomerTickets] = useState({ count: 0, tickets: [] });

  activeRef.current = active;

  const loadSessions = () => api.get("/chats").then((r) => setSessions(r.data));

  const applyPresence = (msg) => {
    if (!activeRef.current || msg.data?.session_id !== activeRef.current.id) return;
    setPresenceAgents(msg.data.agents || []);
  };

  const loadMessages = (sess) => {
    const key = sess.customer_key || sess.visitor_email || sess.visitor_name;
    return api
      .get("/chats/customer/messages", { params: { customer_key: key } })
      .then((r) => setMessages(r.data));
  };

  const loadCustomerTickets = (sess) => {
    if (!sess) {
      setCustomerTickets({ count: 0, tickets: [] });
      return Promise.resolve();
    }
    const key = sess.customer_key || sess.visitor_email || sess.visitor_name;
    return api
      .get("/chats/customer/tickets", { params: { customer_key: key } })
      .then((r) => setCustomerTickets(r.data))
      .catch(() => setCustomerTickets({ count: 0, tickets: [] }));
  };

  const upsertSession = (sess) => {
    setSessions((prev) => {
      const key = sess.customer_key || sess.visitor_email || sess.visitor_name;
      const idx = prev.findIndex(
        (s) => (s.customer_key || s.visitor_email || s.visitor_name) === key
      );
      const next = idx >= 0 ? prev.map((s, i) => (i === idx ? { ...s, ...sess } : s)) : [sess, ...prev];
      return next.sort(
        (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
      );
    });
    setActive((cur) => {
      if (!cur) return cur;
      const key = sess.customer_key || sess.visitor_email || sess.visitor_name;
      const curKey = cur.customer_key || cur.visitor_email || cur.visitor_name;
      return curKey === key ? { ...cur, ...sess } : cur;
    });
  };

  useEffect(() => {
    api.get("/users").then((r) => setTeam((r.data || []).filter((u) => u.active !== false)));
    loadSessions();
    const conn = connectAgentWs((msg) => {
      if (msg.type === "session") upsertSession(msg.data);
      if (msg.type === "presence") applyPresence(msg);
    });
    return () => conn.close();
  }, []);

  useEffect(() => {
    if (!active) {
      setPresenceAgents([]);
      setTeamInfoOpen(false);
      setProfileOpen(false);
      setCustomerTickets({ count: 0, tickets: [] });
      return undefined;
    }
    loadCustomerTickets(active);
    loadMessages(active);
    api.get(`/chats/${active.id}/messages`).catch(() => {});
    const conn = connectChatWs(active.id, {
      token: getToken(),
      onMessage: (msg) => {
        if (msg.type === "message") {
          setMessages((prev) =>
            prev.some((m) => m.id === msg.data.id) ? prev : [...prev, msg.data]
          );
          if (msg.data?.sender === "system" && /ticket/i.test(msg.data?.text || "")) {
            loadCustomerTickets(activeRef.current);
          }
        }
        if (msg.type === "session") upsertSession(msg.data);
        if (msg.type === "presence") applyPresence(msg);
      },
    });
    chatConnRef.current = conn;
    return () => {
      conn.close();
      chatConnRef.current = null;
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, [active?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const onInputChange = (e) => {
    setText(e.target.value);
    chatConnRef.current?.send({ type: "presence", state: "typing" });
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      chatConnRef.current?.send({ type: "presence", state: "viewing" });
    }, 1500);
  };

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || !active) return;
    const body = text.trim();
    setText("");
    chatConnRef.current?.send({ type: "presence", state: "viewing" });
    try {
      await api.post(`/chats/${active.id}/messages`, { text: body, sender: "agent" });
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Send failed");
    }
  };

  const claim = async () => {
    try {
      await api.post(`/chats/${active.id}/claim`);
      toast.success("Marked as handling — others can still reply");
      loadSessions();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not update");
    }
  };

  const close = async () => {
    await api.post(`/chats/${active.id}/close`);
    toast.success("Chat closed — customer gets a fresh session next visit");
    setActive(null);
    loadSessions();
  };

  const createTicket = async (e) => {
    e.preventDefault();
    if (!active) return;
    try {
      const r = await api.post(`/chats/${active.id}/ticket`, ticketForm);
      toast.success(`Ticket ${r.data.code} created`);
      setTicketOpen(false);
      setTicketForm({ title: "", description: "", priority: "medium", category: "Question", attachments: [] });
      loadCustomerTickets(active);
    } catch {
      toast.error("Could not create ticket");
    }
  };

  const statusLine = buildStatusLine(active, presenceAgents, user?.id);
  const typingLine = buildTypingLine(presenceAgents, user?.id);

  return (
    <div className="h-[calc(100vh-4rem)] flex" data-testid="chats-page">
      <div className="w-72 border-r border-[var(--border)] bg-[var(--bg)] flex flex-col">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <div className="label-mono text-[var(--brand-primary)] mb-1">/ Live chat</div>
          <div className="font-display font-black text-xl">Customers</div>
          <div className="text-xs text-[var(--text-muted)] mt-1">One thread per customer</div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sessions.length === 0 && (
            <div className="p-4 text-sm text-[var(--text-muted)]">No chats yet.</div>
          )}
          {sessions.map((s) => (
            <button
              key={s.customer_key || s.id}
              onClick={() => setActive(s)}
              data-testid={`chat-session-${s.id}`}
              className={`w-full text-left px-4 py-3 border-b border-[var(--border)] hover:bg-[var(--bg-soft)] ${(active?.customer_key || active?.id) === (s.customer_key || s.id) ? "bg-[var(--bg-soft)]" : ""}`}
            >
              <div className="flex items-center gap-3">
                <Avatar name={s.visitor_name} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm truncate">{s.visitor_name}</span>
                    <span className="text-[10px] font-mono text-[var(--text-muted)] shrink-0">
                      {formatTime(s.last_message_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className="text-xs font-mono text-[var(--text-muted)] truncate">
                      {s.agent_name ? `${s.agent_name}: ` : ""}
                      {s.status === "queue" ? "Waiting for agent" : s.status === "ai" ? "Chatting with AI" : s.status}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {s.unread > 0 && (
                        <span className="bg-[var(--brand-primary)] text-white text-[10px] min-w-[18px] h-[18px] flex items-center justify-center font-mono font-semibold">
                          {s.unread > 9 ? "9+" : s.unread}
                        </span>
                      )}
                      <StatusDot status={s.status} />
                    </div>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-[var(--bg-soft)]">
        {!active && (
          <div className="flex-1 flex items-center justify-center text-sm text-[var(--text-muted)]">
            Select a customer conversation
          </div>
        )}
        {active && (
          <>
            <div className="h-16 border-b border-[var(--border)] bg-[var(--bg)] px-6 flex items-center gap-4">
              <button
                type="button"
                onClick={() => setProfileOpen((o) => !o)}
                className="flex items-center gap-4 flex-1 min-w-0 text-left hover:opacity-90"
                data-testid="chat-customer-profile"
              >
                <Avatar name={active.visitor_name} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold truncate">{active.visitor_name}</span>
                    {customerTickets.count > 0 && (
                      <span className="text-[10px] font-mono bg-[var(--brand-primary)] text-white px-1.5 py-0.5 shrink-0">
                        {customerTickets.count} ticket{customerTickets.count === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                  <div className={`text-xs font-mono truncate ${typingLine ? "text-[var(--brand-primary)]" : "text-[var(--text-muted)]"}`}>
                    {typingLine ? (
                      <>
                        {typingLine}
                        <span className="typing-dots inline-flex ml-0.5">
                          <span>.</span><span>.</span><span>.</span>
                        </span>
                      </>
                    ) : (active.visitor_email || statusLine)}
                  </div>
                </div>
              </button>
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setTeamInfoOpen((o) => !o)}
                  className="border border-[var(--border)] w-9 h-9 flex items-center justify-center text-[var(--text-muted)] hover:border-[var(--text-primary)] text-lg"
                  title="Actions"
                >
                  ⋮
                </button>
                {teamInfoOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setTeamInfoOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 z-50 w-56 bg-[var(--bg)] border border-[var(--border)] shadow-lg py-1 text-sm">
                    {canReply && active.status !== "live" && active.status !== "closed" && (
                      <button type="button" onClick={() => { claim(); setTeamInfoOpen(false); }} className="w-full text-left px-4 py-2.5 hover:bg-[var(--bg-soft)]">
                        I'm on it
                      </button>
                    )}
                    {active.status !== "closed" && (canReply || canClose) && (
                      <>
                        {canReply && (
                        <button
                          type="button"
                          onClick={() => {
                            setTicketForm((f) => ({
                              ...f,
                              title: `Support: ${active.visitor_name}`,
                              description: messages.filter((m) => m.sender === "user").slice(-3).map((m) => m.text).join("\n\n") || "",
                            }));
                            setTicketOpen(true);
                            setTeamInfoOpen(false);
                          }}
                          className="w-full text-left px-4 py-2.5 hover:bg-[var(--bg-soft)]"
                        >
                          Create ticket
                        </button>
                        )}
                        {canClose && (
                        <>
                        <button type="button" onClick={() => { close(); setTeamInfoOpen(false); }} className="w-full text-left px-4 py-2.5 hover:bg-[var(--danger-surface)] text-[var(--brand-destructive)]">
                          Close chat
                        </button>
                        <div className="border-t border-[var(--border)] my-1" />
                        </>
                        )}
                      </>
                    )}
                    <div className="px-4 py-2 label-mono text-[var(--brand-primary)] text-[10px]">Team</div>
                    {team.map((m) => {
                      const { label, color } = agentStatus(m, active, presenceAgents);
                      return (
                        <div key={m.id} className="px-4 py-2 flex items-center gap-2 border-t border-[var(--border)]">
                          <Avatar name={m.name} size="sm" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm truncate font-medium">{m.id === user?.id ? "You" : m.name}</div>
                            <div className="text-xs font-mono" style={{ color }}>{label}</div>
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  </>
                )}
              </div>
            </div>

            {profileOpen && (
              <div className="border-b border-[var(--border)] bg-[var(--bg)] px-6 py-4" data-testid="chat-customer-tickets">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="label-mono text-[var(--brand-primary)] text-[10px]">Customer profile</div>
                    <div className="text-sm font-semibold">{active.visitor_name}</div>
                    {active.visitor_email && (
                      <div className="text-xs font-mono text-[var(--text-muted)]">{active.visitor_email}</div>
                    )}
                  </div>
                  <button type="button" onClick={() => setProfileOpen(false)} className="text-xs font-mono text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                    Close
                  </button>
                </div>
                {customerTickets.tickets.length === 0 ? (
                  <div className="text-xs text-[var(--text-muted)] font-mono py-2">No tickets yet for this customer.</div>
                ) : (
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 max-h-56 overflow-y-auto">
                    {customerTickets.tickets.map((t) => (
                      <Link
                        key={t.id}
                        to={t.space_id ? `/app/tickets/${t.id}?space=${t.space_id}` : `/app/tickets/${t.id}`}
                        onClick={() => setProfileOpen(false)}
                        className="flex flex-col border border-[var(--border)] p-2.5 hover:border-[var(--text-primary)] bg-[var(--bg-soft)] min-h-[88px]"
                        data-testid={`chat-customer-ticket-${t.code}`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-1.5">
                          <span className="label-mono text-[var(--text-muted)] text-[9px] truncate">{t.code}</span>
                          <TicketStatusPill status={t.status} />
                        </div>
                        <div className="text-xs font-semibold leading-snug line-clamp-2 flex-1">{t.title}</div>
                        <div className="text-[9px] font-mono text-[var(--text-muted)] mt-1.5 truncate">
                          {t.priority} · {t.category}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {messages.map((m, i) => {
                const prev = messages[i - 1];
                const showDay =
                  m.created_at &&
                  messageDayKey(m.created_at) !== messageDayKey(prev?.created_at);
                return (
                  <div key={m.id}>
                    {showDay && (
                      <div className="text-center my-3">
                        <span className="text-[10px] font-mono text-[var(--text-muted)] bg-[var(--bg-soft)] border border-[var(--border)] px-2 py-0.5">
                          {formatDayLabel(m.created_at)}
                        </span>
                      </div>
                    )}
                    <Bubble m={m} userName={user?.name} />
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {canReply && active.status !== "closed" && (
              <form onSubmit={send} className="border-t border-[var(--border)] bg-[var(--bg)] p-4 flex gap-2">
                <input
                  value={text}
                  onChange={onInputChange}
                  data-testid="chat-input"
                  placeholder="Type a reply…"
                  className="flex-1 border border-[var(--border)] bg-[var(--input-bg)] text-[var(--text-primary)] px-3 py-2 text-sm"
                />
                <button data-testid="chat-send" className="btn-primary px-5 text-sm font-semibold">
                  Send
                </button>
              </form>
            )}
          </>
        )}
      </div>

      {ticketOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <form onSubmit={createTicket} className="modal-shell w-full max-w-md p-6 space-y-3">
            <div className="font-display font-black text-lg">Create ticket</div>
            <p className="text-xs text-[var(--text-muted)]">
              For {active?.visitor_name} ({active?.visitor_email || "no email"})
            </p>
            <input
              required
              value={ticketForm.title}
              onChange={(e) => setTicketForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Title"
              className="field-input"
            />
            <textarea
              required
              value={ticketForm.description}
              onChange={(e) => setTicketForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Description"
              rows={4}
              className="field-input"
            />
            <div className="flex gap-2">
              <select
                value={ticketForm.priority}
                onChange={(e) => setTicketForm((f) => ({ ...f, priority: e.target.value }))}
                className="flex-1 border border-[var(--border)] px-2 py-2 text-sm"
              >
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <select
                value={ticketForm.category}
                onChange={(e) => setTicketForm((f) => ({ ...f, category: e.target.value }))}
                className="flex-1 border border-[var(--border)] px-2 py-2 text-sm"
              >
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <AttachmentUpload
              value={ticketForm.attachments}
              onChange={(attachments) => setTicketForm((f) => ({ ...f, attachments }))}
            />
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={() => setTicketOpen(false)} className="px-4 py-2 text-sm border border-[var(--border)] text-[var(--text-primary)]">
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 text-sm btn-primary font-semibold">
                Create
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatMessageTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return time;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} · ${time}`;
}

function messageDayKey(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toDateString();
}

function formatDayLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function firstName(name) {
  return (name || "Agent").split(" ")[0];
}

function buildTypingLine(agents, meId) {
  const typing = agents.filter((a) => a.state === "typing" && a.user_id !== meId);
  if (!typing.length) return null;
  const names = typing.map((a) => firstName(a.name));
  if (names.length === 1) return `${names[0]} is typing`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing`;
  return `${names.length} people are typing`;
}

function buildStatusLine(session, agents, meId) {
  const typing = buildTypingLine(agents, meId);
  if (typing) return typing;
  const here = agents.filter((a) => a.state === "viewing" && a.user_id !== meId);
  if (here.length === 1) return `${firstName(here[0].name)} is here`;
  if (here.length > 1) return `${here.length} agents here`;
  if (session?.status === "live" && session?.agent_name) return `Active · last by ${session.agent_name}`;
  if (session?.status === "queue") return "Waiting for an agent";
  if (session?.status === "ai") return session?.visitor_email || "AI chat";
  if (session?.status === "closed") return "Closed";
  return session?.visitor_email || "Customer";
}

function agentStatus(agent, session, presenceAgents) {
  const live = presenceAgents.find((a) => a.user_id === agent.id);
  if (live?.state === "typing") return { label: "typing", color: "var(--brand-warning)" };
  if (live?.state === "viewing") return { label: "viewing", color: "var(--brand-success)" };
  const readAt = session?.agent_reads?.[agent.id];
  const unread = !readAt || (session?.last_message_at && readAt < session.last_message_at);
  if (unread) return { label: "unread", color: "var(--brand-primary)" };
  return { label: "read", color: "var(--text-muted)" };
}

function Avatar({ name, size = "md" }) {
  const initial = (name || "?").charAt(0).toUpperCase();
  const sz = size === "sm" ? "w-9 h-9 text-xs" : "w-10 h-10 text-sm";
  return (
    <div className={`${sz} bg-[var(--brand-primary)] text-white font-display font-black flex items-center justify-center shrink-0`}>
      {initial}
    </div>
  );
}

function Bubble({ m, userName }) {
  const time = formatMessageTime(m.created_at);
  if (m.sender === "system") {
    return (
      <div className="flex justify-center">
        <div className="max-w-[85%] alert-banner alert-info text-center text-[11px]">
          <span className="label-mono text-[10px] opacity-80">System · </span>
          {m.text}
          {time && <span className="block text-[10px] font-mono opacity-70 mt-1">{time}</span>}
        </div>
      </div>
    );
  }
  if (m.sender === "bot") {
    return (
      <div className="max-w-[70%] bg-[var(--bg)] border border-[var(--border)] text-[var(--text-primary)] px-3 py-2 text-sm">
        <div className="flex items-center justify-between gap-3 mb-1">
          <span className="label-mono text-[var(--brand-primary)] text-[10px]">AI · {m.sender_name}</span>
          {time && <span className="text-[10px] font-mono text-[var(--text-muted)] shrink-0">{time}</span>}
        </div>
        {m.text}
        <AttachmentList items={m.meta?.attachments} compact />
      </div>
    );
  }
  if (m.sender === "agent") {
    const isMe = m.sender_name === userName;
    return (
      <div className="max-w-[70%] ml-auto bg-[var(--brand-primary)] text-white px-3 py-2 text-sm">
        <div className="flex items-center justify-between gap-3 mb-1">
          <span className="label-mono opacity-80 text-[10px]">{isMe ? "You" : m.sender_name || "Agent"}</span>
          {time && <span className="text-[10px] font-mono opacity-70 shrink-0">{time}</span>}
        </div>
        {m.text}
        <AttachmentList items={m.meta?.attachments} compact />
      </div>
    );
  }
  return (
    <div className="max-w-[70%] bg-[var(--inverse-bg)] text-[var(--inverse-fg)] px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="label-mono opacity-80 text-[10px]">{m.sender_name || "Visitor"}</span>
        {time && <span className="text-[10px] font-mono opacity-70 shrink-0">{time}</span>}
      </div>
      {m.text}
      <AttachmentList items={m.meta?.attachments} compact />
    </div>
  );
}

function StatusDot({ status }) {
  const c = { ai: "#34C759", queue: "#FFCC00", live: "#002FA7", closed: "#9CA3AF" }[status] || "#9CA3AF";
  return <span className="w-2 h-2 inline-block shrink-0" style={{ background: c }} title={status} />;
}

const TICKET_STATUS_COLOR = {
  new: "#002FA7",
  open: "#002FA7",
  in_progress: "#FF8C00",
  development: "#7C3AED",
  qa: "#7C3AED",
  testing: "#7C3AED",
  waiting: "#FFCC00",
  done: "#34C759",
  closed: "#9CA3AF",
};

function TicketStatusPill({ status }) {
  const label = (status || "new").replace(/_/g, " ");
  return (
    <span
      className="text-[9px] font-mono uppercase px-1.5 py-0.5 text-white shrink-0"
      style={{ background: TICKET_STATUS_COLOR[status] || "#9CA3AF" }}
    >
      {label}
    </span>
  );
}
