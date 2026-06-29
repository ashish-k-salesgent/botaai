import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { toast } from "sonner";
import { Copy } from "lucide-react";

export default function Settings() {
  const { tenant, setTenant } = useAuth();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#002FA7");
  const [greeting, setGreeting] = useState("");

  useEffect(() => {
    if (tenant) {
      setName(tenant.name || "");
      setColor(tenant.branding?.primary_color || "#002FA7");
      setGreeting(tenant.branding?.greeting || "");
    }
  }, [tenant]);

  const save = async () => {
    const r = await api.patch("/tenant", {
      name,
      branding: { ...(tenant.branding || {}), primary_color: color, greeting },
    });
    setTenant(r.data);
    toast.success("Saved");
  };

  const copy = (txt) => { navigator.clipboard.writeText(txt); toast.success("Copied"); };

  const snippet = `<script
  src="https://botaai.io/widget.js"
  data-client="${tenant?.client_id || ""}"
></script>`;

  return (
    <div className="p-8 max-w-4xl mx-auto" data-testid="settings-page">
      <div className="mb-6">
        <div className="label-mono text-[var(--brand-primary)] mb-2">/ Settings</div>
        <h1 className="font-display font-black tracking-tighter text-4xl">Workspace</h1>
      </div>

      <div className="border border-[var(--border)] bg-white p-6 mb-6">
        <div className="label-mono mb-4">Branding</div>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="label-mono block mb-1">Company name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} data-testid="tenant-name-input" className="w-full border border-[var(--border)] px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="label-mono block mb-1">Primary color</label>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} data-testid="tenant-color-input" className="w-full border border-[var(--border)] h-[38px]" />
          </div>
          <div className="md:col-span-2">
            <label className="label-mono block mb-1">Welcome greeting</label>
            <input value={greeting} onChange={(e) => setGreeting(e.target.value)} data-testid="tenant-greeting-input" className="w-full border border-[var(--border)] px-3 py-2 text-sm" />
          </div>
        </div>
        <button onClick={save} data-testid="tenant-save" className="mt-5 bg-[var(--brand-primary)] text-white px-5 py-2 text-sm font-semibold">Save</button>
      </div>

      <div className="border border-[var(--text-primary)] bg-white p-6">
        <div className="label-mono mb-4">Widget Credentials</div>
        <div className="grid md:grid-cols-2 gap-4 mb-5">
          <Cred label="Tenant ID" value={tenant?.id} onCopy={copy} testid="copy-tenant-id" />
          <Cred label="Client ID" value={tenant?.client_id} onCopy={copy} testid="copy-client-id-settings" />
          <Cred label="Client Secret" value={tenant?.client_secret} onCopy={copy} testid="copy-client-secret" mask />
          <Cred label="Plan / Status" value={`${tenant?.plan} · ${tenant?.status}`} />
        </div>
        <div>
          <div className="label-mono mb-2">Embed snippet</div>
          <pre className="bg-[var(--text-primary)] text-white text-xs font-mono p-4 overflow-x-auto">{snippet}</pre>
          <button onClick={() => copy(snippet)} data-testid="copy-snippet-btn" className="mt-3 flex items-center gap-2 text-xs label-mono">
            <Copy size={12} /> Copy snippet
          </button>
        </div>
      </div>
    </div>
  );
}

function Cred({ label, value, onCopy, testid, mask }) {
  const display = mask ? "•".repeat(Math.min(28, (value || "").length)) : value;
  return (
    <div className="border border-[var(--border)] p-3">
      <div className="label-mono text-[var(--text-muted)] mb-1">{label}</div>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs truncate">{display || "—"}</span>
        {onCopy && value && (
          <button data-testid={testid} onClick={() => onCopy(value)} className="text-[var(--text-muted)] hover:text-[var(--brand-primary)]">
            <Copy size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
