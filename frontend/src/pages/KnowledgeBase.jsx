import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Plus, FileText, Trash2, Search } from "lucide-react";

export default function KnowledgeBase() {
  const [docs, setDocs] = useState([]);
  const [open, setOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [results, setResults] = useState(null);

  const load = () => api.get("/knowledge").then((r) => setDocs(r.data));
  useEffect(() => { load(); }, []);

  const search = async (e) => {
    e.preventDefault();
    if (!searchQ.trim()) { setResults(null); return; }
    const r = await api.post("/knowledge/search", { query: searchQ, top_k: 5 });
    setResults(r.data);
  };

  return (
    <div className="p-8 max-w-6xl mx-auto" data-testid="kb-page">
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <div className="label-mono text-[var(--brand-primary)] mb-2">/ Knowledge base</div>
          <h1 className="font-display font-black tracking-tighter text-4xl">RAG Library</h1>
        </div>
        <button onClick={() => setOpen(true)} data-testid="add-doc-btn" className="inline-flex items-center gap-2 bg-[var(--text-primary)] text-white px-4 py-2 text-sm font-semibold hover:bg-black">
          <Plus size={14} /> Add document
        </button>
      </div>

      <form onSubmit={search} className="border border-[var(--border)] bg-white flex items-center mb-6">
        <Search size={14} className="ml-3 text-[var(--text-muted)]" />
        <input
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          data-testid="kb-search-input"
          placeholder="Test retrieval: how do I create an invoice?"
          className="flex-1 px-3 py-3 text-sm bg-transparent"
        />
        <button className="bg-[var(--brand-primary)] text-white px-5 py-3 text-sm font-semibold">Search</button>
      </form>

      {results && (
        <div className="mb-6 border border-[var(--brand-primary)] bg-white">
          <div className="px-4 py-2 border-b border-[var(--border)] label-mono">Top {results.length} matches</div>
          {results.length === 0 && <div className="p-4 text-sm text-[var(--text-muted)]">No matches</div>}
          {results.map((r, i) => (
            <div key={i} className="p-4 border-b border-[var(--border)] text-sm">
              <div className="flex justify-between mb-1">
                <span className="font-semibold">{r.title}</span>
                <span className="label-mono text-[var(--brand-primary)]">{r.score.toFixed(3)}</span>
              </div>
              <div className="text-[var(--text-secondary)]">{r.text}</div>
            </div>
          ))}
        </div>
      )}

      <div className="border border-[var(--border)] bg-white">
        <div className="grid grid-cols-12 gap-4 px-5 py-2 border-b border-[var(--border)] bg-[var(--bg-soft)] label-mono">
          <span className="col-span-5">Title</span>
          <span className="col-span-2">Type</span>
          <span className="col-span-2">Status</span>
          <span className="col-span-2 text-right">Chunks</span>
          <span className="col-span-1"></span>
        </div>
        {docs.length === 0 && <div className="p-6 text-sm text-[var(--text-muted)]">No documents yet.</div>}
        {docs.map((d) => (
          <div key={d.id} className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-[var(--border)] text-sm items-center hover:bg-[var(--bg-soft)]">
            <span className="col-span-5 flex items-center gap-2">
              <FileText size={14} className="text-[var(--text-muted)]" />
              <span className="font-semibold">{d.title}</span>
            </span>
            <span className="col-span-2 label-mono text-[var(--text-muted)]">{d.source_type}</span>
            <span className="col-span-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-mono">
                <span className="w-2 h-2 bg-[var(--brand-success)]" /> {d.status}
              </span>
            </span>
            <span className="col-span-2 text-right font-mono text-xs">{d.chunk_count}</span>
            <button
              onClick={async () => {
                if (!window.confirm("Delete this document?")) return;
                await api.delete(`/knowledge/${d.id}`);
                toast.success("Deleted");
                load();
              }}
              data-testid={`kb-delete-${d.id}`}
              className="col-span-1 text-[var(--text-muted)] hover:text-[var(--brand-destructive)] justify-self-end"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {open && <AddDocModal onClose={() => setOpen(false)} onDone={() => { setOpen(false); load(); }} />}
    </div>
  );
}

function AddDocModal({ onClose, onDone }) {
  const [form, setForm] = useState({ title: "", content: "", source_type: "text" });
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/knowledge", form);
      toast.success("Document added");
      onDone();
    } catch { toast.error("Failed"); }
    finally { setLoading(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white border border-[var(--text-primary)] w-full max-w-2xl" data-testid="add-doc-modal">
        <div className="px-5 py-3 border-b border-[var(--border)] label-mono">Add document</div>
        <div className="p-5 space-y-4">
          <div>
            <label className="label-mono block mb-1">Title</label>
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="doc-title" className="w-full border border-[var(--border)] px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="label-mono block mb-1">Type</label>
            <select value={form.source_type} onChange={(e) => setForm({ ...form, source_type: e.target.value })} className="w-full border border-[var(--border)] px-3 py-2 text-sm">
              {["text", "faq", "markdown", "url", "pdf"].map((x) => <option key={x}>{x}</option>)}
            </select>
          </div>
          <div>
            <label className="label-mono block mb-1">Content</label>
            <textarea
              required rows={10} value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              data-testid="doc-content"
              placeholder="Paste your FAQ, manual, release notes…"
              className="w-full border border-[var(--border)] px-3 py-2 text-sm font-mono"
            />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-[var(--border)] flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-[var(--border)]">Cancel</button>
          <button data-testid="doc-submit" disabled={loading} className="px-4 py-2 text-sm bg-[var(--brand-primary)] text-white">
            {loading ? "Indexing…" : "Add & index"}
          </button>
        </div>
      </form>
    </div>
  );
}
