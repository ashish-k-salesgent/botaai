import { useRef, useState } from "react";
import { Paperclip, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { uploadFile } from "@/lib/uploads";

export default function AttachmentUpload({ value = [], onChange, clientId, sessionId, label = "Attach files", showList = true }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const onPick = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setUploading(true);
    try {
      const uploaded = [];
      for (const file of files) {
        uploaded.push(await uploadFile(file, { clientId, sessionId }));
      }
      onChange([...(value || []), ...uploaded]);
    } catch (err) {
      toast.error(err?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const remove = (id) => onChange((value || []).filter((a) => a.id !== id));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 text-xs font-mono border border-[var(--border)] px-2 py-1 hover:bg-[var(--bg-soft)] disabled:opacity-50"
        >
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <Paperclip size={12} />}
          {label}
        </button>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={onPick} accept="image/*,video/*,.pdf,.doc,.docx,.txt,.csv,.xlsx,.xls,.ppt,.pptx" />
      </div>
      {showList && (value || []).length > 0 && (
        <ul className="space-y-1">
          {(value || []).map((a) => (
            <li key={a.id} className="flex items-center justify-between text-xs font-mono border border-[var(--border)] px-2 py-1 bg-[var(--bg-soft)]">
              <span className="truncate">{a.name} · {a.kind}</span>
              <button type="button" onClick={() => remove(a.id)} className="text-[var(--text-muted)] hover:text-[var(--brand-destructive)]">
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
