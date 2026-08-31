import React, { useEffect, useState, useRef } from "react";
import { api } from "./api.js";
import ConfirmationDialog from "./components/ui/ConfirmationDialog";

const CATEGORIES = [
  "All",
  "Engineering",
  "Medical",
  "Management",
  "Law",
  "Government",
  "School",
  "University",
  "Professional",
  "Other",
];

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function Papers() {
  const [papers, setPapers] = useState(null);
  const [filterCategory, setFilterCategory] = useState("All");
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
    const matchesSearch = !q ||
      (p.title && p.title.toLowerCase().includes(q)) ||
      (p.examTag && p.examTag.toLowerCase().includes(q)) ||
      (p.subject && p.subject.toLowerCase().includes(q));

    if (!matchesSearch) return false;

    if (filterCategory === "All") return true;
    if (filterCategory === "Engineering") return p.examTag?.toLowerCase().includes("engineering") || p.examTag?.toLowerCase().includes("jee") || p.examTag?.toLowerCase().includes("gate");
    if (filterCategory === "Medical") return p.examTag?.toLowerCase().includes("medical") || p.examTag?.toLowerCase().includes("neet") || p.examTag?.toLowerCase().includes("usmle");
    if (filterCategory === "Management") return p.examTag?.toLowerCase().includes("management") || p.examTag?.toLowerCase().includes("cat") || p.examTag?.toLowerCase().includes("gmat");
    if (filterCategory === "Law") return p.examTag?.toLowerCase().includes("law") || p.examTag?.toLowerCase().includes("clat");
    if (filterCategory === "Government") return p.examTag?.toLowerCase().includes("government") || p.examTag?.toLowerCase().includes("upsc") || p.examTag?.toLowerCase().includes("ssc");
    if (filterCategory === "School") return p.examTag?.toLowerCase().includes("school") || p.examTag?.toLowerCase().includes("cbse") || p.examTag?.toLowerCase().includes("sat");
    if (filterCategory === "University") return p.examTag?.toLowerCase().includes("university") || p.examTag?.toLowerCase().includes("du") || p.examTag?.toLowerCase().includes("bsc");
    return true;
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
        <h1 className="title" style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "var(--ink)" }}>Paper Vault</h1>
        <p className="sub" style={{ margin: "2px 0 0", fontSize: 13.5, color: "var(--ink-soft)" }}>
          Keep your exam and study documents organized.
        </p>
      </div>

      {/* Category Pills */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, marginBottom: 12 }}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            className="tag"
            style={{
              padding: "4px 12px",
              borderRadius: 14,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
              background: filterCategory === cat ? "var(--ink)" : "var(--surface-2)",
              color: filterCategory === cat ? "#ffffff" : "var(--ink-soft)",
              border: "1px solid var(--line)",
            }}
            onClick={() => setFilterCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Search & Upload Controls */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by title, subject, or exam tag…"
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
            background: "var(--marigold)",
            color: "#ffffff",
            border: "none",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {showUpload ? "Cancel" : "+ Upload Paper"}
        </button>
      </div>

      {/* Upload form */}
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

      {/* Paper list */}
      {!papers && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 72, borderRadius: 10 }} />
          ))}
        </div>
      )}

      {papers && filteredPapers.length === 0 && (
        <div style={{ textAlign: "center", padding: "36px 16px", background: "var(--surface-2)", borderRadius: 10, border: "1px dashed var(--line)" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>Your Paper Vault is empty</div>
          <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 2 }}>
            Upload past exam papers, university tests, or practice materials to keep your workspace organized.
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

/* ---------- Extensible Upload Form ---------- */
function UploadForm({ onUploaded, onError }) {
  const [title, setTitle] = useState("");
  const [examTag, setExamTag] = useState("");
  const [subject, setSubject] = useState("");
  const [year, setYear] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef();

  const submit = async (e) => {
    e.preventDefault();
    if (!file || !title.trim()) return;
    setBusy(true);
    try {
      const paper = await api.uploadPaper(file, title.trim(), examTag.trim(), subject.trim(), year ? parseInt(year, 10) : null);
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
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", marginBottom: 12 }}>Upload Paper or Practice Set</div>

      <input
        value={title} onChange={(e) => setTitle(e.target.value)}
        placeholder="Paper title (e.g. Delhi University BSc Maths 2024 or SAT Practice 1)"
        required
        style={{
          width: "100%", padding: "8px 12px", borderRadius: 8,
          border: "1px solid var(--line)", fontSize: 13.5, marginBottom: 8,
        }}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 90px", gap: 8, marginBottom: 12 }}>
        <input
          value={examTag} onChange={(e) => setExamTag(e.target.value)}
          placeholder="Exam / Board (e.g. JEE, SAT, UPSC, CBSE)"
          style={{
            padding: "8px 10px", borderRadius: 8,
            border: "1px solid var(--line)", fontSize: 13, background: "var(--surface)",
          }}
        />

        <input
          value={subject} onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject (e.g. Calculus, Physics)"
          style={{
            padding: "8px 10px", borderRadius: 8,
            border: "1px solid var(--line)", fontSize: 13,
          }}
        />

        <input
          type="number" value={year} onChange={(e) => setYear(e.target.value)}
          placeholder="Year"
          min="1990" max="2099"
          style={{
            padding: "8px 10px", borderRadius: 8,
            border: "1px solid var(--line)", fontSize: 13,
          }}
        />
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          className="btn"
          onClick={() => fileRef.current?.click()}
          style={{ background: "var(--surface-2)", color: "var(--ink)", border: "1px solid var(--line)", fontSize: 12.5 }}
        >
          {file ? file.name.slice(0, 26) : "📁 Choose File"}
        </button>
        <input
          ref={fileRef} type="file" accept=".pdf,.doc,.docx,.jpg,.png"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          style={{ display: "none" }}
        />
        {file && <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{fmtSize(file.size)}</span>}

        <button className="btn" type="submit" disabled={busy || !file || !title.trim()} style={{ marginLeft: "auto", background: "var(--p-gradient)", color: "#fff", border: "none", padding: "8px 18px", borderRadius: 8, fontWeight: 700 }}>
          {busy ? "Uploading…" : "Upload"}
        </button>
      </div>
    </form>
  );
}

/* ---------- Paper Card ---------- */
function PaperCard({ paper, onDelete }) {
  const p = paper;

  const handleDownload = () => {
    window.open(api.downloadPaperUrl(p.id), "_blank");
  };

  return (
    <article className="card" style={{ marginBottom: 0, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--marigold-dark)", marginBottom: 4 }}>
            {p.examTag || "Paper"}{p.subject ? ` · ${p.subject}` : ""}{p.year ? ` · ${p.year}` : ""}
          </div>
          <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: "var(--ink)" }}>{p.title}</p>
        </div>
      </div>

      <div className="meta" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
        <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--ink-soft)" }}>
          <span>{fmtSize(p.fileSize)}</span>
          <span>{p.downloadCount} {p.downloadCount === 1 ? "download" : "downloads"}</span>
          <span>{fmtDate(p.createdAt)}</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            className="btn"
            onClick={handleDownload}
            style={{
              fontSize: 12, padding: "4px 12px",
              background: "var(--marigold)", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600,
            }}
          >
            ↓ Download
          </button>
          <button className="del" onClick={() => onDelete(p.id)} aria-label="Delete" style={{ fontSize: 12, padding: "4px 8px" }}>✕</button>
        </div>
      </div>
    </article>
  );
}
