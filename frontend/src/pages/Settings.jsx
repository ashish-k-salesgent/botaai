import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { can } from "@/lib/permissions";
import { hasModule } from "@/lib/modules";

export default function Settings() {
  const { tenant, setTenant, user } = useAuth();
  const canEdit = can(user, "settings.edit");
  const hasBot = hasModule(tenant, "bot");
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

  const snippet = `<!-- 1. After YOUR user signs in, set visitor (name + email) -->
<script>
  window.BOTAAI_VISITOR = { name: "Jane Doe", email: "jane@company.com" };
</script>
<!-- 2. Load widget with your Client ID -->
<script
  src="https://botaai.io/widget.js"
  data-client="${tenant?.client_id || ""}"
  data-api="https://api.botaai.io"
></script>`;

  return (
    <div className="p-8 max-w-4xl mx-auto" data-testid="settings-page">
      <div className="mb-6">
        <div className="label-mono text-[var(--brand-primary)] mb-2">/ Settings</div>
        <h1 className="font-display font-black tracking-tighter text-4xl">Workspace</h1>
      </div>

      <div className="panel p-6 mb-6">
        <div className="label-mono mb-4">Branding</div>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="label-mono block mb-1">Company name</label>
            <input value={name} disabled={!canEdit} onChange={(e) => setName(e.target.value)} data-testid="tenant-name-input" className="field-input disabled:opacity-60" />
          </div>
          <div>
            <label className="label-mono block mb-1">Primary color</label>
            <input type="color" value={color} disabled={!canEdit} onChange={(e) => setColor(e.target.value)} data-testid="tenant-color-input" className="w-full border border-[var(--border)] h-[38px] disabled:opacity-60" />
          </div>
          <div className="md:col-span-2">
            <label className="label-mono block mb-1">Welcome greeting</label>
            <input value={greeting} disabled={!canEdit} onChange={(e) => setGreeting(e.target.value)} data-testid="tenant-greeting-input" className="field-input disabled:opacity-60" />
          </div>
        </div>
        {canEdit && (
        <button onClick={save} data-testid="tenant-save" className="mt-5 btn-primary px-5 py-2 text-sm font-semibold">Save</button>
        )}
      </div>

      {hasBot && (
      <div className="panel p-6">
        <div className="label-mono mb-4">Widget Credentials</div>
        <div className="grid md:grid-cols-2 gap-4 mb-5">
          <Cred label="Tenant ID" value={tenant?.id} onCopy={copy} testid="copy-tenant-id" />
          <Cred label="Client ID" value={tenant?.client_id} onCopy={copy} testid="copy-client-id-settings" />
          <Cred label="Client Secret" value={tenant?.client_secret} onCopy={copy} testid="copy-client-secret" mask />
          <Cred label="Plan / Status" value={`${tenant?.plan} · ${tenant?.status}`} />
        </div>
        <div>
          <div className="label-mono mb-2">Embed snippet</div>
          <p className="text-xs text-[var(--text-muted)] mb-3 max-w-2xl">
            Customers use your site login — not BotAAI. Pass their name and email via{" "}
            <code className="text-[10px]">window.BOTAAI_VISITOR</code> before loading the script.
            Chats and widget tickets map to that customer in your dashboard.
          </p>
          <pre className="code-block">{snippet}</pre>
          <button onClick={() => copy(snippet)} data-testid="copy-snippet-btn" className="mt-3 flex items-center gap-2 text-xs label-mono">
            <Copy size={12} /> Copy snippet
          </button>
        </div>
      </div>
      )}
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
