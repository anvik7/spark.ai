import React, { useState } from "react";
import Review from "./Review.jsx";
import Practice from "./Practice.jsx";

export default function Study({ initialTab = "review", onNavigate }) {
  const [activeTab, setActiveTab] = useState(initialTab); // "review" | "practice"

  return (
    <div className="screen study-screen" style={{ maxWidth: 920, margin: "0 auto", paddingBottom: 40 }}>
      {/* Study Header */}
      <div style={{ marginBottom: 20 }}>
        <div className="eyebrow" style={{ color: "var(--primary, #6366F1)", fontWeight: 700 }}>
          Study & Mastery
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 className="title" style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "var(--ink)" }}>
              Study Center
            </h1>
            <p className="sub" style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--ink-soft)" }}>
              Spaced repetition memory review and interactive AI problem practice.
            </p>
          </div>

          {/* Segmented Tab Switcher */}
          <div
            style={{
              display: "inline-flex",
              background: "var(--surface-2)",
              border: "1px solid var(--line)",
              borderRadius: 10,
              padding: 3,
              gap: 2,
            }}
            role="tablist"
          >
            <button
              role="tab"
              aria-selected={activeTab === "review"}
              onClick={() => setActiveTab("review")}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: activeTab === "review" ? 700 : 500,
                border: "none",
                background: activeTab === "review" ? "var(--surface)" : "transparent",
                color: activeTab === "review" ? "var(--ink)" : "var(--ink-soft)",
                boxShadow: activeTab === "review" ? "var(--sh-sm)" : "none",
                cursor: "pointer",
                transition: "all .15s ease",
              }}
            >
              Daily Review
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "practice"}
              onClick={() => setActiveTab("practice")}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: activeTab === "practice" ? 700 : 500,
                border: "none",
                background: activeTab === "practice" ? "var(--surface)" : "transparent",
                color: activeTab === "practice" ? "var(--ink)" : "var(--ink-soft)",
                boxShadow: activeTab === "practice" ? "var(--sh-sm)" : "none",
                cursor: "pointer",
                transition: "all .15s ease",
              }}
            >
              Practice & Solver
            </button>
          </div>
        </div>
      </div>

      {/* Tab Panels */}
      {activeTab === "review" ? (
        <div role="tabpanel">
          <Review />
        </div>
      ) : (
        <div role="tabpanel">
          <Practice />
        </div>
      )}
    </div>
  );
}
