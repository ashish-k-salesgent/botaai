"""RAG: text chunking + Gemini embeddings + pgvector similarity + Gemini LLM."""
import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List

import httpx
from dotenv import load_dotenv
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import EMBEDDING_DIM, KBChunk

load_dotenv(Path(__file__).parent / ".env")
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
DEFAULT_MODEL = os.environ.get("LLM_MODEL", "gemini-2.0-flash")
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "text-embedding-004")
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"


def chunk_text(text: str, max_words: int = 120) -> List[str]:
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    chunks: List[str] = []
    current: List[str] = []
    count = 0
    for s in sentences:
        wc = len(s.split())
        if count + wc > max_words and current:
            chunks.append(" ".join(current))
            current = [s]
            count = wc
        else:
            current.append(s)
            count += wc
    if current:
        chunks.append(" ".join(current))
    return [c for c in chunks if c.strip()]


def _normalize(vec: List[float]) -> List[float]:
    norm = sum(v * v for v in vec) ** 0.5
    if norm == 0:
        return vec
    return [v / norm for v in vec]


def _hash_fallback_embedding(text: str) -> List[float]:
    import hashlib

    raw = hashlib.sha256(text.encode("utf-8")).digest()
    vec = [((raw[i % len(raw)] / 127.5) - 1.0) for i in range(EMBEDDING_DIM)]
    return _normalize(vec)


async def _gemini_embed(text: str, task_type: str) -> List[float]:
    if not EMERGENT_LLM_KEY:
        return _hash_fallback_embedding(text)
    url = f"{GEMINI_BASE}/models/{EMBEDDING_MODEL}:embedContent"
    payload = {
        "model": f"models/{EMBEDDING_MODEL}",
        "content": {"parts": [{"text": text[:8000]}]},
        "taskType": task_type,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, params={"key": EMERGENT_LLM_KEY}, json=payload)
        resp.raise_for_status()
        values = resp.json()["embedding"]["values"]
        return _normalize(values[:EMBEDDING_DIM])


async def embed_vector(text: str) -> List[float]:
    try:
        return await _gemini_embed(text, "RETRIEVAL_DOCUMENT")
    except Exception:
        return _hash_fallback_embedding(text)


async def embed_query(text: str) -> List[float]:
    try:
        return await _gemini_embed(text, "RETRIEVAL_QUERY")
    except Exception:
        return _hash_fallback_embedding(text)


async def search_chunks_pg(
    session: AsyncSession,
    tenant_id: str,
    query: str,
    top_k: int = 4,
) -> List[Dict[str, Any]]:
    q_vec = await embed_query(query)
    distance = KBChunk.embedding.cosine_distance(q_vec)
    stmt = (
        select(KBChunk, (1 - distance).label("score"))
        .where(KBChunk.tenant_id == tenant_id)
        .order_by(distance)
        .limit(top_k)
    )
    rows = (await session.execute(stmt)).all()
    results = []
    for chunk, score in rows:
        s = float(score) if score is not None else 0.0
        if s <= 0:
            continue
        results.append(
            {
                "id": chunk.id,
                "doc_id": chunk.doc_id,
                "tenant_id": chunk.tenant_id,
                "bot_id": chunk.bot_id,
                "index": chunk.index,
                "text": chunk.text,
                "title": chunk.title,
                "created_at": chunk.created_at,
                "score": round(s, 6),
            }
        )
    return results


async def llm_chat(
    system_prompt: str, user_text: str, session_id: str, model: str = DEFAULT_MODEL
) -> str:
    # Prefer emergentintegrations when installed (Emergent platform)
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage

        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=session_id,
            system_message=system_prompt,
        ).with_model("gemini", model)
        resp = await chat.send_message(UserMessage(text=user_text))
        return resp if isinstance(resp, str) else str(resp)
    except ImportError:
        pass

    if not EMERGENT_LLM_KEY:
        return (
            "I don't have a detailed answer for that right now. "
            "Use Talk to Human or Create ticket from the menu for help."
        )

    url = f"{GEMINI_BASE}/models/{model}:generateContent"
    payload = {
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": user_text}]}],
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(url, params={"key": EMERGENT_LLM_KEY}, json=payload)
        resp.raise_for_status()
        data = resp.json()
        parts = data["candidates"][0]["content"]["parts"]
        return parts[0].get("text", "")


def _looks_like_classification(text: str) -> bool:
    t = text.strip()
    return t.startswith("{") and "is_ticket_worthy" in t


def _default_classification() -> Dict[str, Any]:
    return {
        "category": "Question",
        "priority": "medium",
        "sentiment": "neutral",
        "urgency_score": 50,
        "is_ticket_worthy": False,
    }


async def answer_with_rag(
    question: str,
    session: AsyncSession,
    tenant_id: str,
    bot: Dict[str, Any],
    session_id: str,
) -> Dict[str, Any]:
    top = await search_chunks_pg(session, tenant_id, question, top_k=4)
    context_parts = [f"[Doc: {c.get('title', '?')}] {c['text']}" for c in top]
    context = "\n\n".join(context_parts) if context_parts else "(no documents indexed yet)"
    confidence = top[0]["score"] if top else 0.0

    sys = (
        f"{bot.get('system_prompt', 'You are a helpful support agent.')}\n\n"
        "You answer strictly from the provided CONTEXT. If the answer is not in context, "
        "say you don't know and offer to create a support ticket.\n\n"
        f"CONTEXT:\n{context}"
    )
    answer = await llm_chat(sys, question, f"{session_id}:answer", bot.get("model", DEFAULT_MODEL))
    if _looks_like_classification(answer):
        answer = bot.get(
            "fallback_message",
            "I couldn't find that in our knowledge base. Would you like to talk to our team or create a ticket?",
        )
    return {
        "answer": answer,
        "confidence": confidence,
        "sources": [{"title": c.get("title"), "score": c["score"]} for c in top],
    }


async def classify_message(text: str, session_id: str) -> Dict[str, Any]:
    if not EMERGENT_LLM_KEY:
        return _default_classification()
    sys = (
        "You are a strict JSON classifier for customer-support messages. "
        "Return ONLY valid compact JSON with keys: "
        'category (one of: Question, Bug, Feature Request, Complaint, Billing, '
        "Integration, Performance, Login Issue, Payment, Technical Support), "
        "priority (low, medium, high, critical), "
        "sentiment (happy, neutral, angry), "
        "urgency_score (0-100 integer), "
        'is_ticket_worthy (true if user reports a bug/issue/complaint, else false). '
        "No prose, JSON only."
    )
    raw = await llm_chat(sys, text, f"{session_id}:classify", DEFAULT_MODEL)
    try:
        cleaned = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.MULTILINE).strip()
        return json.loads(cleaned)
    except Exception:
        return _default_classification()
