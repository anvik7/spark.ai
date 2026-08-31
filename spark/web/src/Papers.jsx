import React, { useEffect, useState, useRef } from "react";
import { api } from "./api.js";

const EXAMS = ["JEE", "NEET", "GATE", "UPSC", "CAT", "CLAT", "Other"];

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
  const [filterExam, setFilterExam] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [err, setErr] = useState("");

  const load = () => {
    const params = {};
    if (filterExam) params.exam_tag = filterExam;
    if (filterSubject) params.subject = filterSubject;
    api.listPapers(params).then(setPapers).catch((e) => setErr(e.message));
  };

  useEffect(() => { load(); }, [filterExam, filterSubject]);

  const handleDelete = async (id) => {
    if (!confirm("Delete this paper? This cannot be undone.")) return;
    try {
      await api.deletePaper(id);
      setPapers((ps) => ps.filter((p) => p.id !== id));
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <div className="screen">
      <div style={{ marginBottom: 20 }}>
        <h1 className="title" style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "var(--ink)" }}>Paper Vault</h1>
        <p className="sub" style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--ink-soft)" }}>
          Upload, organize, and download previous exam papers and practice materials.
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        <button
          className="tag"
          style={!filterExam ? { background: "var(--ink)", color: "#fff" } : {}}
          onClick={() => setFilterExam("")}
        >
          All exams
        </button>
        {EXAMS.map((e) => (
          <button
            className="tag"
            key={e}
            style={filterExam === e ? { background: "var(--ink)", color: "#fff" } : {}}
            onClick={() => setFilterExam(filterExam === e ? "" : e)}
          >
            {e}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          value={filterSubject}
          onChange={(e) => setFilterSubject(e.target.value)}
          placeholder="Filter by subject…"
          style={{
            flex: 1, padding: "8px 12px", borderRadius: 8,
            border: "1px solid var(--line)", fontSize: 13.5,
          }}
        />
        <button className="btn" onClick={() => setShowUpload((s) => !s)}>
          {showUpload ? "Cancel" : "+ Upload"}
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
          {err}
          <button onClick={() => setErr("")} style={{ marginLeft: 8, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>✕</button>
        </div>
      )}

      {/* Paper list */}
      {!papers && (
        <>
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 80, marginBottom: 12, borderRadius: "var(--r)" }} />
          ))}
        </>
      )}

      {papers && papers.length === 0 && (
        <div className="empty">
          No papers yet.
          <br />
          Be the first to upload one!
        </div>
      )}

      {papers && papers.map((p) => (
        <PaperCard key={p.id} paper={p} onDelete={handleDelete} />
      ))}
    </div>
  );
}

/* ---------- Upload Form ---------- */
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
      const paper = await api.uploadPaper(file, title.trim(), examTag, subject, year || null);
      onUploaded(paper);
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{
      background: "var(--surface-2)", borderRadius: "var(--r)", padding: 16,
      marginBottom: 16, border: "1px solid var(--line)",
    }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>Upload a paper</div>

      <input
        value={title} onChange={(e) => setTitle(e.target.value)}
        placeholder="Paper title (e.g. JEE Main 2024 Physics)"
        required
        style={{
          width: "100%", padding: "8px 12px", borderRadius: 8,
          border: "1px solid var(--line)", fontSize: 13.5, marginBottom: 8,
        }}
      />

      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <select
          value={examTag} onChange={(e) => setExamTag(e.target.value)}
          style={{
            flex: 1, padding: "8px 10px", borderRadius: 8,
            border: "1px solid var(--line)", fontSize: 13, background: "var(--surface)",
          }}
        >
          <option value="">Exam (optional)</option>
          {EXAMS.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>

        <input
          value={subject} onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          style={{
            flex: 1, padding: "8px 12px", borderRadius: 8,
            border: "1px solid var(--line)", fontSize: 13.5,
          }}
        />

        <input
          type="number" value={year} onChange={(e) => setYear(e.target.value)}
          placeholder="Year"
          min="1990" max="2099"
          style={{
            width: 80, padding: "8px 10px", borderRadius: 8,
            border: "1px solid var(--line)", fontSize: 13.5,
          }}
        />
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          className="btn"
          onClick={() => fileRef.current?.click()}
          style={{ background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--line)" }}
        >
          {file ? file.name.slice(0, 30) : "Choose file"}
        </button>
        <input
          ref={fileRef} type="file" accept=".pdf,.doc,.docx,.jpg,.png"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          style={{ display: "none" }}
        />
        {file && <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{fmtSize(file.size)}</span>}

        <button className="btn" type="submit" disabled={busy || !file || !title.trim()} style={{ marginLeft: "auto" }}>
          {busy ? <span className="spin" /> : "Upload"}
        </button>
      </div>
    </form>
  );
}

/* ---------- Paper Card ---------- */
function PaperCard({ paper, onDelete }) {
  const p = paper;

  const handleDownload = () => {
    // Opens presigned URL in new tab — triggers browser download
    window.open(api.downloadPaperUrl(p.id), "_blank");
  };

  return (
    <article className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="eyebrow" style={{ margin: 0 }}>
            {p.examTag || "Paper"}{p.subject ? ` · ${p.subject}` : ""}{p.year ? ` · ${p.year}` : ""}
          </span>
          <p className="summary" style={{ marginTop: 4 }}>{p.title}</p>
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
              background: "var(--marigold)", color: "#fff", border: "none",
            }}
          >
            ↓ Download
          </button>
          <button className="del" onClick={() => onDelete(p.id)} aria-label="Delete">✕</button>
        </div>
      </div>
    </article>
  );
}
