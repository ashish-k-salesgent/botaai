import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import { qaIncompleteLabel } from "@/lib/tickets";
import { StatusBadge } from "@/pages/Dashboard";

const COLORS = ["#002FA7", "#34C759", "#FFCC00", "#FF8C00", "#FF3B30", "#9CA3AF", "#6366F1", "#0EA5E9", "#A855F7"];

export default function Analytics() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/analytics/summary")
      .then((r) => setStats(r.data))
      .catch((err) => setError(err.response?.data?.detail || "Failed to load analytics"));
  }, []);

  if (error) {
    return (
      <div className="p-8 font-mono text-sm text-red-700" data-testid="analytics-page">
        {error}
      </div>
    );
  }
  if (!stats) return <div className="p-8 font-mono text-sm">Loading…</div>;

  const statusData = Object.entries(stats.by_status || {}).map(([k, v]) => ({ name: k.replace("_", " "), value: v }));
  const categoryData = Object.entries(stats.by_category || {}).map(([k, v]) => ({ name: k, value: v }));
  const priorityData = Object.entries(stats.priority_open || stats.by_priority || {}).map(([k, v]) => ({ name: k, value: v }));
  const ov = stats.tickets || {};
  const due = stats.due_dates || {};
  const users = stats.user_performance || [];
  const qa = stats.qa || {};
  const qaTickets = qa.incomplete_tickets || [];
  const recent = stats.recent || {};

  return (
    <div className="p-8 max-w-7xl mx-auto" data-testid="analytics-page">
      <div className="mb-6">
        <div className="label-mono text-[var(--brand-primary)] mb-2">/ Analytics</div>
        <h1 className="font-display font-black tracking-tighter text-4xl">Performance</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px bg-[var(--border)] border border-[var(--border)] mb-6">
        <Stat label="Total" value={ov.total} />
        <Stat label="Open" value={ov.open} />
        <Stat label="In progress" value={ov.in_progress} />
        <Stat label="Completed" value={ov.completed} />
        <Stat label="Closed" value={ov.closed} />
        <Stat label="Overdue" value={ov.overdue} danger />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px bg-[var(--border)] border border-[var(--border)] mb-6">
        <Stat label="Due today" value={due.due_today} />
        <Stat label="Due this week" value={due.due_this_week} />
        <Stat label="Overdue" value={due.overdue} danger />
        <Stat label="QA incomplete" value={qa.incomplete_count ?? 0} warn />
        <Stat label="On time" value={due.completed_on_time} />
        <Stat label="Late done" value={due.completed_late} />
      </div>

      {qaTickets.length > 0 && (
        <div className="panel border-[var(--warning-border)] mb-6">
          <div className="px-4 py-2 border-b border-amber-200 label-mono text-[10px] text-amber-800 bg-amber-50/50">
            In QA / Testing with incomplete scenarios
          </div>
          <div className="divide-y divide-amber-100">
            {qaTickets.map((t) => (
              <Link key={t.id} to={`/app/tickets/${t.id}`} className="flex items-center gap-4 px-4 py-2 text-sm hover:bg-amber-50">
                <span className="font-mono text-xs text-amber-800 w-24">{t.code}</span>
                <span className="flex-1 truncate">{t.title}</span>
                <span className="text-[10px] font-mono text-amber-700">{qaIncompleteLabel(t)}</span>
                <StatusBadge status={t.status} />
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <Card title="Tickets by status">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={statusData}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fontFamily: "JetBrains Mono" }} />
              <YAxis tick={{ fontSize: 10, fontFamily: "JetBrains Mono" }} />
              <Tooltip />
              <Bar dataKey="value" fill="#002FA7" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Open by priority">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={priorityData} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={60} />
              <Tooltip />
              <Bar dataKey="value" fill="#111827" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card title="User workload">
          <table className="w-full text-xs">
            <thead><tr className="label-mono border-b"><th className="text-left py-2">User</th><th>Assigned</th><th>Done</th><th>Pending</th><th>Overdue</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.user_id} className="border-b border-[var(--border)]">
                  <td className="py-2 font-semibold">{u.name}</td>
                  <td className="text-center">{u.assigned}</td>
                  <td className="text-center">{u.completed}</td>
                  <td className="text-center">{u.pending}</td>
                  <td className="text-center text-red-600">{u.overdue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="By category">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie dataKey="value" data={categoryData} outerRadius={90}>
                {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <RecentList title="Recently created" items={recent.created} />
        <RecentList title="Recently completed" items={recent.completed} />
        <RecentList title="Recently updated" items={recent.updated} />
      </div>
    </div>
  );
}

function RecentList({ title, items = [] }) {
  return (
    <div className="panel">
      <div className="px-4 py-2 border-b label-mono text-[10px]">{title}</div>
      <div className="divide-y divide-[var(--border)]">
        {(items || []).map((t) => (
          <Link key={t.id} to={`/app/tickets/${t.id}`} className="block px-4 py-2 text-sm hover:bg-[var(--bg-soft)]">
            <div className="font-mono text-[10px] text-[var(--text-muted)]">{t.code}</div>
            <div className="truncate font-semibold">{t.title}</div>
            <StatusBadge status={t.status} />
          </Link>
        ))}
        {!items?.length && <div className="p-4 text-xs text-[var(--text-muted)]">None</div>}
      </div>
    </div>
  );
}

function Stat({ label, value, danger, warn }) {
  const bg = warn ? "stat-cell-warn" : danger ? "stat-cell-danger" : "stat-cell";
  const val = warn ? "text-amber-800" : danger ? "text-red-700" : "";
  return (
    <div className={`p-4 ${bg}`}>
      <div className="label-mono text-[10px] opacity-60">{label}</div>
      <div className={`font-display font-black text-3xl mt-1 ${val}`}>{value ?? "—"}</div>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div className="panel">
      <div className="px-4 py-2 border-b border-[var(--border)] label-mono">{title}</div>
      <div className="p-4">{children}</div>
    </div>
  );
}
