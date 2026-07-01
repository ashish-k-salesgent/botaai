import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import "@/index.css";
import "@/App.css";
import { AuthProvider, useAuth } from "@/lib/auth";
import { can, firstAppPath } from "@/lib/permissions";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import AppShell from "@/components/AppShell";
import Dashboard from "@/pages/Dashboard";
import Tickets from "@/pages/Tickets";
import TicketDetail from "@/pages/TicketDetail";
import Chats from "@/pages/Chats";
import KnowledgeBase from "@/pages/KnowledgeBase";
import Bots from "@/pages/Bots";
import Users from "@/pages/Users";
import Analytics from "@/pages/Analytics";
import Settings from "@/pages/Settings";
import SuperAdmin from "@/pages/SuperAdmin";
import WidgetDemo from "@/pages/WidgetDemo";
import AccountBlocked from "@/components/AccountBlocked";
import { isTenantBlocked } from "@/lib/trial";

function AppHome() {
  const { user, tenant, loading } = useAuth();
  if (loading) return <div className="p-10 font-mono text-sm">Loading…</div>;
  if (can(user, "dashboard.view")) return <Dashboard />;
  return <Navigate to={firstAppPath(user, tenant)} replace />;
}

function Protected({ children, superAdmin = false, permission = null }) {
  const { user, tenant, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="p-10 font-mono text-sm">Loading…</div>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (!superAdmin && isTenantBlocked(tenant)) {
    return <AccountBlocked status={tenant?.status} />;
  }
  if (superAdmin && user.role !== "super_admin")
    return <Navigate to="/app" replace />;
  if (permission && !can(user, permission))
    return <Navigate to={firstAppPath(user, tenant)} replace />;
  return children;
}

const ROUTE_PERMS = {
  tickets: "tickets.view",
  chats: "chats.view",
  knowledge: "knowledge.view",
  bots: "bots.view",
  users: "team.view",
  analytics: "analytics.view",
  settings: "settings.view",
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="top-right" richColors />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/widget-demo" element={<WidgetDemo />} />

          <Route
            path="/app"
            element={
              <Protected>
                <AppShell />
              </Protected>
            }
          >
            <Route index element={<AppHome />} />
            <Route path="tickets" element={<Protected permission={ROUTE_PERMS.tickets}><Tickets /></Protected>} />
            <Route path="inbox" element={<Protected permission={ROUTE_PERMS.tickets}><Tickets inboxOnly /></Protected>} />
            <Route path="tickets/:id" element={<Protected permission={ROUTE_PERMS.tickets}><TicketDetail /></Protected>} />
            <Route path="chats" element={<Protected permission={ROUTE_PERMS.chats}><Chats /></Protected>} />
            <Route path="knowledge" element={<Protected permission={ROUTE_PERMS.knowledge}><KnowledgeBase /></Protected>} />
            <Route path="bots" element={<Protected permission={ROUTE_PERMS.bots}><Bots /></Protected>} />
            <Route path="users" element={<Protected permission={ROUTE_PERMS.users}><Users /></Protected>} />
            <Route path="analytics" element={<Protected permission={ROUTE_PERMS.analytics}><Analytics /></Protected>} />
            <Route path="settings" element={<Protected permission={ROUTE_PERMS.settings}><Settings /></Protected>} />
          </Route>

          <Route
            path="/superadmin"
            element={
              <Protected superAdmin>
                <SuperAdmin />
              </Protected>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
