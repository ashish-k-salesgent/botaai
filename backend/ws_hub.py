"""WebSocket connection hub for live chat."""
import asyncio
from typing import Any, Dict, List, Optional, Set

from fastapi import WebSocket


class ChatHub:
    def __init__(self) -> None:
        self._sessions: Dict[str, Set[WebSocket]] = {}
        self._agents: Dict[str, Set[WebSocket]] = {}
        self._presence: Dict[str, Dict[str, Dict[str, Any]]] = {}
        self._ws_meta: Dict[WebSocket, Dict[str, str]] = {}
        self._lock = asyncio.Lock()

    async def register_chat(self, ws: WebSocket, session_id: str) -> None:
        async with self._lock:
            self._sessions.setdefault(session_id, set()).add(ws)

    async def register_agent_chat(
        self,
        ws: WebSocket,
        session_id: str,
        tenant_id: str,
        user_id: str,
        user_name: str,
    ) -> None:
        async with self._lock:
            self._sessions.setdefault(session_id, set()).add(ws)
            self._ws_meta[ws] = {
                "session_id": session_id,
                "tenant_id": tenant_id,
                "user_id": user_id,
                "user_name": user_name,
            }
            self._presence.setdefault(session_id, {})[user_id] = {
                "user_id": user_id,
                "name": user_name,
                "state": "viewing",
            }
        await self._broadcast_presence(session_id, tenant_id)

    async def set_presence_state(
        self, ws: WebSocket, state: str, tenant_id: Optional[str] = None
    ) -> None:
        async with self._lock:
            meta = self._ws_meta.get(ws)
            if not meta:
                return
            sid = meta["session_id"]
            uid = meta["user_id"]
            room = self._presence.get(sid)
            if room and uid in room:
                room[uid]["state"] = state
            tid = tenant_id or meta["tenant_id"]
        await self._broadcast_presence(sid, tid)

    async def disconnect_chat(self, ws: WebSocket, session_id: str) -> None:
        tenant_id = None
        async with self._lock:
            room = self._sessions.get(session_id)
            if room:
                room.discard(ws)
                if not room:
                    del self._sessions[session_id]
            meta = self._ws_meta.pop(ws, None)
            if meta:
                tenant_id = meta["tenant_id"]
                sid = meta["session_id"]
                uid = meta["user_id"]
                pres = self._presence.get(sid)
                if pres:
                    pres.pop(uid, None)
                    if not pres:
                        del self._presence[sid]
        if tenant_id and meta:
            await self._broadcast_presence(meta["session_id"], tenant_id)

    async def register_agent(self, ws: WebSocket, tenant_id: str) -> None:
        async with self._lock:
            self._agents.setdefault(tenant_id, set()).add(ws)

    async def disconnect_agent(self, ws: WebSocket, tenant_id: str) -> None:
        async with self._lock:
            room = self._agents.get(tenant_id)
            if not room:
                return
            room.discard(ws)
            if not room:
                del self._agents[tenant_id]

    def presence_for_session(self, session_id: str) -> List[Dict[str, Any]]:
        return list(self._presence.get(session_id, {}).values())

    async def _send(self, ws: WebSocket, payload: dict) -> None:
        try:
            await ws.send_json(payload)
        except Exception:
            pass

    async def _broadcast_presence(self, session_id: str, tenant_id: str) -> None:
        agents = self.presence_for_session(session_id)
        payload = {
            "type": "presence",
            "data": {"session_id": session_id, "agents": agents},
        }
        await self.broadcast_chat(session_id, payload)
        await self.broadcast_tenant(tenant_id, payload)

    async def broadcast_chat(self, session_id: str, payload: dict) -> None:
        async with self._lock:
            targets = list(self._sessions.get(session_id, set()))
        for ws in targets:
            await self._send(ws, payload)

    async def broadcast_tenant(self, tenant_id: str, payload: dict) -> None:
        async with self._lock:
            targets = list(self._agents.get(tenant_id, set()))
        for ws in targets:
            await self._send(ws, payload)


hub = ChatHub()
