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

// Exact 4 Content Categories Only
const CORE_CATEGORIES = [
  { id: "govt_exams", label: "Indian Government Competitive Exams", icon: "🏛️" },
  { id: "handwritten_notes", label: "Handwritten Notes", icon: "📝" },
  { id: "lecture_notes", label: "Lecture Notes", icon: "🎓" },
  { id: "practice_sets", label: "Practice Sets", icon: "📑" },
];

export default function Papers({ onOpenUpgrade, onNavigate }) {
  const [selectedCategory, setSelectedCategory] = useState("govt_exams");
  const [searchQuery, setSearchQuery] = useState("");
  
  const [papers, setPapers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [err, setErr] = useState("");

  // Modals & Drawers
  const [previewPaper, setPreviewPaper] = useState(null);
  const [reportPaperTarget, setReportPaperTarget] = useState(null);
  const [deleteTargetId, setDeleteTargetId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);

  const loadPapers = () => {
    setLoading(true);
    let mappedType = "";
    if (selectedCategory === "handwritten_notes") mappedType = "handwritten_notes";
    else if (selectedCategory === "lecture_notes") mappedType = "lecture_notes";
    else if (selectedCategory === "practice_sets") mappedType = "practice_set";

    api.listPapers({
      tab: selectedCategory === "govt_exams" ? "all" : "",
      category: selectedCategory === "govt_exams" ? "Govt Exam" : "",
      resource_type: mappedType,
      query: searchQuery.trim(),
    })
      .then((data) => setPapers(Array.isArray(data) ? data : []))
      .catch((e) => setErr(e.message || "Failed to load examination resources."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPapers();
  }, [selectedCategory]);

  const handleSearchSubmit = (e) => {
    e?.preventDefault();
    loadPapers();
  };

  const handleToggleSave = async (e, paper) => {
    e.stopPropagation();
    try {
      const res = await api.bookmarkPaper(paper.id);
      setPapers((prev) =>
        (prev || []).map((p) =>
          p.id === paper.id ? { ...p, isSaved: res.isSaved, saveCount: res.saveCount } : p
        )
      );
      if (previewPaper && previewPaper.id === paper.id) {
        setPreviewPaper((prev) => ({ ...prev, isSaved: res.isSaved, saveCount: res.saveCount }));
      }
    } catch (error) {
      setErr(error.message || "Failed to save resource.");
    }
  };

  const handleDownload = async (e, paper) => {
    e.stopPropagation();
    setDownloadingId(paper.id);
    setErr("");
    try {
      const res = await api.downloadPaper(paper.id);
      if (res && res.download_url) {
        window.open(res.download_url, "_blank");
      }
      setPapers((prev) =>
        (prev || []).map((p) => (p.id === paper.id ? { ...p, downloadCount: p.downloadCount + 1 } : p))
      );
    } catch (error) {
      if (error.message?.includes("402") || error.message?.toLowerCase().includes("quota") || error.message?.toLowerCase().includes("limit")) {
        onOpenUpgrade?.();
      } else {
        setErr(error.message || "Failed to download paper.");
      }
    } finally {
      setDownloadingId(null);
    }
  };

  const confirmDeletePaper = async () => {
    if (!deleteTargetId) return;
    setIsDeleting(true);
    try {
      await api.deletePaper(deleteTargetId);
      setPapers((prev) => (prev || []).filter((p) => p.id !== deleteTargetId));
      setDeleteTargetId(null);
      if (previewPaper && previewPaper.id === deleteTargetId) setPreviewPaper(null);
    } catch (e) {
      setErr(e.message || "Failed to delete paper.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="screen">
      <ConfirmationDialog
        isOpen={Boolean(deleteTargetId)}
        title="Delete resource?"
        description="This will permanently delete this resource. This action cannot be undone."
        confirmLabel="Delete resource"
        cancelLabel="Cancel"
        isDanger={true}
        busy={isDeleting}
        onConfirm={confirmDeletePaper}
        onCancel={() => setDeleteTargetId(null)}
      />

      {/* Header */}
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <h1 className="title" style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "var(--ink)" }}>
            Paper Vault
          </h1>
          <p className="sub" style={{ margin: "2px 0 0", fontSize: 13.5, color: "var(--ink-soft)" }}>
            Question papers and handwritten notes for Indian competitive examinations.
          </p>
        </div>

        <button
          onClick={() => setShowUpload(true)}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            background: "var(--p-gradient)",
            color: "#ffffff",
            border: "none",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
          }}
        >
          <span>＋</span>
          <span>Upload</span>
        </button>
      </div>

      {err && (
        <div className="err" style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>⚠️ {err}</span>
          <button onClick={() => setErr("")} style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 700, color: "inherit" }}>✕</button>
        </div>
      )}

      {/* Search Bar */}
      <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search question papers, notes, or exams..."
          style={{
            flex: 1,
            padding: "9px 14px",
            borderRadius: 8,
            border: "1px solid var(--line)",
            fontSize: 13.5,
            background: "var(--surface)",
            color: "var(--ink)",
            boxSizing: "border-box",
          }}
        />
        <button
          type="submit"
          style={{
            padding: "9px 16px",
            borderRadius: 8,
            border: "1px solid var(--line)",
            background: "var(--surface-2)",
            color: "var(--ink)",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          🔍 Search
        </button>
      </form>

      {/* Exact 4 Core Category Chips */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {CORE_CATEGORIES.map((cat) => {
          const isSelected = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              style={{
                padding: "8px 14px",
                borderRadius: 20,
                border: isSelected ? "1.5px solid var(--marigold)" : "1px solid var(--line)",
                background: isSelected ? "var(--marigold-light)" : "var(--surface)",
                color: isSelected ? "var(--marigold-dark)" : "var(--ink)",
                fontSize: 13,
                fontWeight: isSelected ? 700 : 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                transition: "all .15s ease",
              }}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Material Grid */}
      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: "var(--ink-soft)", fontSize: 14 }}>
          <span className="spin" style={{ display: "inline-block", marginRight: 8 }} /> Loading examination materials…
        </div>
      )}

      {!loading && (!papers || papers.length === 0) && (
        <div style={{ padding: 40, textAlign: "center", background: "var(--surface-2)", borderRadius: 12, border: "1px dashed var(--line)" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📑</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>No materials found</div>
          <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 4 }}>
            Try searching for a different topic or upload handwritten notes to share with fellow learners.
          </div>
        </div>
      )}

      {!loading && papers && papers.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
          {papers.map((p) => (
            <div
              key={p.id}
              onClick={() => setPreviewPaper(p)}
              style={{
                background: "var(--surface)",
                border: "1.5px solid var(--line)",
                borderRadius: 12,
                padding: 16,
                boxShadow: "var(--sh-sm)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                cursor: "pointer",
                transition: "all .2s ease",
              }}
            >
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "3px 8px",
                      borderRadius: 12,
                      background: p.resource_type === "handwritten_notes" ? "var(--marigold-light)" : "var(--surface-2)",
                      color: p.resource_type === "handwritten_notes" ? "var(--marigold-dark)" : "var(--ink-soft)",
                      border: "1px solid var(--line)",
                      textTransform: "capitalize",
                    }}
                  >
                    {p.resource_type ? p.resource_type.replace("_", " ") : "Paper"}
                  </span>

                  <button
                    onClick={(e) => handleToggleSave(e, p)}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16 }}
                    title={p.isSaved ? "Saved" : "Save resource"}
                  >
                    {p.isSaved ? "🔖" : "🏷️"}
                  </button>
                </div>

                <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 6px", color: "var(--ink)", lineHeight: 1.4 }}>
                  {p.title}
                </h3>

                <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 12, lineHeight: 1.5 }}>
                  {p.subject && <span>{p.subject}</span>}
                  {p.examTag && <span> · {p.examTag}</span>}
                </div>
              </div>

              <div style={{ paddingTop: 10, borderTop: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>
                  {fmtSize(p.file_size)} · {fmtDate(p.created_at)}
                </span>

                <button
                  onClick={(e) => handleDownload(e, p)}
                  disabled={downloadingId === p.id}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--line)",
                    background: "var(--surface-2)",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--ink)",
                    cursor: "pointer",
                  }}
                >
                  {downloadingId === p.id ? "…" : "Download"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Resource Modal */}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onUploaded={() => {
            setShowUpload(false);
            loadPapers();
          }}
          onError={setErr}
        />
      )}

      {/* Resource Detail & Preview Drawer Modal */}
      {previewPaper && (
        <PreviewModal
          paper={previewPaper}
          onClose={() => setPreviewPaper(null)}
          onDownload={(e) => handleDownload(e, previewPaper)}
          onBookmark={(e) => handleToggleSave(e, previewPaper)}
          onReport={() => setReportPaperTarget(previewPaper)}
          onDelete={(id) => setDeleteTargetId(id)}
          onNavigate={onNavigate}
        />
      )}

      {/* Report Resource Modal */}
      {reportPaperTarget && (
        <ReportModal
          paper={reportPaperTarget}
          onClose={() => setReportPaperTarget(null)}
          onReported={() => {
            setReportPaperTarget(null);
            setErr("Report submitted. Thank you for keeping Paper Vault safe.");
          }}
        />
      )}
    </div>
  );
}

