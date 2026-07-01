import { useEffect, useState } from "react";
import { Download, FileText, Film, Image as ImageIcon, X } from "lucide-react";
import ConfirmDialog from "@/components/ConfirmDialog";

function Icon({ kind }) {
  if (kind === "image") return <ImageIcon size={14} />;
  if (kind === "video") return <Film size={14} />;
  return <FileText size={14} />;
}

function previewMode(item) {
  if (item.kind === "image") return "image";
  if (item.kind === "video") return "video";
  const ct = (item.content_type || "").toLowerCase();
  const ext = (item.name || "").split(".").pop()?.toLowerCase() || "";
  if (ct === "application/pdf" || ext === "pdf") return "pdf";
  if (ct.startsWith("text/") || ["txt", "csv", "log", "md", "json"].includes(ext)) return "text";
  return "document";
}

function isPreviewable(item) {
  const mode = previewMode(item);
  return mode !== "document";
}

function PreviewModal({ item, onClose }) {
  const mode = previewMode(item);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/80 flex flex-col items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative max-w-5xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between text-white mb-3 gap-4">
          <span className="text-sm font-mono truncate">{item.name}</span>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-mono border border-white/30 px-2 py-1 hover:bg-white/10"
            >
              Open
            </a>
            <a
              href={item.url}
              download={item.name}
              className="inline-flex items-center gap-1 text-xs font-mono border border-white/30 px-2 py-1 hover:bg-white/10"
            >
              <Download size={12} /> Download
            </a>
            <button type="button" onClick={onClose} className="p-1 hover:bg-white/10">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 flex items-center justify-center bg-black/40 border border-white/10 overflow-hidden">
          {mode === "image" && (
            <img
              src={item.url}
              alt={item.name}
              className="max-w-full max-h-[calc(90vh-4rem)] object-contain"
            />
          )}
          {mode === "video" && (
            <video
              src={item.url}
              controls
              className="max-w-full max-h-[calc(90vh-4rem)]"
            />
          )}
          {(mode === "pdf" || mode === "text") && (
            <iframe
              src={item.url}
              title={item.name}
              className="w-full h-[calc(90vh-4rem)] bg-white"
            />
          )}
          {mode === "document" && (
            <div className="text-center text-white p-8">
              <FileText size={48} className="mx-auto mb-3 opacity-60" />
              <p className="text-sm font-mono mb-4">No in-browser preview for this file type</p>
              <a
                href={item.url}
                download={item.name}
                className="inline-flex items-center gap-1 text-xs font-mono border border-white/30 px-3 py-2 hover:bg-white/10"
              >
                <Download size={12} /> Download file
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MediaThumb({ item, onClick, large }) {
  const cls = large
    ? "w-full aspect-video max-h-48"
    : "w-20 h-20";
  const mode = previewMode(item);
  const clickable = !!onClick;

  if (mode === "image") {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${cls} border border-[var(--border)] overflow-hidden bg-[var(--bg-soft)] hover:ring-2 hover:ring-[var(--brand-primary)] cursor-pointer`}
      >
        <img src={item.url} alt={item.name} className="w-full h-full object-cover" />
      </button>
    );
  }

  if (mode === "video") {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${cls} border border-[var(--border)] overflow-hidden bg-[var(--bg-soft)] hover:ring-2 hover:ring-[var(--brand-primary)] cursor-pointer relative flex items-center justify-center`}
      >
        <Film size={large ? 32 : 20} className="text-[var(--text-muted)]" />
        <span className="absolute bottom-1 left-1 text-[10px] font-mono bg-black/60 text-white px-1 truncate max-w-[90%]">
          {item.name}
        </span>
      </button>
    );
  }

  const label = mode === "pdf" ? "PDF" : mode === "text" ? "TEXT" : extLabel(item.name);

  if (clickable) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${cls} border border-[var(--border)] overflow-hidden bg-[var(--bg-soft)] hover:ring-2 hover:ring-[var(--brand-primary)] cursor-pointer flex flex-col items-center justify-center gap-1 p-2`}
      >
        <FileText size={large ? 32 : 20} className="text-[var(--brand-primary)]" />
        <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase">{label}</span>
        {large && (
          <span className="text-[10px] font-mono text-[var(--text-muted)] truncate w-full text-center">
            {item.name}
          </span>
        )}
      </button>
    );
  }

  return (
    <a
      href={item.url}
      download={item.name}
      className="inline-flex items-center gap-1.5 text-xs font-mono border border-[var(--border)] px-2 py-1 bg-[var(--bg)] text-[var(--text-primary)] hover:bg-[var(--bg-soft)]"
    >
      <Icon kind={item.kind} />
      <span className="truncate max-w-[140px]">{item.name}</span>
    </a>
  );
}

function extLabel(name) {
  const ext = (name || "").split(".").pop()?.toUpperCase();
  return ext && ext.length <= 5 ? ext : "FILE";
}

export default function AttachmentList({ items = [], compact = false, preview = !compact, onRemove }) {
  const [lightbox, setLightbox] = useState(null);
  const [pendingRemove, setPendingRemove] = useState(null);
  const [removing, setRemoving] = useState(false);

  const open = (item) => setLightbox(item);

  const confirmRemove = async () => {
    if (!pendingRemove || !onRemove) return;
    setRemoving(true);
    try {
      await onRemove(pendingRemove.id);
      setPendingRemove(null);
    } finally {
      setRemoving(false);
    }
  };

  const removeDialog = onRemove && (
    <ConfirmDialog
      open={!!pendingRemove}
      title="Remove this attachment?"
      description={
        pendingRemove
          ? `"${pendingRemove.name}" will be removed from this ticket. The file will no longer appear here, but may still exist in storage.`
          : ""
      }
      confirmLabel="Remove attachment"
      cancelLabel="Keep file"
      destructive
      loading={removing}
      onConfirm={confirmRemove}
      onCancel={() => setPendingRemove(null)}
    />
  );

  if (preview) {
    return (
      <>
        {items?.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
            {items.map((a) => (
              <div key={a.id} className="relative group">
                <MediaThumb item={a} large onClick={() => open(a)} />
                <div className="text-[10px] font-mono text-[var(--text-muted)] mt-1 truncate">{a.name}</div>
                {onRemove && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingRemove(a);
                    }}
                    className="absolute top-1 right-1 p-0.5 bg-[var(--bg)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--brand-destructive)] opacity-0 group-hover:opacity-100"
                    title="Remove"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {lightbox && <PreviewModal item={lightbox} onClose={() => setLightbox(null)} />}
        {removeDialog}
      </>
    );
  }

  if (!items?.length) return null;

  return (
    <>
      <div className={`flex flex-wrap gap-2 ${compact ? "mt-2" : "mt-3"}`}>
        {items.map((a) => (
          <MediaThumb
            key={a.id}
            item={a}
            onClick={isPreviewable(a) ? () => open(a) : undefined}
          />
        ))}
      </div>
      {lightbox && <PreviewModal item={lightbox} onClose={() => setLightbox(null)} />}
    </>
  );
}
