import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ArrowUpRight, Copy, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { isTicketOverdue, qaIncompleteLabel } from "@/lib/tickets";
import { hasModule } from "@/lib/modules";

export default function Dashboard() {
  const { tenant } = useAuth();
  const [stats, setStats] = useState(null);
  const [tickets, setTickets] = useState([]);

  const [qaTickets, setQaTickets] = useState([]);

  useEffect(() => {
    api.get("/analytics/summary").then((r) => {
      setStats(r.data);
      setQaTickets(r.data?.qa?.incomplete_tickets || []);
    });
    api.get("/tickets", { params: { overdue: "yes" } }).then((r) => setTickets(r.data.slice(0, 6))).catch(() => {});
  }, []);

  const copy = (txt) => { navigator.clipboard.writeText(txt); toast.success("Copied"); };
  const ov = stats?.tickets || {};
  const due = stats?.due_dates || {};
  const qaCount = stats?.qa?.incomplete_count ?? 0;

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

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px bg-[var(--border)] border border-[var(--border)] mb-6">
        <Kpi label="Total" value={ov.total ?? "—"} link="/app/tickets" />
        <Kpi label="Open" value={ov.open ?? "—"} link="/app/tickets" />
        <Kpi label="In progress" value={ov.in_progress ?? "—"} link="/app/tickets" />
        <Kpi label="Completed" value={ov.completed ?? "—"} link="/app/tickets" />
        <Kpi label="Closed" value={ov.closed ?? "—"} link="/app/tickets" />
        <Kpi label="Overdue" value={ov.overdue ?? "—"} link="/app/tickets" danger />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px bg-[var(--border)] border border-[var(--border)] mb-8">
        <MiniStat label="Due today" value={due.due_today ?? 0} />
        <MiniStat label="Due this week" value={due.due_this_week ?? 0} />
        <MiniStat label="Overdue" value={due.overdue ?? 0} danger />
        <MiniStat label="QA incomplete" value={qaCount} warn={qaCount > 0} />
        <MiniStat label="On time" value={due.completed_on_time ?? 0} />
        <MiniStat label="Late done" value={due.completed_late ?? 0} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <div className="panel">
          <div className="px-5 py-3 border-b border-[var(--border)] flex justify-between items-center">
            <span className="label-mono text-red-700 flex items-center gap-2"><AlertTriangle size={14} /> Overdue tickets</span>
            <Link to="/app/tickets" className="text-xs font-semibold flex items-center gap-1">View board <ArrowUpRight size={12} /></Link>
          </div>
          {tickets.length === 0 && <div className="p-8 text-sm text-[var(--text-muted)]">No overdue tickets</div>}
          {tickets.map((t) => (
            <Link key={t.id} to={`/app/tickets/${t.id}`} className={`grid grid-cols-12 gap-4 px-5 py-3 border-b border-[var(--border)] hover:bg-red-50 text-sm ${isTicketOverdue(t) ? "bg-red-50/50" : ""}`}>
              <span className="col-span-2 font-mono text-xs text-red-700">{t.code}</span>
              <span className="col-span-5 truncate">{t.title}</span>
              <StatusBadge status={t.status} />
              <PriorityBadge priority={t.priority} />
            </Link>
          ))}
        </div>

        <div className="panel border-[var(--warning-border)]">
          <div className="px-5 py-3 border-b border-amber-200 flex justify-between items-center bg-amber-50/50">
            <span className="label-mono text-amber-800 flex items-center gap-2"><AlertTriangle size={14} /> QA incomplete</span>
            <Link to="/app/tickets" className="text-xs font-semibold flex items-center gap-1">View board <ArrowUpRight size={12} /></Link>
          </div>
          {qaTickets.length === 0 && <div className="p-8 text-sm text-[var(--text-muted)]">All QA tickets have scenarios completed</div>}
          {qaTickets.map((t) => (
            <Link key={t.id} to={`/app/tickets/${t.id}`} className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-amber-100 hover:bg-amber-50 text-sm">
              <span className="col-span-2 font-mono text-xs text-amber-800">{t.code}</span>
              <span className="col-span-4 truncate">{t.title}</span>
              <span className="col-span-3 text-[10px] font-mono text-amber-700 truncate">{qaIncompleteLabel(t)}</span>
              <StatusBadge status={t.status} />
            </Link>
          ))}
        </div>
      </div>

      {hasModule(tenant, "bot") && (
      <div className="promo-banner p-5 max-w-lg">
        <div className="label-mono opacity-60 mb-3">/ Widget SDK</div>
        <div className="font-display font-black text-2xl mb-3">Embed in 3 lines</div>
        <pre className="code-block text-[10px] p-3 leading-relaxed">{`<script>
  window.BOTAAI_VISITOR = { name, email };
</script>
<script src="botaai.io/widget.js"
  data-client="${tenant?.client_id || "..."}">
</script>`}</pre>
        <button onClick={() => copy(tenant?.client_id || "")} className="mt-3 flex items-center gap-2 text-xs label-mono opacity-80 hover:opacity-100 hover:text-[var(--brand-warning)]"><Copy size={12} /> Copy Client ID</button>
        <Link to="/widget-demo" className="mt-6 inline-block btn-solid text-xs font-semibold px-3 py-2">Try widget demo →</Link>
      </div>
      )}
    </div>
  );
}

function Kpi({ label, value, link, danger }) {
  return (
    <Link to={link} className={`p-4 hover:bg-[var(--bg-soft)] block ${danger ? "stat-cell-danger" : "stat-cell"}`}>
      <div className={`label-mono text-[10px] mb-1 ${danger ? "text-red-700" : "text-[var(--text-muted)]"}`}>{label}</div>
      <div className={`font-display font-black text-3xl ${danger ? "text-red-700" : ""}`}>{value}</div>
    </Link>
  );
}

function MiniStat({ label, value, danger, warn }) {
  const warnCls = warn ? "stat-cell-warn" : danger ? "stat-cell-danger" : "stat-cell";
  const valCls = warn ? "text-amber-800" : danger ? "text-red-700" : "";
  return (
    <div className={`p-4 ${warnCls}`}>
      <div className="label-mono text-[10px] text-[var(--text-muted)]">{label}</div>
      <div className={`font-display font-black text-2xl ${valCls}`}>{value}</div>
    </div>
  );
}

export function StatusBadge({ status }) {
  const map = {
    new: "bg-blue-50 text-blue-700",
    open: "bg-yellow-50 text-yellow-800",
    in_progress: "bg-orange-50 text-orange-700",
    overdue: "bg-red-100 text-red-800",
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
