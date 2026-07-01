import { getToken } from "./api";

export function httpToWs(httpUrl) {
  return httpUrl.replace(/^http/, "ws");
}

export function wsUrl(path, params = {}) {
  const base = httpToWs(process.env.REACT_APP_BACKEND_URL || "http://localhost:8085");
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v != null && v !== "")
  );
  const qs = new URLSearchParams(clean).toString();
  return `${base}/api${path}${qs ? `?${qs}` : ""}`;
}

export function connectWs(url, { onMessage, onOpen, onClose } = {}) {
  let ws = null;
  let pingTimer = null;
  let reconnectTimer = null;
  let closed = false;
  let backoff = 1000;

  const clearTimers = () => {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const scheduleReconnect = () => {
    if (closed || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, backoff);
    backoff = Math.min(backoff * 2, 30000);
  };

  const connect = () => {
    if (closed) return;
    clearTimers();
    ws = new WebSocket(url);
    ws.onopen = () => {
      backoff = 1000;
      pingTimer = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 25000);
      onOpen?.();
    };
    ws.onclose = (ev) => {
      clearTimers();
      onClose?.(ev);
      if (!closed && ev.code !== 1000) scheduleReconnect();
    };
    ws.onerror = () => {};
    ws.onmessage = (e) => {
      try {
        onMessage?.(JSON.parse(e.data));
      } catch {
        /* ignore */
      }
    };
  };

  connect();

  return {
    close: () => {
      closed = true;
      clearTimers();
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close(1000, "client close");
      } else {
        ws = null;
      }
    },
    send: (payload) => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
      }
    },
  };
}

export function connectAgentWs(onMessage) {
  const token = getToken();
  if (!token) return { close: () => {} };
  return connectWs(wsUrl("/ws/agent", { token }), { onMessage });
}

export function connectChatWs(sessionId, { token, clientId, onMessage } = {}) {
  const authToken = token || getToken();
  const params = authToken ? { token: authToken } : { client_id: clientId };
  if (!params.token && !params.client_id) return { close: () => {} };
  return connectWs(wsUrl(`/ws/chat/${sessionId}`, params), { onMessage });
}
