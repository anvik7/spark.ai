import React, { useEffect, useState, useRef } from "react";
import { api } from "./api.js";
import ConfirmationDialog from "./components/ui/ConfirmationDialog";

function fmtSize(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function Papers() {
  const [papers, setPapers] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [err, setErr] = useState("");

  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = () => {
    api.listPapers({})
      .then(setPapers)
      .catch((e) => setErr(e.message));
  };

  useEffect(() => {
    load();
  }, []);

  const confirmDeletePaper = async () => {
    if (!deleteTargetId) return;
    setIsDeleting(true);
    try {
      await api.deletePaper(deleteTargetId);
      setPapers((ps) => ps?.filter((p) => p.id !== deleteTargetId) || []);
      setDeleteTargetId(null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredPapers = (papers || []).filter((p) => {
    const q = searchQuery.trim().toLowerCase();
    return !q ||
      (p.title && p.title.toLowerCase().includes(q)) ||
      (p.examTag && p.examTag.toLowerCase().includes(q)) ||
      (p.subject && p.subject.toLowerCase().includes(q));
  });

  return (
    <div className="screen">
      <ConfirmationDialog
        isOpen={Boolean(deleteTargetId)}
        title="Delete paper?"
        description="This will remove this document from your Paper Vault. This action cannot be undone."
        confirmLabel="Delete paper"
        cancelLabel="Cancel"
        isDanger={true}
        busy={isDeleting}
        onConfirm={confirmDeletePaper}
        onCancel={() => setDeleteTargetId(null)}
      />

      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <h1 className="title" style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "var(--ink)" }}>Papers</h1>
        <p className="sub" style={{ margin: "2px 0 0", fontSize: 13.5, color: "var(--ink-soft)" }}>
          Keep your documents and learning materials organized in Spark.
        </p>
      </div>

      {/* Search & Upload Controls */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by title or subject…"
          style={{
            flex: 1,
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid var(--line)",
            fontSize: 13.5,
            background: "var(--surface)",
          }}
        />
        <button
          className="btn"
          onClick={() => setShowUpload((s) => !s)}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            background: "var(--p-gradient)",
            color: "#ffffff",
            border: "none",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {showUpload ? "Cancel" : "＋ Upload Document"}
        </button>
      </div>

      {/* Upload Form */}
      {showUpload && (
        <UploadForm
          onUploaded={(paper) => {
            setPapers((ps) => [paper, ...(ps || [])]);
            setShowUpload(false);
          }}
          onError={setErr}
        />
      )}

      {err && (
        <div className="err" style={{ marginBottom: 12 }}>
          ⚠️ {err}
          <button onClick={() => setErr("")} style={{ marginLeft: 8, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>✕</button>
        </div>
      )}

      {/* Paper List */}
      {!papers && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 72, borderRadius: 10 }} />
          ))}
        </div>
      )}

      {papers && filteredPapers.length === 0 && (
        <div style={{ textAlign: "center", padding: "36px 16px", background: "var(--surface-2)", borderRadius: 10, border: "1px dashed var(--line)" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>No papers uploaded yet.</div>
          <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 4 }}>
            Upload your documents to keep them organized in Spark.
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filteredPapers.map((p) => (
          <PaperCard key={p.id} paper={p} onDelete={(id) => setDeleteTargetId(id)} />
        ))}
      </div>
    </div>
  );
}

/* ---------- Upload Form Component ---------- */
function UploadForm({ onUploaded, onError }) {
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef();

  const submit = async (e) => {
    e.preventDefault();
    if (!file || !title.trim()) return;
    setBusy(true);
    try {
      const paper = await api.uploadPaper(file, title.trim(), "", subject.trim(), null);
      onUploaded(paper);
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{
      background: "var(--surface)", borderRadius: 10, padding: 16,
      marginBottom: 16, border: "1.5px solid var(--line)", boxShadow: "var(--sh-sm)",
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", marginBottom: 12 }}>Upload Learning Document</div>

      <input
        value={title} onChange={(e) => setTitle(e.target.value)}
        placeholder="Document title (e.g. Constitutional Law Notes, Financial Accounting 2024)"
        required
        style={{
          width: "100%", padding: "8px 12px", borderRadius: 8,
          border: "1px solid var(--line)", fontSize: 13.5, marginBottom: 8,
        }}
      />

      <input
        value={subject} onChange={(e) => setSubject(e.target.value)}
        placeholder="Subject or Category (Optional)"
        style={{
          width: "100%", padding: "8px 12px", borderRadius: 8,
          border: "1px solid var(--line)", fontSize: 13.5, marginBottom: 12,
        }}
      />

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          style={{ display: "none" }}
        />

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          style={{
            padding: "8px 14px", borderRadius: 8,
            border: "1px solid var(--line)", background: "var(--surface-2)",
            fontSize: 13, cursor: "pointer", fontWeight: 600, color: "var(--ink)",
          }}
        >
          {file ? `📄 ${file.name}` : "📁 Select File"}
        </button>

        <div style={{ flex: 1 }} />

        <button
          type="submit"
          disabled={busy || !file || !title.trim()}
          style={{
            padding: "8px 18px", borderRadius: 8,
            border: "none", background: busy || !file || !title.trim() ? "var(--line)" : "var(--p-gradient)",
            color: "#ffffff", fontSize: 13.5, fontWeight: 700,
            cursor: busy || !file || !title.trim() ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "Uploading…" : "Upload"}
        </button>
      </div>
    </form>
  );
}

/* ---------- Paper Card Component ---------- */
function PaperCard({ paper, onDelete }) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10,
      padding: 14, boxShadow: "var(--sh-sm)", display: "flex", justifyContent: "space-between", alignItems: "center",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 24 }}>📄</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{paper.title}</div>
          <div style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 2 }}>
            {paper.subject || "Document"} · {fmtSize(paper.fileSize)} · {fmtDate(paper.uploadedAt)}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <a
          href={api.downloadPaperUrl(paper.id)}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: "6px 12px", borderRadius: 6,
            background: "var(--marigold-light)", color: "var(--marigold-dark)",
            fontSize: 12.5, fontWeight: 700, textDecoration: "none",
          }}
        >
          Download
        </a>

        <button
          onClick={() => onDelete(paper.id)}
          style={{
            background: "none", border: "none", color: "var(--ink-faint)",
            cursor: "pointer", fontSize: 16, padding: "4px 8px",
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
