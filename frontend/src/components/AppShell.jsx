import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import {
  LayoutDashboard, Inbox, MessagesSquare, BookOpen,
  Bot, Users as UsersIcon, BarChart3, Settings as SettingsIcon,
  Bell, LogOut, Shield, Search,
} from "lucide-react";

const NAV = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true, key: "dashboard" },
  { to: "/app/tickets", label: "Tickets", icon: Inbox, key: "tickets" },
  { to: "/app/chats", label: "Live Chat", icon: MessagesSquare, key: "chats" },
  { to: "/app/knowledge", label: "Knowledge", icon: BookOpen, key: "knowledge" },
  { to: "/app/bots", label: "Bots", icon: Bot, key: "bots" },
  { to: "/app/users", label: "Team", icon: UsersIcon, key: "users" },
  { to: "/app/analytics", label: "Analytics", icon: BarChart3, key: "analytics" },
  { to: "/app/settings", label: "Settings", icon: SettingsIcon, key: "settings" },
];

export default function AppShell() {
  const { user, tenant, logout } = useAuth();
  const navigate = useNavigate();
  const [notifs, setNotifs] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const load = () => api.get("/notifications").then((r) => setNotifs(r.data)).catch(() => {});
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  const unread = notifs.filter((n) => !n.read).length;

  return (
    <div className="min-h-screen bg-white text-[var(--text-primary)] flex" data-testid="app-shell">
      {/* Sidebar */}
      <aside className="w-60 border-r border-[var(--border)] flex flex-col" data-testid="sidebar">
        <Link to="/app" className="px-5 h-16 flex items-center border-b border-[var(--border)]">
          <div className="w-7 h-7 bg-[var(--brand-primary)] mr-2 flex items-center justify-center">
            <span className="text-white font-display font-black text-sm">B</span>
          </div>
          <span className="font-display font-black text-lg tracking-tighter">BotAAI</span>
        </Link>

        <nav className="flex-1 px-2 py-4 space-y-0.5">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              data-testid={`nav-${n.key}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[var(--text-primary)] text-white"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-soft)] hover:text-[var(--text-primary)]"
                }`
              }
            >
              <n.icon size={16} />
              {n.label}
            </NavLink>
          ))}

          {user?.role === "super_admin" && (
            <NavLink
              to="/superadmin"
              data-testid="nav-superadmin"
              className="mt-4 flex items-center gap-3 px-3 py-2 text-sm font-medium border-t border-[var(--border)] pt-4 text-[var(--brand-destructive)] hover:bg-red-50"
            >
              <Shield size={16} />
              Super Admin
            </NavLink>
          )}
        </nav>

        <div className="p-4 border-t border-[var(--border)]">
          <div className="label-mono text-[var(--text-muted)] mb-1">Tenant</div>
          <div className="text-sm font-semibold truncate" data-testid="tenant-name">{tenant?.name || "—"}</div>
          <div className="label-mono text-[var(--text-muted)] mt-1">
            {tenant?.status === "trial" ? "TRIAL · 14D" : tenant?.plan?.toUpperCase()}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-[var(--border)] flex items-center justify-between px-6">
          <div className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
            <Search size={14} />
            <input
              placeholder="Search tickets, chats, docs…"
              className="bg-transparent outline-none w-72 placeholder:text-[var(--text-muted)]"
              data-testid="global-search"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              data-testid="notif-btn"
              onClick={() => setOpen((o) => !o)}
              className="relative p-2 hover:bg-[var(--bg-soft)]"
            >
              <Bell size={16} />
              {unread > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-[var(--brand-destructive)]" />
              )}
            </button>

            {open && (
              <div className="absolute right-6 top-14 w-80 bg-white border border-[var(--border)] z-50 shadow-lg">
                <div className="flex items-center justify-between p-3 border-b border-[var(--border)]">
                  <span className="label-mono">Notifications</span>
                  <button
                    className="label-mono text-[var(--brand-primary)]"
                    onClick={() => api.post("/notifications/read-all").then(() => setNotifs(notifs.map((n) => ({ ...n, read: true }))))}
                    data-testid="read-all-btn"
                  >
                    Mark all
                  </button>
                </div>
                <div className="max-h-80 overflow-auto">
                  {notifs.length === 0 && <div className="p-4 text-sm text-[var(--text-muted)]">No notifications</div>}
                  {notifs.map((n) => (
                    <div key={n.id} className={`p-3 border-b border-[var(--border)] text-sm ${!n.read ? "bg-blue-50/40" : ""}`}>
                      <div className="font-semibold">{n.title}</div>
                      <div className="text-[var(--text-secondary)] text-xs">{n.body}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="h-8 border-l border-[var(--border)] mx-2" />

            <div className="text-right mr-2">
              <div className="text-sm font-semibold leading-tight" data-testid="user-name">{user?.name}</div>
              <div className="label-mono text-[var(--text-muted)]">{user?.role}</div>
            </div>
            <button
              onClick={logout}
              data-testid="logout-btn"
              className="p-2 hover:bg-[var(--bg-soft)]"
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto bg-[var(--bg-soft)]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
