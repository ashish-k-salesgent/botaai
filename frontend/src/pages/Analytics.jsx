import { useEffect, useState } from "react";
import api from "@/lib/api";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const COLORS = ["#002FA7", "#34C759", "#FFCC00", "#FF8C00", "#FF3B30", "#9CA3AF", "#6366F1", "#0EA5E9", "#A855F7"];

export default function Analytics() {
  const [stats, setStats] = useState(null);

  useEffect(() => { api.get("/analytics/summary").then((r) => setStats(r.data)); }, []);
  if (!stats) return <div className="p-8 font-mono text-sm">Loading…</div>;

  const statusData = Object.entries(stats.by_status || {}).map(([k, v]) => ({ name: k.replace("_", " "), value: v }));
  const categoryData = Object.entries(stats.by_category || {}).map(([k, v]) => ({ name: k, value: v }));
  const priorityData = Object.entries(stats.by_priority || {}).map(([k, v]) => ({ name: k, value: v }));

  return (
    <div className="p-8 max-w-7xl mx-auto" data-testid="analytics-page">
      <div className="mb-6">
        <div className="label-mono text-[var(--brand-primary)] mb-2">/ Analytics</div>
        <h1 className="font-display font-black tracking-tighter text-4xl">Performance</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-[var(--border)] border border-[var(--border)] mb-6">
        <Stat label="Total tickets" value={stats.tickets.total} />
        <Stat label="Open" value={stats.tickets.open} />
        <Stat label="AI resolution" value={`${stats.ai_resolution_rate}%`} accent />
        <Stat label="Total chats" value={stats.chats.total} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
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
        <Card title="By category">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie dataKey="value" data={categoryData} outerRadius={90}>
                {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 10, fontFamily: "JetBrains Mono" }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
        <Card title="By priority" className="md:col-span-2">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={priorityData} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 10, fontFamily: "JetBrains Mono" }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fontFamily: "JetBrains Mono" }} />
              <Tooltip />
              <Bar dataKey="value" fill="#111827" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className={`p-5 ${accent ? "bg-[var(--text-primary)] text-white" : "bg-white"}`}>
      <div className="label-mono opacity-60">{label}</div>
      <div className="font-display font-black tracking-tighter text-4xl mt-2">{value}</div>
    </div>
  );
}

function Card({ title, children, className = "" }) {
  return (
    <div className={`border border-[var(--border)] bg-white ${className}`}>
      <div className="px-4 py-2 border-b border-[var(--border)] label-mono">{title}</div>
      <div className="p-4">{children}</div>
    </div>
  );
}
