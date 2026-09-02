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

const CATEGORIES = [
  "All",
  "Civil Services",
  "GATE",
  "Engineering",
  "Medical",
  "Management",
  "School",
  "University",
  "Professional",
  "General",
];

const RESOURCE_TYPES = [
  { id: "All", label: "All Types", icon: "📚" },
  { id: "handwritten_notes", label: "Handwritten Notes", icon: "📝" },
  { id: "study_material", label: "Study Material", icon: "📄" },
  { id: "practice_set", label: "Practice Set", icon: "📑" },
  { id: "official_guide", label: "Official Guide", icon: "🏛️" },
  { id: "syllabus", label: "Syllabus", icon: "📋" },
  { id: "lecture_notes", label: "Lecture Notes", icon: "🎓" },
];

export default function Papers({ onOpenUpgrade, onNavigate }) {
  const [activeTab, setActiveTab] = useState("recommended");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedType, setSelectedType] = useState("All");
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
    api.listPapers({
      tab: activeTab,
      category: selectedCategory !== "All" ? selectedCategory : "",
      resource_type: selectedType !== "All" ? selectedType : "",
      query: searchQuery.trim(),
    })
      .then((data) => setPapers(Array.isArray(data) ? data : []))
      .catch((e) => setErr(e.message || "Failed to load study resources."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPapers();
  }, [activeTab, selectedCategory, selectedType]);

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
      }
      setErr(error.message || "Download limit reached.");
    } finally {
      setDownloadingId(null);
    }
  };

  const confirmDeletePaper = async () => {
    if (!deleteTargetId) return;
    setIsDeleting(true);
    try {
      await api.deletePaper(deleteTargetId);
      setPapers((ps) => ps?.filter((p) => p.id !== deleteTargetId) || []);
      if (previewPaper && previewPaper.id === deleteTargetId) setPreviewPaper(null);
      setDeleteTargetId(null);
    } catch (e) {
      setErr(e.message || "Failed to delete resource.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="screen">
      <ConfirmationDialog
        isOpen={Boolean(deleteTargetId)}
        title="Delete resource?"
        description="This will permanently delete this study resource from Spark. This action cannot be undone."
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
          <span>Upload Material</span>
        </button>
      </div>

      {err && (
        <div className="err" style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>⚠️ {err}</span>
          <button onClick={() => setErr("")} style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 700, color: "inherit" }}>✕</button>
        </div>
      )}

      {/* Search & Discovery Filter Bar */}
      <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by subject, topic, exam tag, or handwritten notes text…"
          style={{
            flex: 1,
            padding: "9px 14px",
            borderRadius: 8,
            border: "1px solid var(--line)",
            fontSize: 13.5,
            background: "var(--surface)",
            color: "var(--ink)",
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

      {/* Community Discovery Tabs */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, marginBottom: 14, borderBottom: "1px solid var(--line)" }}>
        {[
          { id: "recommended", label: "Recommended", icon: "⭐" },
          { id: "recent", label: "Recent", icon: "✨" },
          { id: "popular", label: "Popular", icon: "🔥" },
          { id: "handwritten", label: "Handwritten Notes", icon: "📝" },
          { id: "saved", label: "Saved", icon: "🔖" },
          { id: "my_uploads", label: "My Uploads", icon: "👤" },
        ].map((t) => {
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: "6px 12px",
                borderRadius: 20,
                border: isActive ? "1.5px solid var(--marigold)" : "1px solid var(--line)",
                background: isActive ? "var(--marigold-light)" : "var(--surface)",
                color: isActive ? "var(--marigold-dark)" : "var(--ink-soft)",
                fontSize: 12.5,
                fontWeight: isActive ? 700 : 600,
                whiteSpace: "nowrap",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Resource Type Filter Pills */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {RESOURCE_TYPES.map((rt) => {
          const isSelected = selectedType === rt.id;
          return (
            <button
              key={rt.id}
              onClick={() => setSelectedType(rt.id)}
              style={{
                padding: "4px 10px",
                borderRadius: 14,
                border: isSelected ? "1px solid var(--ink)" : "1px solid var(--line)",
                background: isSelected ? "var(--surface-3)" : "var(--surface-2)",
                color: "var(--ink)",
                fontSize: 12,
                fontWeight: isSelected ? 700 : 500,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span>{rt.icon}</span>
              <span>{rt.label}</span>
            </button>
          );
        })}
      </div>

      {/* Resource Grid Stream */}
      {loading && (
        <div style={{ textAlign: "center", padding: "40px 16px", color: "var(--ink-soft)", fontSize: 14 }}>
          <span className="spin" style={{ display: "inline-block", marginRight: 8 }} /> Loading community resources…
        </div>
      )}

      {!loading && papers && papers.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px", background: "var(--surface-2)", borderRadius: 12, border: "1px dashed var(--line)" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📚</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>No study resources found</div>
          <div style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 4 }}>
            Be the first to share handwritten notes or study materials for this topic!
          </div>
          <button
            onClick={() => setShowUpload(true)}
            style={{
              marginTop: 14,
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
            ＋ Upload Study Resource
          </button>
        </div>
      )}

      {!loading && papers && papers.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
          {papers.map((p) => (
            <PaperCard
              key={p.id}
              paper={p}
              onPreview={() => setPreviewPaper(p)}
              onToggleSave={(e) => handleToggleSave(e, p)}
              onDownload={(e) => handleDownload(e, p)}
              isDownloading={downloadingId === p.id}
              onDelete={() => setDeleteTargetId(p.id)}
            />
          ))}
        </div>
      )}

      {/* Upload Resource Drawer */}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onUploaded={(newPaper) => {
            setPapers((prev) => [newPaper, ...(prev || [])]);
            setShowUpload(false);
          }}
          onError={setErr}
        />
      )}

      {/* Resource Inspection & Preview Modal */}
      {previewPaper && (
        <PreviewModal
          paper={previewPaper}
          onClose={() => setPreviewPaper(null)}
          onToggleSave={(e) => handleToggleSave(e, previewPaper)}
          onDownload={(e) => handleDownload(e, previewPaper)}
          onStartStudy={async () => {
            try {
              await api.createStudyFromPaper(previewPaper.id);
              setPreviewPaper(null);
              onNavigate?.("study");
            } catch (err) {
              setErr(err.message || "Failed to start study session from paper.");
            }
          }}
          onReport={() => setReportPaperTarget(previewPaper)}
          onDelete={() => setDeleteTargetId(previewPaper.id)}
        />
      )}

      {/* Report Resource Modal */}
      {reportPaperTarget && (
        <ReportModal
          paper={reportPaperTarget}
          onClose={() => setReportPaperTarget(null)}
          onReported={(msg) => {
            setErr(msg);
            setReportPaperTarget(null);
          }}
        />
      )}
    </div>
  );
}

/* ── Resource Card Component ───────────────────────────── */
function PaperCard({ paper, onPreview, onToggleSave, onDownload, isDownloading, onDelete }) {
  const isHandwritten = paper.resourceType === "handwritten_notes";
  const icon = isHandwritten ? "📝" : paper.resourceType === "practice_set" ? "📑" : "📄";

  return (
    <div
      onClick={onPreview}
      style={{
        background: "var(--surface)",
        border: "1.5px solid var(--line)",
        borderRadius: 12,
        padding: 16,
        boxShadow: "var(--sh-sm)",
        display: "flex",
        flexDirection: "column",
        justify: "space-between",
        cursor: "pointer",
        transition: "all .15s ease",
      }}
    >
      <div>
        {/* Top Badges */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "2px 6px",
                borderRadius: 6,
                background: isHandwritten ? "#FEF3C7" : "var(--surface-3)",
                color: isHandwritten ? "#92400E" : "var(--ink)",
                border: "1px solid var(--line)",
                textTransform: "uppercase",
              }}
            >
              {icon} {paper.resourceType?.replace("_", " ") || "Notes"}
            </span>

            {paper.examTag && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 6px",
                  borderRadius: 6,
                  background: "#ECFDF5",
                  color: "#059669",
                  border: "1px solid #A7F3D0",
                }}
              >
                {paper.examTag}
              </span>
            )}
          </div>

          <button
            onClick={onToggleSave}
            title={paper.isSaved ? "Remove from saved" : "Save resource"}
            style={{
              background: "none",
              border: "none",
              fontSize: 15,
              cursor: "pointer",
              padding: 2,
              color: paper.isSaved ? "var(--marigold-dark)" : "var(--ink-faint)",
            }}
          >
            {paper.isSaved ? "🔖" : "📑"}
          </button>
        </div>

        {/* Title */}
        <h3 style={{ fontSize: 14.5, fontWeight: 700, margin: "0 0 6px", color: "var(--ink)", lineHeight: 1.4 }}>
          {paper.title}
        </h3>

        {/* Subject & Meta */}
        <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 10 }}>
          {paper.subject && <span>{paper.subject} · </span>}
          <span>{paper.pageCount} page(s)</span> · <span>{fmtSize(paper.fileSize)}</span>
        </div>
      </div>

      {/* Footer Info & Actions */}
      <div style={{ paddingTop: 10, borderTop: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 11, color: "var(--ink-faint)" }}>
          <span>Uploaded by {paper.uploaderName}</span>
          <div style={{ fontSize: 10, marginTop: 1 }}>{fmtDate(paper.createdAt)}</div>
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button
            onClick={onDownload}
            disabled={isDownloading}
            title="Download study resource"
            style={{
              padding: "5px 10px",
              borderRadius: 6,
              background: "var(--marigold-light)",
              color: "var(--marigold-dark)",
              border: "1px solid var(--line)",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span>📥</span>
            <span>{paper.downloadCount || 0}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Upload Modal Component ───────────────────────────── */
function UploadModal({ onClose, onUploaded, onError }) {
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [examTag, setExamTag] = useState("");
  const [category, setCategory] = useState("General");
  const [resourceType, setResourceType] = useState("handwritten_notes");
  const [language, setLanguage] = useState("English");
  const [pageCount, setPageCount] = useState(1);
  const [ocrText, setOcrText] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [confirmedRights, setConfirmedRights] = useState(true);
  
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef();

  const submit = async (e) => {
    e.preventDefault();
    if (!file || !title.trim() || !confirmedRights) return;
    setBusy(true);

    const f = new FormData();
    f.append("file", file);
    f.append("title", title.trim());
    f.append("subject", subject.trim());
    f.append("exam_tag", examTag.trim());
    f.append("category", category);
    f.append("resource_type", resourceType);
    f.append("language", language);
    f.append("page_count", pageCount);
    f.append("ocr_text", ocrText.trim());
    f.append("is_public", isPublic);

    try {
      const res = await api.uploadPaper(f);
      onUploaded(res);
    } catch (err) {
      onError(err.message || "Upload failed. Please check permissions and file quota.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "var(--surface)", borderRadius: 14, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", padding: 20, boxShadow: "var(--sh-lg)", border: "1px solid var(--line)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--ink)" }}>Upload Study Resource</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "var(--ink-faint)" }}>✕</button>
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-soft)", display: "block", marginBottom: 4 }}>Resource Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Resource Title"
              required
              style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13.5, background: "var(--surface-2)" }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-soft)", display: "block", marginBottom: 4 }}>Resource Type</label>
              <select
                value={resourceType}
                onChange={(e) => setResourceType(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13, background: "var(--surface-2)" }}
              >
                <option value="handwritten_notes">📝 Handwritten Notes</option>
                <option value="study_material">📄 Question Paper</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-soft)", display: "block", marginBottom: 4 }}>Category / Domain</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13, background: "var(--surface-2)" }}
              >
                {CATEGORIES.filter((c) => c !== "All").map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-soft)", display: "block", marginBottom: 4 }}>Subject / Topic</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject / Topic"
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13, background: "var(--surface-2)" }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-soft)", display: "block", marginBottom: 4 }}>Exam Tag / Target (Optional)</label>
              <input
                value={examTag}
                onChange={(e) => setExamTag(e.target.value)}
                placeholder="Exam Tag"
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13, background: "var(--surface-2)" }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-soft)", display: "block", marginBottom: 4 }}>Extracted Handwritten / OCR Text (Optional for Search)</label>
            <textarea
              value={ocrText}
              onChange={(e) => setOcrText(e.target.value)}
              placeholder="Paste or write key formulas, headings, or readable text from your handwritten notes..."
              rows={2}
              style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13, background: "var(--surface-2)" }}
            />
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
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
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid var(--line)",
                background: "var(--surface-2)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {file ? `📄 ${file.name}` : "📁 Select Document or Scanned Image"}
            </button>
            {file && <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>{fmtSize(file.size)}</span>}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--ink)", marginTop: 4 }}>
            <input
              type="checkbox"
              id="is_public_cb"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
            />
            <label htmlFor="is_public_cb" style={{ cursor: "pointer" }}>
              Share with Spark Community Library (uncheck for Private Vault)
            </label>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--ink-soft)" }}>
            <input
              type="checkbox"
              id="rights_cb"
              checked={confirmedRights}
              onChange={(e) => setConfirmedRights(e.target.checked)}
              required
            />
            <label htmlFor="rights_cb" style={{ cursor: "pointer" }}>
              I confirm I have the right to share this study material and it complies with terms.
            </label>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
            <button type="button" onClick={onClose} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--line)", background: "transparent", cursor: "pointer", fontSize: 13 }}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !file || !title.trim() || !confirmedRights}
              style={{
                padding: "8px 18px",
                borderRadius: 8,
                border: "none",
                background: busy || !file || !title.trim() || !confirmedRights ? "var(--line)" : "var(--p-gradient)",
                color: "#ffffff",
                fontSize: 13.5,
                fontWeight: 700,
                cursor: busy || !file || !title.trim() || !confirmedRights ? "not-allowed" : "pointer",
              }}
            >
              {busy ? "Uploading…" : "Upload Resource"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Preview Modal Component ─────────────────────────── */
function PreviewModal({ paper, onClose, onToggleSave, onDownload, onReport, onDelete }) {
  return (
    <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "var(--surface)", borderRadius: 14, width: "100%", maxWidth: 580, maxHeight: "90vh", overflowY: "auto", padding: 20, boxShadow: "var(--sh-lg)", border: "1px solid var(--line)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--marigold-dark)" }}>
              {paper.resourceType?.replace("_", " ")} · {paper.category}
            </span>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: "4px 0 0", color: "var(--ink)" }}>{paper.title}</h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "var(--ink-faint)" }}>✕</button>
        </div>

        {/* Visual Preview Box */}
        <div style={{ background: "#0F172A", color: "#F8FAFC", borderRadius: 10, padding: 20, textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 42, marginBottom: 6 }}>
            {paper.resourceType === "handwritten_notes" ? "📝" : "📄"}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{paper.fileName}</div>
          <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{fmtSize(paper.fileSize)} · {paper.pageCount} page(s)</div>
        </div>

        {/* Extracted OCR Text Preview */}
        {paper.extractedOcrText && (
          <div style={{ marginBottom: 16, background: "var(--surface-2)", padding: 12, borderRadius: 8, border: "1px solid var(--line)" }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-soft)", display: "block", marginBottom: 4 }}>
              Extracted OCR / Key Text Preview
            </span>
            <div style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.5, fontStyle: "italic", whiteSpace: "pre-wrap" }}>
              "{paper.extractedOcrText}"
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12, borderTop: "1px solid var(--line)" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onToggleSave}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid var(--line)",
                background: "var(--surface-2)",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                color: "var(--ink)",
              }}
            >
              {paper.isSaved ? "🔖 Saved" : "📑 Save Resource"}
            </button>

            <button
              onClick={onReport}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid var(--line)",
                background: "var(--surface-2)",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                color: "var(--ink-soft)",
              }}
            >
              🚩 Report
            </button>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {onStartStudy && (
              <button
                onClick={onStartStudy}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "1.5px solid var(--marigold)",
                  background: "var(--marigold-light)",
                  color: "var(--marigold-dark)",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                🚀 Study Material
              </button>
            )}

            <button
              onClick={onDownload}
              style={{
                padding: "8px 18px",
                borderRadius: 8,
                border: "none",
                background: "var(--p-gradient)",
                color: "#ffffff",
                fontSize: 13.5,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              📥 Download ({paper.downloadCount || 0})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Report Modal Component ─────────────────────────── */
function ReportModal({ paper, onClose, onReported }) {
  const [reason, setReason] = useState("inappropriate");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.reportPaper(paper.id, reason, details.trim());
      onReported(res.message || "Report submitted successfully.");
    } catch (err) {
      onReported("Could not submit report.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "var(--surface)", borderRadius: 14, width: "100%", maxWidth: 440, padding: 20, boxShadow: "var(--sh-lg)", border: "1px solid var(--line)" }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 10px", color: "var(--ink)" }}>Report Material</h3>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 12 }}>
          Help us keep Spark safe. Why are you reporting "{paper.title}"?
        </p>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <select value={reason} onChange={(e) => setReason(e.target.value)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13 }}>
            <option value="inappropriate">Inappropriate / Offensive Content</option>
            <option value="copyrighted">Copyrighted / Unauthorized Material</option>
            <option value="misleading">Misleading or Low-Quality Material</option>
            <option value="other">Other Concern</option>
          </select>

          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Additional details (optional)..."
            rows={2}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13 }}
          />

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
            <button type="button" onClick={onClose} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--line)", background: "transparent", cursor: "pointer", fontSize: 12.5 }}>Cancel</button>
            <button type="submit" disabled={busy} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#DC2626", color: "#ffffff", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
              {busy ? "Submitting…" : "Submit Report"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
