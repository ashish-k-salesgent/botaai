"""BotAAI Backend regression suite."""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://helpdesk-ai-35.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

TS = str(int(time.time()))
TENANT_A_EMAIL = f"demo_a_{TS}@example.com"
TENANT_B_EMAIL = f"demo_b_{TS}@example.com"
PASSWORD = "Demo@1234"


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _signup_or_login(session, email, company):
    r = session.post(f"{API}/auth/signup", json={
        "email": email, "password": PASSWORD,
        "name": "Demo Admin", "company_name": company,
    })
    if r.status_code == 200:
        d = r.json()
        assert d["tenant"]["client_id"].startswith("botaai_")
        assert d["tenant"]["status"] == "trial"
        return d
    # Existing - fallback login
    r2 = session.post(f"{API}/auth/login", json={"email": email, "password": PASSWORD})
    assert r2.status_code == 200, r2.text
    return r2.json()


@pytest.fixture(scope="session")
def tenant_a(session):
    return _signup_or_login(session, TENANT_A_EMAIL, f"Acme A {TS}")


@pytest.fixture(scope="session")
def tenant_b(session):
    return _signup_or_login(session, TENANT_B_EMAIL, f"Acme B {TS}")


def H(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ============== AUTH ==============
class TestAuth:
    def test_super_admin_login(self, session):
        r = session.post(f"{API}/auth/login", json={"email": "super@botaai.io", "password": "SuperAdmin@123"})
        assert r.status_code == 200
        d = r.json()
        assert d["user"]["role"] == "super_admin"
        assert d["user"]["tenant_id"] is None

    def test_signup_duplicate(self, session, tenant_a):
        r = session.post(f"{API}/auth/signup", json={
            "email": TENANT_A_EMAIL, "password": PASSWORD, "name": "x", "company_name": "x",
        })
        assert r.status_code == 400

    def test_invalid_login(self, session):
        r = session.post(f"{API}/auth/login", json={"email": "noone@x.com", "password": "bad"})
        assert r.status_code == 401

    def test_me_endpoint(self, session, tenant_a):
        r = session.get(f"{API}/auth/me", headers=H(tenant_a["token"]))
        assert r.status_code == 200
        d = r.json()
        assert d["user"]["email"] == TENANT_A_EMAIL
        assert d["tenant"]["id"] == tenant_a["tenant"]["id"]


# ============== BOTS ==============
class TestBots:
    def test_default_bot_listed(self, session, tenant_a):
        r = session.get(f"{API}/bots", headers=H(tenant_a["token"]))
        assert r.status_code == 200
        bots = r.json()
        assert len(bots) >= 1
        assert bots[0]["tenant_id"] == tenant_a["tenant"]["id"]

    def test_create_update_delete_bot(self, session, tenant_a):
        h = H(tenant_a["token"])
        r = session.post(f"{API}/bots", headers=h, json={
            "name": "Test Bot", "greeting": "hi", "system_prompt": "be helpful",
        })
        assert r.status_code == 200
        bid = r.json()["id"]
        r = session.patch(f"{API}/bots/{bid}", headers=h, json={
            "name": "Updated", "greeting": "hi2", "system_prompt": "p", "temperature": 0.5,
        })
        assert r.status_code == 200
        assert r.json()["name"] == "Updated"
        r = session.delete(f"{API}/bots/{bid}", headers=h)
        assert r.status_code == 200


# ============== KNOWLEDGE BASE ==============
class TestKnowledge:
    def test_kb_create_search(self, session, tenant_a):
        h = H(tenant_a["token"])
        r = session.post(f"{API}/knowledge", headers=h, json={
            "title": "Refund Policy",
            "content": "Our refund policy allows customers to request a refund within 30 days. To request a refund, contact support with your order number. Refunds are processed within 5-7 business days.",
        })
        assert r.status_code == 200
        assert r.json()["chunk_count"] >= 1
        r = session.get(f"{API}/knowledge", headers=h)
        assert r.status_code == 200 and len(r.json()) >= 1
        r = session.post(f"{API}/knowledge/search", headers=h, json={"query": "refund", "top_k": 3})
        assert r.status_code == 200
        results = r.json()
        assert len(results) >= 1
        assert results[0]["score"] > 0


# ============== TICKETS ==============
class TestTickets:
    def test_ticket_crud_and_code(self, session, tenant_a):
        h = H(tenant_a["token"])
        r = session.post(f"{API}/tickets", headers=h, json={
            "title": "Login broken", "description": "cannot login", "priority": "high", "category": "Bug",
        })
        assert r.status_code == 200
        t = r.json()
        assert t["code"].startswith("BOTAAI-")
        assert t["status"] == "new"
        tid = t["id"]

        # GET
        r = session.get(f"{API}/tickets/{tid}", headers=h)
        assert r.status_code == 200

        # PATCH assignee - use self
        me = session.get(f"{API}/auth/me", headers=h).json()
        r = session.patch(f"{API}/tickets/{tid}", headers=h, json={
            "status": "in_progress", "priority": "critical", "assignee_id": me["user"]["id"],
        })
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "in_progress"
        assert d["assignee_name"] == me["user"]["name"]

        # Comment
        r = session.post(f"{API}/tickets/{tid}/comments", headers=h, json={"body": "investigating"})
        assert r.status_code == 200
        assert r.json()["body"] == "investigating"

        # List
        r = session.get(f"{API}/tickets", headers=h)
        assert r.status_code == 200 and len(r.json()) >= 1

        # Delete
        r = session.delete(f"{API}/tickets/{tid}", headers=h)
        assert r.status_code == 200


# ============== USERS ==============
class TestUsers:
    def test_user_crud_and_self_delete_block(self, session, tenant_a):
        h = H(tenant_a["token"])
        me = session.get(f"{API}/auth/me", headers=h).json()
        ts = str(int(time.time() * 1000))
        r = session.post(f"{API}/users", headers=h, json={
            "email": f"member_{ts}@ex.com", "password": "pw1234567",
            "name": "Member", "role": "support",
        })
        assert r.status_code == 200
        uid = r.json()["id"]
        r = session.patch(f"{API}/users/{uid}", headers=h, json={"role": "developer"})
        assert r.status_code == 200 and r.json()["role"] == "developer"
        # Block self-delete
        r = session.delete(f"{API}/users/{me['user']['id']}", headers=h)
        assert r.status_code == 400
        r = session.delete(f"{API}/users/{uid}", headers=h)
        assert r.status_code == 200


# ============== WIDGET ==============
class TestWidget:
    def test_widget_init_invalid(self, session):
        r = session.post(f"{API}/widget/init", json={"client_id": "bogus"})
        assert r.status_code == 404

    def test_widget_full_flow(self, session, tenant_a):
        client_id = tenant_a["tenant"]["client_id"]
        # Add KB so RAG works
        h = H(tenant_a["token"])
        session.post(f"{API}/knowledge", headers=h, json={
            "title": "Login Help",
            "content": "If you cannot login, reset your password from the login page. Use email and the strong password. Contact support at support@acme.com.",
        })
        r = session.post(f"{API}/widget/init", json={"client_id": client_id, "visitor_name": "Bob"})
        assert r.status_code == 200
        sid = r.json()["session_id"]
        assert r.json()["bot"] is not None

        # Message - this calls Gemini, expect 200 and bot_message
        r = session.post(f"{API}/widget/message", json={"session_id": sid, "text": "My app keeps crashing whenever I click login, this is a critical bug"}, timeout=60)
        if r.status_code == 500 and "Budget" in r.text:
            pytest.skip("Emergent LLM budget exceeded - cannot test Gemini-backed widget message")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["user_message"]["text"].startswith("My app")
        assert d["bot_message"] is not None
        # is_ticket_worthy classification may or may not produce ticket; just check key present

        # Messages list
        r = session.get(f"{API}/widget/messages/{sid}")
        assert r.status_code == 200
        assert len(r.json()) >= 2

        # Escalate
        r = session.post(f"{API}/widget/escalate", json={"session_id": sid})
        assert r.status_code == 200
        assert r.json()["status"] == "queue"


# ============== CHATS (Agent) ==============
class TestAgentChats:
    def test_list_chats(self, session, tenant_a):
        h = H(tenant_a["token"])
        r = session.get(f"{API}/chats", headers=h)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ============== NOTIFICATIONS ==============
class TestNotifications:
    def test_notifications(self, session, tenant_a):
        h = H(tenant_a["token"])
        r = session.get(f"{API}/notifications", headers=h)
        assert r.status_code == 200
        r = session.post(f"{API}/notifications/read-all", headers=h)
        assert r.status_code == 200 and r.json()["ok"] is True


# ============== ANALYTICS ==============
class TestAnalytics:
    def test_summary(self, session, tenant_a):
        h = H(tenant_a["token"])
        r = session.get(f"{API}/analytics/summary", headers=h)
        assert r.status_code == 200
        d = r.json()
        for key in ("tickets", "chats", "knowledge", "users", "by_status", "by_category", "by_priority", "ai_resolution_rate"):
            assert key in d
        assert "total" in d["tickets"] and "open" in d["tickets"] and "closed" in d["tickets"]


# ============== SUPER ADMIN ==============
class TestSuperAdmin:
    def test_admin_endpoints(self, session, tenant_a):
        login = session.post(f"{API}/auth/login", json={"email": "super@botaai.io", "password": "SuperAdmin@123"}).json()
        h = H(login["token"])
        r = session.get(f"{API}/admin/tenants", headers=h)
        assert r.status_code == 200
        tenants = r.json()
        assert any(t["id"] == tenant_a["tenant"]["id"] for t in tenants)
        for t in tenants:
            if t["id"] == tenant_a["tenant"]["id"]:
                assert "user_count" in t and "ticket_count" in t and "chat_count" in t

        # PATCH
        r = session.patch(f"{API}/admin/tenants/{tenant_a['tenant']['id']}", headers=h, json={"plan": "monthly"})
        assert r.status_code == 200 and r.json()["plan"] == "monthly"

        # Stats
        r = session.get(f"{API}/admin/stats", headers=h)
        assert r.status_code == 200
        for k in ("tenants", "users", "tickets", "chats", "kb_docs"):
            assert k in r.json()

    def test_non_super_blocked(self, session, tenant_a):
        h = H(tenant_a["token"])
        r = session.get(f"{API}/admin/tenants", headers=h)
        assert r.status_code == 403


# ============== TENANT ISOLATION ==============
class TestIsolation:
    def test_tenant_a_cannot_see_b(self, session, tenant_a, tenant_b):
        ha = H(tenant_a["token"])
        hb = H(tenant_b["token"])
        # Create ticket in B
        rb = session.post(f"{API}/tickets", headers=hb, json={
            "title": "B-only ticket", "description": "secret",
        })
        assert rb.status_code == 200
        b_tid = rb.json()["id"]
        # A lists tickets - should not contain B's
        ra = session.get(f"{API}/tickets", headers=ha).json()
        assert all(t["id"] != b_tid for t in ra)
        # A tries direct GET on B's ticket
        r = session.get(f"{API}/tickets/{b_tid}", headers=ha)
        assert r.status_code == 404
        # A bots != B bots
        a_bots = session.get(f"{API}/bots", headers=ha).json()
        b_bots = session.get(f"{API}/bots", headers=hb).json()
        a_ids = {b["id"] for b in a_bots}
        b_ids = {b["id"] for b in b_bots}
        assert a_ids.isdisjoint(b_ids)
