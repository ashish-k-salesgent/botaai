"""Lightweight RAG: text chunking + keyword-based vector similarity + Gemini LLM."""
import os
import re
import math
import hashlib
from pathlib import Path
from collections import Counter
from typing import List, Dict, Any
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage

load_dotenv(Path(__file__).parent / ".env")
EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
DEFAULT_MODEL = "gemini-3-flash-preview"
DEFAULT_PROVIDER = "gemini"


STOPWORDS = set(
    """a an the and or but if then else of for to in on at by with from as is are was were be been being do does did have has had not no this that these those it its i you he she we they them us our your his her my me him will would can could should may might shall there here what when where why how which who whom whose
    """.split()
)


def tokenize(text: str) -> List[str]:
    text = text.lower()
    tokens = re.findall(r"[a-z0-9]+", text)
    return [t for t in tokens if t not in STOPWORDS and len(t) > 1]


def chunk_text(text: str, max_words: int = 120) -> List[str]:
    """Split text into ~120-word chunks at sentence boundaries."""
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


def embed(text: str) -> Dict[str, int]:
    """Bag-of-words 'embedding' for cosine similarity. Keeps things simple + deterministic for MVP."""
    return dict(Counter(tokenize(text)))


def cosine(a: Dict[str, int], b: Dict[str, int]) -> float:
    if not a or not b:
        return 0.0
    common = set(a) & set(b)
    dot = sum(a[t] * b[t] for t in common)
    na = math.sqrt(sum(v * v for v in a.values()))
    nb = math.sqrt(sum(v * v for v in b.values()))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def search_chunks(
    query: str, chunks: List[Dict[str, Any]], top_k: int = 4
) -> List[Dict[str, Any]]:
    q_emb = embed(query)
    scored = []
    for c in chunks:
        s = cosine(q_emb, c.get("embedding", {}))
        if s > 0:
            scored.append((s, c))
    scored.sort(key=lambda x: -x[0])
    return [{"score": s, **c} for s, c in scored[:top_k]]


async def llm_chat(
    system_prompt: str, user_text: str, session_id: str, model: str = DEFAULT_MODEL
) -> str:
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=system_prompt,
    ).with_model(DEFAULT_PROVIDER, model)
    resp = await chat.send_message(UserMessage(text=user_text))
    if isinstance(resp, str):
        return resp
    return str(resp)


async def answer_with_rag(
    question: str,
    chunks: List[Dict[str, Any]],
    bot: Dict[str, Any],
    session_id: str,
) -> Dict[str, Any]:
    top = search_chunks(question, chunks, top_k=4)
    context_parts = [f"[Doc: {c.get('title','?')}] {c['text']}" for c in top]
    context = "\n\n".join(context_parts) if context_parts else "(no documents indexed yet)"
    confidence = top[0]["score"] if top else 0.0

    sys = (
        f"{bot.get('system_prompt','You are a helpful support agent.')}\n\n"
        "You answer strictly from the provided CONTEXT. If the answer is not in context, "
        "say you don't know and offer to create a support ticket.\n\n"
        f"CONTEXT:\n{context}"
    )
    answer = await llm_chat(sys, question, session_id, bot.get("model", DEFAULT_MODEL))
    return {
        "answer": answer,
        "confidence": confidence,
        "sources": [{"title": c.get("title"), "score": c["score"]} for c in top],
    }


async def classify_message(text: str, session_id: str) -> Dict[str, Any]:
    """Use Gemini to classify category, priority, sentiment, urgency."""
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
    raw = await llm_chat(sys, text, session_id, DEFAULT_MODEL)
    import json
    try:
        # Strip markdown fences if present
        cleaned = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.MULTILINE).strip()
        return json.loads(cleaned)
    except Exception:
        return {
            "category": "Question",
            "priority": "medium",
            "sentiment": "neutral",
            "urgency_score": 50,
            "is_ticket_worthy": False,
        }
