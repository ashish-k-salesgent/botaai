import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { canNav, can } from "@/lib/permissions";
import { canNavModule } from "@/lib/modules";
import GlobalTicketSearch from "@/components/GlobalTicketSearch";
import ThemeToggle from "@/components/ThemeToggle";
import TrialBadge from "@/components/TrialBadge";
import {
  LayoutDashboard, Inbox, MessagesSquare, BookOpen,
  Bot, Users as UsersIcon, BarChart3, Settings as SettingsIcon,
  Bell, LogOut, Shield, Search, Layers,
} from "lucide-react";

const NAV = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true, key: "dashboard" },
  { to: "/app/tickets", label: "Spaces", icon: Layers, key: "tickets" },
  { to: "/app/inbox", label: "Inbox", icon: Inbox, key: "inbox" },
  { to: "/app/chats", label: "Live Chat", icon: MessagesSquare, key: "chats" },
  { to: "/app/knowledge", label: "Knowledge", icon: BookOpen, key: "knowledge" },
  { to: "/app/bots", label: "Bots", icon: Bot, key: "bots" },
  { to: "/app/users", label: "Team", icon: UsersIcon, key: "users" },
  { to: "/app/analytics", label: "Analytics", icon: BarChart3, key: "analytics" },
  { to: "/app/settings", label: "Settings", icon: SettingsIcon, key: "settings" },
];

export default function AppShell() {
  const { user, tenant, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [notifs, setNotifs] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const load = () => api.get("/notifications").then((r) => setNotifs(r.data)).catch(() => {});
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (tenant?.status !== "trial") return undefined;
    const id = setInterval(() => refreshUser().catch(() => {}), 60000);
    return () => clearInterval(id);
  }, [tenant?.status, refreshUser]);

  const unread = notifs.filter((n) => !n.read).length;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)] flex" data-testid="app-shell">
      {/* Sidebar */}
      <aside className="w-60 border-r border-[var(--border)] bg-[var(--bg)] flex flex-col" data-testid="sidebar">
        <Link to="/app" className="px-5 h-16 flex items-center border-b border-[var(--border)]">
          <div className="w-7 h-7 bg-[var(--brand-primary)] mr-2 flex items-center justify-center">
            <span className="text-white font-display font-black text-sm">B</span>
          </div>
          <span className="font-display font-black text-lg tracking-tighter">BotAAI</span>
        </Link>

        <nav className="flex-1 px-2 py-4 space-y-0.5">
          {NAV.filter((n) => canNav(user, n.key) && canNavModule(tenant, n.key)).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              data-testid={`nav-${n.key}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[var(--inverse-bg)] text-[var(--inverse-fg)]"
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
              className="mt-4 flex items-center gap-3 px-3 py-2 text-sm font-medium border-t border-[var(--border)] pt-4 text-[var(--brand-destructive)] hover:bg-[var(--danger-surface)]"
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
            <TrialBadge tenant={tenant} />
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-[var(--border)] bg-[var(--bg)] flex items-center justify-between px-6">
          <div className="flex items-center gap-3 text-sm text-[var(--text-secondary)] min-w-0 flex-1 max-w-xl">
            <Search size={14} className="shrink-0" />
            {can(user, "tickets.view") ? (
              <GlobalTicketSearch />
            ) : (
              <span className="text-[var(--text-muted)] text-sm">Search unavailable</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
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
              <div className="absolute right-6 top-14 w-80 bg-[var(--bg)] border border-[var(--border)] z-50 shadow-lg">
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
                    <div key={n.id} className={`p-3 border-b border-[var(--border)] text-sm ${!n.read ? "bg-[var(--unread-surface)]" : ""}`}>
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
