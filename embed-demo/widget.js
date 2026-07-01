/**
 * BotAAI embeddable chat widget — drop into any website.
 * Usage:
 *   <script>
 *     window.BOTAAI_VISITOR = { name: "Jane", email: "jane@co.com" };
 *   </script>
 *   <script src="http://localhost:8085/widget.js"
 *           data-client="botaai_892ae1e0-579"
 *           data-api="http://localhost:8085"></script>
 */
(function () {
  function getScriptEl() {
    return (
      document.currentScript ||
      document.getElementById("botaai-widget-script") ||
      document.querySelector('script[src*="widget.js"][data-client]')
    );
  }

  const script = getScriptEl();
  const cfg = window.BOTAAI_CONFIG || {};
  const CLIENT_ID = script?.getAttribute("data-client") || cfg.clientId;
  const API_BASE = (script?.getAttribute("data-api") || cfg.api || "http://localhost:8085").replace(/\/$/, "");
  const API = API_BASE + "/api";

  if (!CLIENT_ID) {
    console.error("[BotAAI] Missing data-client on widget script tag");
    return;
  }

  const themeDefault = "#002FA7";
  let session = null;
  let bot = null;
  let tenant = null;
  let messages = [];
  let open = false;
  let chatWs = null;
  let wsStopped = false;
  let pingTimer = null;
  let escalated = false;
  let sending = false;
  let pendingText = null;
  let pendingAttachments = [];
  let ticketAttachments = [];

  function disconnectChatWs() {
    wsStopped = true;
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    if (chatWs) {
      chatWs.close();
      chatWs = null;
    }
  }

  function appendRemoteMessage(data) {
    if (messages.find((m) => m.id === data.id)) return;
    messages.push(data);
    if (data.sender === "agent") {
      els.botName.textContent = "Live agent · online";
      els.input.placeholder = "Message the agent…";
    }
    render();
  }

  function connectChatWs() {
    if (!session) return;
    disconnectChatWs();
    wsStopped = false;
    const wsBase = API_BASE.replace(/^http/, "ws");
    const url = `${wsBase}/api/ws/chat/${session}?client_id=${encodeURIComponent(CLIENT_ID)}`;

    const connect = () => {
      if (wsStopped) return;
      chatWs = new WebSocket(url);
      chatWs.onopen = () => {
        pingTimer = setInterval(() => {
          if (chatWs?.readyState === WebSocket.OPEN) {
            chatWs.send(JSON.stringify({ type: "ping" }));
          }
        }, 25000);
      };
      chatWs.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "message") appendRemoteMessage(msg.data);
          if (msg.type === "session") {
            if (msg.data.status === "queue" || msg.data.status === "live") {
              escalated = true;
              els.botName.textContent =
                msg.data.status === "live" ? "Live agent · online" : "Waiting for agent…";
              els.input.placeholder = "Message the agent…";
            }
          }
        } catch {
          /* ignore */
        }
      };
      chatWs.onclose = () => {
        if (pingTimer) {
          clearInterval(pingTimer);
          pingTimer = null;
        }
        if (!wsStopped) setTimeout(connect, 3000);
      };
    };
    connect();
  }

  const css = document.createElement("style");
  css.textContent = `
    #botaai-bubble{position:fixed;bottom:24px;right:24px;width:56px;height:56px;border:none;border-radius:0;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.18);z-index:99999;display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px}
    #botaai-panel{position:fixed;bottom:96px;right:24px;width:384px;max-width:calc(100vw - 48px);height:560px;max-height:calc(100vh - 120px);background:#fff;border:1px solid #111;box-shadow:0 16px 48px rgba(0,0,0,.2);z-index:99999;display:none;flex-direction:column;font-family:Inter,system-ui,sans-serif}
    #botaai-panel.open{display:flex}
    #botaai-header{color:#fff;padding:12px 16px;display:flex;justify-content:space-between;align-items:center}
    #botaai-header h4{margin:0;font-size:16px;font-weight:800}
    #botaai-header small{opacity:.85;font-size:11px}
    #botaai-header-actions{display:flex;gap:4px;align-items:center}
    #botaai-menu,#botaai-close{background:none;border:none;color:#fff;cursor:pointer;font-size:18px;padding:4px 6px}
    #botaai-menu-wrap{position:relative}
    #botaai-dropdown{position:absolute;right:0;top:100%;margin-top:4px;background:#fff;border:1px solid #111;min-width:180px;display:none;z-index:10}
    #botaai-dropdown.open{display:block}
    #botaai-dropdown button{display:block;width:100%;text-align:left;border:none;background:#fff;padding:10px 12px;font-size:13px;cursor:pointer;color:#111}
    #botaai-dropdown button:hover{background:#f3f4f6}
    #botaai-modal{position:absolute;inset:0;background:rgba(255,255,255,.98);z-index:20;display:none;flex-direction:column;padding:16px;overflow-y:auto}
    #botaai-modal.open{display:flex}
    #botaai-modal h5{margin:0 0 12px;font-size:15px;font-weight:800}
    #botaai-modal label{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;margin:8px 0 4px}
    #botaai-modal input,#botaai-modal textarea,#botaai-modal select{width:100%;border:1px solid #e5e7eb;padding:8px;font-size:13px;box-sizing:border-box}
    #botaai-modal textarea{min-height:80px;resize:vertical}
    #botaai-modal-actions{display:flex;gap:8px;margin-top:12px}
    #botaai-modal-actions button{flex:1;padding:10px;font-size:13px;cursor:pointer;border:1px solid #e5e7eb;background:#fff}
    #botaai-modal-submit{border:none!important;color:#fff!important}
    #botaai-ticket-pending{font-size:10px;font-family:monospace;color:#6b7280;margin:8px 0;display:flex;flex-wrap:wrap;gap:4px}
    #botaai-ticket-attach{border:1px solid #e5e7eb;background:#fff;padding:6px 10px;font-size:12px;cursor:pointer;margin-top:4px}
    #botaai-msgs{flex:1;overflow-y:auto;padding:16px;background:#f8f9fb;display:flex;flex-direction:column;gap:8px}
    .botaai-msg-user{margin-left:auto;max-width:85%;color:#fff;padding:8px 12px;font-size:14px}
    .botaai-msg-bot{max-width:85%;background:#fff;border:1px solid #e5e7eb;padding:8px 12px;font-size:14px}
    .botaai-msg-bot .who{font-size:10px;color:#6b7280;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em}
    .botaai-msg-sys{font-size:11px;font-family:monospace;color:#002FA7;background:#eff6ff;border:1px solid #bfdbfe;padding:6px 8px}
    #botaai-quick{padding:8px 12px;border-top:1px solid #e5e7eb;display:flex;flex-wrap:wrap;gap:6px}
    #botaai-quick button{font-size:11px;border:1px solid #e5e7eb;background:#fff;padding:4px 8px;cursor:pointer}
    #botaai-form{border-top:1px solid #e5e7eb;padding:12px;display:flex;gap:8px;align-items:center}
    #botaai-attach{border:1px solid #e5e7eb;background:#fff;width:36px;height:36px;cursor:pointer;font-size:16px}
    #botaai-pending{font-size:10px;font-family:monospace;color:#6b7280;padding:0 12px 8px;display:flex;flex-wrap:wrap;gap:4px}
    .botaai-att{display:inline-flex;align-items:center;gap:4px;border:1px solid #e5e7eb;padding:2px 6px;background:#fff;font-size:10px}
    .botaai-att img{max-width:120px;max-height:80px;display:block;margin-top:4px}
    #botaai-input{flex:1;border:1px solid #e5e7eb;padding:8px 12px;font-size:14px}
    #botaai-send{border:none;color:#fff;width:40px;cursor:pointer;display:flex;align-items:center;justify-content:center}
  `;
  document.head.appendChild(css);

  const bubble = document.createElement("button");
  bubble.id = "botaai-bubble";
  bubble.innerHTML = "💬";
  bubble.title = "Chat with support";
  document.body.appendChild(bubble);

  const panel = document.createElement("div");
  panel.id = "botaai-panel";
  panel.innerHTML = `
    <div id="botaai-header">
      <div><h4 id="botaai-tenant-name">BotAAI</h4><small id="botaai-bot-name">AI assistant · online</small></div>
      <div id="botaai-header-actions">
        <div id="botaai-menu-wrap">
          <button type="button" id="botaai-menu" title="Options">⋮</button>
          <div id="botaai-dropdown">
            <button type="button" id="botaai-new-chat">New conversation</button>
            <button type="button" id="botaai-create-ticket">Create ticket</button>
          </div>
        </div>
        <button type="button" id="botaai-close">✕</button>
      </div>
    </div>
    <div id="botaai-msgs"></div>
    <div id="botaai-quick"></div>
    <div id="botaai-pending"></div>
    <form id="botaai-form">
      <button type="button" id="botaai-attach" title="Attach file">📎</button>
      <input type="file" id="botaai-file" multiple style="display:none" accept="image/*,video/*,.pdf,.doc,.docx,.txt,.csv,.xlsx,.xls,.ppt,.pptx" />
      <input id="botaai-input" placeholder="Ask anything…" autocomplete="off" />
      <button type="submit" id="botaai-send">➤</button>
    </form>
    <div id="botaai-modal">
      <h5>Create ticket</h5>
      <label>Title</label>
      <input id="botaai-ticket-title" placeholder="Brief summary" />
      <label>Description</label>
      <textarea id="botaai-ticket-desc" placeholder="Describe your issue…"></textarea>
      <label>Priority</label>
      <select id="botaai-ticket-priority">
        <option value="low">low</option>
        <option value="medium" selected>medium</option>
        <option value="high">high</option>
        <option value="critical">critical</option>
      </select>
      <label>Category</label>
      <select id="botaai-ticket-category">
        <option>Question</option>
        <option>Bug</option>
        <option>Feature Request</option>
        <option>Billing</option>
        <option>Integration</option>
        <option>Technical Support</option>
      </select>
      <label>Attachments</label>
      <button type="button" id="botaai-ticket-attach">📎 Add files</button>
      <input type="file" id="botaai-ticket-file" multiple style="display:none" accept="image/*,video/*,.pdf,.doc,.docx,.txt,.csv,.xlsx,.xls,.ppt,.pptx" />
      <div id="botaai-ticket-pending"></div>
      <div id="botaai-modal-actions">
        <button type="button" id="botaai-modal-cancel">Cancel</button>
        <button type="button" id="botaai-modal-submit">Create ticket</button>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  const els = {
    header: panel.querySelector("#botaai-header"),
    tenantName: panel.querySelector("#botaai-tenant-name"),
    botName: panel.querySelector("#botaai-bot-name"),
    msgs: panel.querySelector("#botaai-msgs"),
    quick: panel.querySelector("#botaai-quick"),
    input: panel.querySelector("#botaai-input"),
    send: panel.querySelector("#botaai-send"),
    attach: panel.querySelector("#botaai-attach"),
    file: panel.querySelector("#botaai-file"),
    pending: panel.querySelector("#botaai-pending"),
    menu: panel.querySelector("#botaai-menu"),
    dropdown: panel.querySelector("#botaai-dropdown"),
    modal: panel.querySelector("#botaai-modal"),
    ticketTitle: panel.querySelector("#botaai-ticket-title"),
    ticketDesc: panel.querySelector("#botaai-ticket-desc"),
    ticketPriority: panel.querySelector("#botaai-ticket-priority"),
    ticketCategory: panel.querySelector("#botaai-ticket-category"),
    modalSubmit: panel.querySelector("#botaai-modal-submit"),
    ticketAttach: panel.querySelector("#botaai-ticket-attach"),
    ticketFile: panel.querySelector("#botaai-ticket-file"),
    ticketPending: panel.querySelector("#botaai-ticket-pending"),
  };

  const QUICK = ["Ask Question", "Report Bug", "Request Feature", "Billing", "Talk to Human"];

  function theme() {
    return bot?.theme_color || tenant?.branding?.primary_color || themeDefault;
  }

  function applyTheme() {
    const t = theme();
    bubble.style.background = t;
    els.header.style.background = t;
    els.send.style.background = t;
  }

  function shouldShowQuick() {
    return !escalated && !messages.some((m) => m.sender === "agent");
  }

  function attachmentHtml(items) {
    if (!items || !items.length) return "";
    return items
      .map((a) => {
        if (a.kind === "image") {
          return `<a class="botaai-att" href="${escapeHtml(a.url)}" target="_blank" rel="noopener"><img src="${escapeHtml(a.url)}" alt="${escapeHtml(a.name)}" /></a>`;
        }
        return `<a class="botaai-att" href="${escapeHtml(a.url)}" target="_blank" rel="noopener">📎 ${escapeHtml(a.name)}</a>`;
      })
      .join("");
  }

  function renderPending() {
    els.pending.innerHTML = "";
    pendingAttachments.forEach((a, i) => {
      const span = document.createElement("span");
      span.className = "botaai-att";
      span.innerHTML = `📎 ${escapeHtml(a.name)} <button type="button" style="border:none;background:none;cursor:pointer">×</button>`;
      span.querySelector("button").onclick = () => {
        pendingAttachments = pendingAttachments.filter((_, j) => j !== i);
        renderPending();
      };
      els.pending.appendChild(span);
    });
  }

  async function uploadWidgetFile(file) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("client_id", CLIENT_ID);
    fd.append("session_id", session);
    const res = await fetch(API + "/uploads", { method: "POST", body: fd });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Upload failed");
    }
    return res.json();
  }

  function render() {
    els.msgs.innerHTML = "";
    messages.forEach((m) => {
      const d = document.createElement("div");
      if (m.sender === "system") {
        d.className = "botaai-msg-sys";
        d.textContent = m.text;
      } else if (m.sender === "user") {
        d.className = "botaai-msg-user";
        d.style.background = theme();
        d.innerHTML = `${escapeHtml(m.text)}${attachmentHtml(m.meta?.attachments)}`;
      } else if (m.sender === "agent") {
        d.className = "botaai-msg-bot";
        d.innerHTML = `<div class="who">${escapeHtml(m.sender_name || "Agent")}</div>${escapeHtml(m.text)}${attachmentHtml(m.meta?.attachments)}`;
      } else {
        d.className = "botaai-msg-bot";
        d.innerHTML = `<div class="who">${escapeHtml(m.sender_name || "Bot")}</div>${escapeHtml(m.text)}${attachmentHtml(m.meta?.attachments)}`;
      }
      els.msgs.appendChild(d);
    });
    els.msgs.scrollTop = els.msgs.scrollHeight;

    els.quick.innerHTML = "";
    if (shouldShowQuick()) {
      QUICK.forEach((q) => {
        const b = document.createElement("button");
        b.textContent = q;
        b.onclick = () => (q === "Talk to Human" ? escalate() : send(q));
        els.quick.appendChild(b);
      });
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function renderTicketPending() {
    els.ticketPending.innerHTML = "";
    ticketAttachments.forEach((a, i) => {
      const span = document.createElement("span");
      span.className = "botaai-att";
      span.innerHTML = `📎 ${escapeHtml(a.name)} <button type="button" style="border:none;background:none;cursor:pointer">×</button>`;
      span.querySelector("button").onclick = () => {
        ticketAttachments = ticketAttachments.filter((_, j) => j !== i);
        renderTicketPending();
      };
      els.ticketPending.appendChild(span);
    });
  }

  async function restartSession() {
    if (session) {
      try {
        await fetch(API + "/widget/close", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: session }),
        });
      } catch {
        /* ignore */
      }
    }
    disconnectChatWs();
    session = null;
    messages = [];
    escalated = false;
    pendingAttachments = [];
    ticketAttachments = [];
    pendingText = null;
    renderPending();
    els.input.placeholder = "Ask anything…";
    els.botName.textContent = (bot?.name || "AI assistant") + " · online";
    els.dropdown.classList.remove("open");
    els.modal.classList.remove("open");
    try {
      await initSession(true);
    } catch {
      messages = [{ id: "err", sender: "bot", text: "Could not start a new conversation.", sender_name: "System" }];
      render();
    }
  }

  function openTicketModal() {
    els.dropdown.classList.remove("open");
    ticketAttachments = [];
    renderTicketPending();
    const lastUser = [...messages].reverse().find((m) => m.sender === "user");
    els.ticketTitle.value = lastUser?.text?.slice(0, 80) || "";
    els.ticketDesc.value = messages
      .filter((m) => m.sender === "user")
      .slice(-3)
      .map((m) => m.text)
      .join("\n\n");
    els.modal.classList.add("open");
    els.modalSubmit.style.background = theme();
  }

  async function submitTicket() {
    const title = els.ticketTitle.value.trim();
    const description = els.ticketDesc.value.trim();
    if (!session || !title || !description) return;
    els.modalSubmit.disabled = true;
    try {
      const res = await fetch(API + "/widget/ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: session,
          title,
          description,
          priority: els.ticketPriority.value,
          category: els.ticketCategory.value,
          attachments: ticketAttachments,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Could not create ticket");
      }
      const ticket = await res.json();
      els.modal.classList.remove("open");
      ticketAttachments = [];
      renderTicketPending();
      messages.push({
        id: "t" + Date.now(),
        sender: "system",
        text: `✓ Ticket ${ticket.code} created · ${ticket.priority} · ${ticket.category}`,
      });
      render();
    } catch (err) {
      messages.push({ id: "te" + Date.now(), sender: "system", text: err.message || "Could not create ticket" });
      render();
    } finally {
      els.modalSubmit.disabled = false;
    }
  }

  async function initSession(forceNew = false) {
    const visitor = window.BOTAAI_VISITOR || {};
    const res = await fetch(API + "/widget/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        visitor_name: visitor.name || "Guest",
        visitor_email: visitor.email || null,
        force_new: forceNew,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(errText || `init failed (${res.status})`);
    }
    const data = await res.json();
    session = data.session_id;
    bot = data.bot;
    tenant = data.tenant;
    els.tenantName.textContent = tenant?.name || "BotAAI";
    escalated = false;
    els.botName.textContent = (bot?.name || "AI assistant") + " · online";
    els.input.placeholder = "Ask anything…";
    if (!forceNew && data.resumed) {
      const hist = await fetch(API + "/widget/messages/" + session);
      if (hist.ok) {
        const remote = await hist.json();
        messages = remote.length ? remote : messages;
      }
      if (data.status === "queue" || data.status === "live") escalated = true;
      if (messages.some((m) => m.sender === "agent")) escalated = true;
    } else {
      messages = [{ id: "g", sender: "bot", text: data.greeting, sender_name: bot?.name || "Bot" }];
    }
    if (escalated) {
      els.botName.textContent = data.status === "live" ? "Live agent · online" : "Waiting for agent…";
      els.input.placeholder = "Message the agent…";
    }
    applyTheme();
    render();
    connectChatWs();
  }

  async function send(text) {
    const msg = (text || "").trim();
    const attachments = pendingAttachments.slice();
    if (!session || (!msg && !attachments.length) || sending) return;
    pendingText = msg || null;
    messages.push({
      id: "__pending__",
      sender: "user",
      text: msg || "(attachment)",
      meta: attachments.length ? { attachments } : null,
    });
    render();
    els.input.value = "";
    pendingAttachments = [];
    renderPending();
    sending = true;
    els.send.disabled = true;
    try {
      const res = await fetch(API + "/widget/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: session, text: msg, attachments }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "Send failed");
        throw new Error(errText);
      }
      const data = await res.json();
      pendingText = null;
      if (data.user_message) {
        messages = messages.filter((m) => m.id !== "__pending__");
        if (!messages.find((m) => m.id === data.user_message.id)) {
          messages.push(data.user_message);
        }
      }
      if (data.bot_message) {
        if (!messages.find((m) => m.id === data.bot_message.id)) {
          messages.push(data.bot_message);
        }
      }
      if (data.ticket) {
        messages.push({
          id: "t" + Date.now(),
          sender: "system",
          text: `✓ Ticket ${data.ticket.code} created · ${data.ticket.priority} · ${data.ticket.category}`,
        });
      }
    } catch {
      pendingText = null;
      messages = messages.filter((m) => m.id !== "__pending__");
      messages.push({ id: "e", sender: "bot", text: "Could not send. Try again.", sender_name: "System" });
      render();
    } finally {
      sending = false;
      els.send.disabled = false;
      els.input.focus();
      render();
    }
  }

  async function escalate() {
    if (!session) return;
    await fetch(API + "/widget/escalate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: session }),
    });
    escalated = true;
    els.botName.textContent = "Waiting for agent…";
    els.input.placeholder = "Message the agent…";
    messages.push({ id: "esc", sender: "system", text: "Escalated to human. An agent will join shortly.", created_at: new Date().toISOString() });
    render();
  }

  bubble.onclick = async () => {
    open = !open;
    panel.classList.toggle("open", open);
    bubble.style.display = open ? "none" : "flex";
    if (open && !session) {
      try {
        await initSession();
      } catch {
        messages = [{ id: "err", sender: "bot", text: "Invalid client ID or API unreachable.", sender_name: "System" }];
        render();
      }
    } else if (open && session) {
      wsStopped = false;
      connectChatWs();
    }
  };

  panel.querySelector("#botaai-close").onclick = () => {
    open = false;
    panel.classList.remove("open");
    bubble.style.display = "flex";
    disconnectChatWs();
    els.dropdown.classList.remove("open");
    els.modal.classList.remove("open");
  };

  els.menu.onclick = (e) => {
    e.stopPropagation();
    els.dropdown.classList.toggle("open");
  };
  panel.querySelector("#botaai-new-chat").onclick = () => restartSession();
  panel.querySelector("#botaai-create-ticket").onclick = () => openTicketModal();
  panel.querySelector("#botaai-modal-cancel").onclick = () => {
    els.modal.classList.remove("open");
    ticketAttachments = [];
    renderTicketPending();
  };
  els.modalSubmit.onclick = () => submitTicket();
  els.ticketAttach.onclick = () => els.ticketFile.click();
  els.ticketFile.onchange = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!session || !files.length) return;
    els.ticketAttach.disabled = true;
    try {
      for (const file of files) {
        ticketAttachments.push(await uploadWidgetFile(file));
      }
      renderTicketPending();
    } catch (err) {
      messages.push({ id: "tu" + Date.now(), sender: "system", text: err.message || "Upload failed" });
      render();
    } finally {
      els.ticketAttach.disabled = false;
    }
  };
  document.addEventListener("click", () => els.dropdown.classList.remove("open"));

  panel.querySelector("#botaai-form").onsubmit = (e) => {
    e.preventDefault();
    send(els.input.value);
  };

  els.attach.onclick = () => els.file.click();
  els.file.onchange = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!session || !files.length) return;
    els.attach.disabled = true;
    try {
      for (const file of files) {
        pendingAttachments.push(await uploadWidgetFile(file));
      }
      renderPending();
    } catch (err) {
      messages.push({ id: "up" + Date.now(), sender: "system", text: err.message || "Upload failed" });
      render();
    } finally {
      els.attach.disabled = false;
    }
  };

  applyTheme();
  window.BotAAI = { open: () => bubble.click(), send, getSession: () => session, restart: restartSession };
})();
