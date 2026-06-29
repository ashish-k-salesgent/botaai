# BotAAI Product Requirements Document

## Original Problem Statement
Build BotAAI — a multi-tenant AI Customer Support & Ticket Management SaaS platform (Intercom + Zendesk + Jira Service Desk + Slack Chat + AI RAG agent combined, white-labeled per tenant). Embeddable widget script, super-admin tenant management, 14-day trial, RAG knowledge base, Kanban ticket board, live chat with AI escalation.

## User Choices
- Stack: **FastAPI + React + MongoDB** (Java not supported in environment)
- LLM: **Gemini 3 Flash** via Emergent Universal Key
- Vector DB: **MongoDB-stored bag-of-words cosine similarity** (MVP)
- Scope: **All 5 phases**
- Auth: **JWT custom email/password**

## Architecture
- Backend (FastAPI): `server.py` (routes), `auth.py` (JWT + bcrypt), `models.py` (Pydantic), `rag.py` (chunking + cosine search + Gemini chat/classify)
- MongoDB collections: users, tenants, bots, kb_docs, kb_chunks, tickets, chat_sessions, chat_messages, notifications, counters
- Frontend (React 19 + Tailwind + Shadcn): App.js routes, AppShell sidebar layout, pages per feature, ChatWidget for embed
- Multi-tenant isolation enforced via `tenant_id` filter in every authenticated route

## Personas
1. **Super Admin** — manages tenants, plans, status, sees platform totals.
2. **Tenant Admin** — manages bot, KB, team, branding, sees own analytics & widget creds.
3. **Support / Developer / QA / Viewer** — RBAC roles on tickets and chats.
4. **End-user / Visitor** — interacts only with the embedded widget.

## Core Requirements (static)
- Multi-tenant SaaS with isolation
- AI agent with RAG, confidence-aware fallback
- 9-column Kanban ticket board
- Live chat (agent-side console + visitor widget)
- Auto-classify (category, priority, sentiment, urgency, ticket-worthy)
- Auto-create tickets from chat
- 14-day trial → plan upgrade flow
- Embeddable widget via client_id
- Super-admin panel with tenant CRUD
- Analytics summary (charts)

## Implemented (2026-02 / 1st cut)
- ✅ JWT auth (signup, login, /auth/me, super admin seeded)
- ✅ Tenant provisioning + default bot auto-create
- ✅ Bots CRUD
- ✅ Knowledge base (chunk + BoW embeddings + cosine search + retrieval test UI)
- ✅ Tickets CRUD with auto code (BOTAAI-101+), comments, activity log
- ✅ Kanban board (9 columns) with HTML5 drag-and-drop
- ✅ Live chat agent console (claim, close, send) with 4-sec polling
- ✅ Public widget endpoints (init, message, escalate, messages list)
- ✅ Gemini 3 Flash chat + classification
- ✅ Auto-ticket creation from bug-like widget messages
- ✅ Users / team management with RBAC roles
- ✅ Notifications bell with polling + read-all
- ✅ Analytics summary + Recharts (status / category / priority)
- ✅ Super Admin panel (tenants list, status/plan update, delete cascade, platform stats)
- ✅ Settings page (branding, widget credentials, embed snippet copy)
- ✅ Widget Demo page + floating ChatWidget component
- ✅ Landing page (Swiss design — Cabinet Grotesk + IBM Plex Sans, 1px borders, #002FA7)

## Testing Status
- Backend: 17/17 pytest tests passed (100%) — /app/backend/tests/backend_test.py
- Frontend: smoke-tested flows passed 100%

## Backlog / Future
- P1: Refresh-token rotation, file uploads to KB (PDF/DOCX parsing), real vector embeddings via Gemini text-embedding-004
- P1: WebSocket live chat (currently 4-sec polling)
- P1: HMAC-signed widget session_id (currently anyone with session_id can post)
- P2: Email notifications (Resend/Sendgrid), Stripe billing, SLA timers
- P2: Server-side router refactor (split server.py into per-resource routers)
- P3: SSO, audit logs UI, webhooks, multi-language

## Test Credentials
See `/app/memory/test_credentials.md`