/* ---------- Upload Resource Modal ---------- */
function UploadModal({ onClose, onUploaded, onError }) {
  const [title, setTitle] = useState("");
  const [resourceType, setResourceType] = useState("handwritten_notes");
  const [subject, setSubject] = useState("");
  const [examTag, setExamTag] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile || !title.trim()) return;

    setBusy(true);
    try {
      const f = new FormData();
      f.append("file", selectedFile);
      f.append("title", title.trim());
      f.append("resource_type", resourceType);
      f.append("category", "Govt Exam");
      f.append("subject", subject.trim());
      f.append("exam_tag", examTag.trim());

      await api.uploadPaper(f);
      onUploaded();
    } catch (err) {
      onError(err.message || "Failed to upload material.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--ink)" }}>Upload Material</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-soft)", display: "block", marginBottom: 4 }}>Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Resource Title"
              required
              style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13.5, background: "var(--surface-2)", boxSizing: "border-box" }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-soft)", display: "block", marginBottom: 4 }}>Category</label>
              <select
                value={resourceType}
                onChange={(e) => setResourceType(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13, background: "var(--surface-2)" }}
              >
                <option value="handwritten_notes">📝 Handwritten Notes</option>
                <option value="govt_exam">🏛️ Question Paper</option>
                <option value="lecture_notes">🎓 Lecture Notes</option>
                <option value="practice_set">📑 Practice Set</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-soft)", display: "block", marginBottom: 4 }}>Subject / Topic</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject / Topic"
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13, background: "var(--surface-2)", boxSizing: "border-box" }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-soft)", display: "block", marginBottom: 4 }}>Exam Tag (Optional)</label>
            <input
              value={examTag}
              onChange={(e) => setExamTag(e.target.value)}
              placeholder="Exam Tag"
              style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13, background: "var(--surface-2)", boxSizing: "border-box" }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-soft)", display: "block", marginBottom: 4 }}>File Document / Image *</label>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              required
              style={{ width: "100%", fontSize: 13 }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
            <button type="button" onClick={onClose} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--line)", background: "transparent", cursor: "pointer" }}>Cancel</button>
            <button type="submit" disabled={busy || !selectedFile || !title.trim()} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--p-gradient)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
              {busy ? "Uploading…" : "Upload"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------- Preview Modal ---------- */
function PreviewModal({ paper, onClose, onDownload, onBookmark, onReport, onDelete, onNavigate }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--marigold-dark)", letterSpacing: ".05em" }}>
              {paper.resource_type ? paper.resource_type.replace("_", " ") : "Paper"}
            </span>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: "2px 0 0", color: "var(--ink)" }}>{paper.title}</h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 14 }}>
          {paper.subject && <div>Subject: {paper.subject}</div>}
          {paper.examTag && <div>Exam Tag: {paper.examTag}</div>}
          <div>File Size: {fmtSize(paper.file_size)}</div>
          <div>Uploaded: {fmtDate(paper.created_at)}</div>
        </div>

        {paper.extracted_ocr_text && (
          <div style={{ background: "var(--surface-2)", padding: 12, borderRadius: 8, maxHeight: 160, overflowY: "auto", fontSize: 12.5, color: "var(--ink)", marginBottom: 16, border: "1px solid var(--line)" }}>
            <b>Extracted Text Preview:</b>
            <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{paper.extracted_ocr_text.slice(0, 500)}...</p>
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={onBookmark} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface-2)", fontSize: 12.5, cursor: "pointer" }}>
              {paper.isSaved ? "🔖 Saved" : "🏷️ Save"}
            </button>
            <button onClick={onReport} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface-2)", fontSize: 12.5, cursor: "pointer" }}>
              🚨 Report
            </button>
            {paper.is_owner && (
              <button onClick={() => onDelete(paper.id)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #FCA5A5", background: "#FEF2F2", color: "#DC2626", fontSize: 12.5, cursor: "pointer" }}>
                🗑️ Delete
              </button>
            )}
          </div>

          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => {
                onClose();
                api.createStudyFromPaper(paper.id).then(() => onNavigate?.("study")).catch(() => {});
              }}
              style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--marigold)", background: "var(--marigold-light)", color: "var(--marigold-dark)", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}
            >
              🚀 Study
            </button>
            <button onClick={onDownload} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "var(--p-gradient)", color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
              Download
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Report Modal ---------- */
function ReportModal({ paper, onClose, onReported }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) return;
    setBusy(true);
    try {
      await api.reportPaper(paper.id, reason.trim());
      onReported();
    } catch {
      onReported();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <h3 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 700 }}>Report Resource</h3>
        <form onSubmit={handleSubmit}>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for reporting..."
            rows={3}
            required
            style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13, marginBottom: 12, boxSizing: "border-box" }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" onClick={onClose} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "transparent" }}>Cancel</button>
            <button type="submit" disabled={busy} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#DC2626", color: "#fff", fontWeight: 700 }}>Submit Report</button>
          </div>
        </form>
      </div>
    </div>
  );
}
