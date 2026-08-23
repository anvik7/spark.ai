import React, { useRef, useState } from "react";
import html2canvas from "html2canvas";

const TYPE_ICON = { idea: "💡", link: "🔗", "study note": "📚", insight: "✨", goal: "🎯", note: "📝", voice: "🎤", pdf: "📄" };

export function ShareCardPreview({ card }) {
  // Normalize fields from Spark Card object or custom object
  const type = card.type || card.topic || card.kind || "note";
  const content = card.content || card.title || card.summary || card.raw || "";

  return (
    <div style={{
      width: 360, padding: 28,
      background: "linear-gradient(180deg, #FEFBF6 0%, #FDF6E9 100%)",
      border: "1px solid #E5E7EB", borderRadius: 16,
      fontFamily: "Georgia, 'Times New Roman', serif",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 18 }}>
        <span style={{ fontSize: 18 }}>✺</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#7C2D12" }}>Spark.AI</span>
      </div>

      {type && (
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em",
          color: "#D97706", textTransform: "uppercase", marginBottom: 8 }}>
          {TYPE_ICON[type.toLowerCase()] || "📝"} {type}
        </div>
      )}

      <div style={{ fontSize: 20, lineHeight: 1.5, color: "#111827", fontWeight: 500,
        marginBottom: 20, whiteSpace: "pre-wrap" }}>
        {content}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
        fontSize: 11, color: "#9CA3AF", fontFamily: "system-ui, sans-serif",
        borderTop: "1px solid #E5E7EB", paddingTop: 12 }}>
        <span>{card.created_at
          ? new Date(card.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
          : ""}</span>
        <span>spark.ai</span>
      </div>
    </div>
  );
}

export function ShareButton({ card }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);

  const handleShare = async () => {
    if (!ref.current) return;
    setBusy(true);
    try {
      const canvas = await html2canvas(ref.current, { scale: 3, backgroundColor: null });
      canvas.toBlob(async (blob) => {
        if (!blob) return setBusy(false);
        const file = new File([blob], `spark-${card.id || Date.now()}.png`, { type: "image/png" });

        if (navigator.share && navigator.canShare?.({ files: [file] })) {
          try { await navigator.share({ files: [file], title: "Spark.AI" }); }
          catch { /* user cancelled — not an error */ }
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = file.name;
          a.click();
          URL.revokeObjectURL(url);
        }
        setBusy(false);
      }, "image/png");
    } catch (e) {
      console.error("share card export failed", e);
      setBusy(false);
    }
  };

  return (
    <>
      {/* off-screen render so html2canvas captures a clean node, not the live UI with buttons/hover states */}
      <div style={{ position: "fixed", left: -9999, top: 0 }}>
        <div ref={ref}><ShareCardPreview card={card} /></div>
      </div>
      <button onClick={handleShare} disabled={busy} title="Share as image"
        style={{ background: "none", border: "none", cursor: "pointer",
          fontSize: 16, opacity: busy ? 0.5 : 0.7, padding: 4 }}>
        {busy ? "…" : "↗"}
      </button>
    </>
  );
}
