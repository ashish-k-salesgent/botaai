import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Inbox, MessagesSquare, BookOpen, Users as UsersIcon, Bot, ArrowUpRight, Copy } from "lucide-react";
import { toast } from "sonner";

export default function Dashboard() {
  const { tenant } = useAuth();
  const [stats, setStats] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [chats, setChats] = useState([]);

  useEffect(() => {
    Promise.all([
      api.get("/analytics/summary"),
      api.get("/tickets"),
      api.get("/chats"),
    ]).then(([s, t, c]) => {
      setStats(s.data);
      setTickets(t.data.slice(0, 5));
      setChats(c.data.slice(0, 5));
    });
  }, []);

  const copy = (txt) => {
    navigator.clipboard.writeText(txt);
    toast.success("Copied");
  };

  return (
    <div className="p-8 max-w-7xl mx-auto" data-testid="dashboard-page">
      <div className="flex items-baseline justify-between mb-8">
        <div>
          <div className="label-mono text-[var(--brand-primary)] mb-2">/ Overview</div>
          <h1 className="font-display font-black tracking-tighter text-4xl">{tenant?.name} Control Room</h1>
        </div>
        <div className="text-right">
          <div className="label-mono text-[var(--text-muted)]">Status</div>
          <div className="font-display font-black text-2xl">{tenant?.status?.toUpperCase()}</div>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[var(--border)] border border-[var(--border)] mb-8">
        <Kpi label="Open tickets" value={stats?.tickets?.open ?? "—"} icon={Inbox} link="/app/tickets" />
        <Kpi label="Live chats" value={stats?.chats?.live ?? "—"} icon={MessagesSquare} link="/app/chats" />
        <Kpi label="Knowledge docs" value={stats?.knowledge?.docs ?? "—"} icon={BookOpen} link="/app/knowledge" />
        <Kpi label="Team members" value={stats?.users?.total ?? "—"} icon={UsersIcon} link="/app/users" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent tickets */}
        <div className="lg:col-span-2 border border-[var(--border)] bg-white">
          <div className="px-5 py-3 border-b border-[var(--border)] flex justify-between items-center">
            <span className="label-mono">Recent tickets</span>
            <Link to="/app/tickets" className="text-xs font-semibold flex items-center gap-1">
              View all <ArrowUpRight size={12} />
            </Link>
          </div>
          {tickets.length === 0 && (
            <div className="p-8 text-sm text-[var(--text-muted)]">
              No tickets yet — try the widget on{" "}
              <Link to="/widget-demo" className="underline">/widget-demo</Link>.
            </div>
          )}
          {tickets.map((t) => (
            <Link
              key={t.id}
              to={`/app/tickets/${t.id}`}
              data-testid={`dash-ticket-${t.code}`}
              className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-[var(--border)] hover:bg-[var(--bg-soft)] text-sm"
            >
              <span className="col-span-2 font-mono text-xs">{t.code}</span>
              <span className="col-span-6 truncate">{t.title}</span>
              <StatusBadge status={t.status} />
              <PriorityBadge priority={t.priority} />
            </Link>
          ))}
        </div>

        {/* Widget snippet */}
        <div className="border border-[var(--text-primary)] bg-[var(--text-primary)] text-white p-5">
          <div className="label-mono text-white/60 mb-3">/ Widget SDK</div>
          <div className="font-display font-black text-2xl mb-3">Embed in 3 lines</div>
          <pre className="text-[10px] font-mono bg-black/40 p-3 overflow-x-auto leading-relaxed">
{`<script src="botaai.io/widget.js"
 data-client="${tenant?.client_id || "..."}"
></script>`}
          </pre>
          <button
            onClick={() => copy(tenant?.client_id || "")}
            data-testid="copy-client-id"
            className="mt-3 flex items-center gap-2 text-xs label-mono hover:text-[var(--brand-warning)]"
          >
            <Copy size={12} /> Copy Client ID
          </button>
          <Link
            to="/widget-demo"
            className="mt-6 inline-block bg-white text-black text-xs font-semibold px-3 py-2"
            data-testid="widget-demo-launch"
          >
            Try widget demo →
          </Link>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, icon: Icon, link }) {
  return (
    <Link to={link} className="bg-white p-5 hover:bg-[var(--bg-soft)] block">
      <div className="flex items-center justify-between mb-2">
        <span className="label-mono text-[var(--text-muted)]">{label}</span>
        <Icon size={14} className="text-[var(--text-muted)]" />
      </div>
      <div className="font-display font-black text-4xl tracking-tighter">{value}</div>
    </Link>
  );
}

export function StatusBadge({ status }) {
  const map = {
    new: "bg-blue-50 text-blue-700",
    open: "bg-yellow-50 text-yellow-800",
    in_progress: "bg-orange-50 text-orange-700",
    development: "bg-purple-50 text-purple-700",
    qa: "bg-teal-50 text-teal-700",
    testing: "bg-cyan-50 text-cyan-700",
    waiting: "bg-gray-100 text-gray-700",
    done: "bg-green-50 text-green-700",
    closed: "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`col-span-2 inline-flex items-center justify-self-start px-2 py-0.5 text-xs font-medium font-mono ${map[status] || "bg-gray-100"}`}>
      {status?.replace("_", " ")}
    </span>
  );
}

export function PriorityBadge({ priority }) {
  const colors = { low: "#9CA3AF", medium: "#FFCC00", high: "#FF8C00", critical: "#FF3B30" };
  return (
    <span className="col-span-2 inline-flex items-center gap-1.5 text-xs font-mono">
      <span className="w-2 h-2" style={{ background: colors[priority] || "#9CA3AF" }} />
      {priority}
    </span>
  );
}
