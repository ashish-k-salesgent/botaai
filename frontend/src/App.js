import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import "@/index.css";
import "@/App.css";
import { AuthProvider, useAuth } from "@/lib/auth";
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

function Protected({ children, superAdmin = false }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="p-10 font-mono text-sm">Loading…</div>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (superAdmin && user.role !== "super_admin")
    return <Navigate to="/app" replace />;
  return children;
}

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
            <Route index element={<Dashboard />} />
            <Route path="tickets" element={<Tickets />} />
            <Route path="tickets/:id" element={<TicketDetail />} />
            <Route path="chats" element={<Chats />} />
            <Route path="knowledge" element={<KnowledgeBase />} />
            <Route path="bots" element={<Bots />} />
            <Route path="users" element={<Users />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="settings" element={<Settings />} />
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
