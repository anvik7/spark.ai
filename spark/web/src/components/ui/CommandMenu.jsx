import React, { useState, useEffect } from "react";
import { api } from "../../api";

export default function CommandMenu({ isOpen, onClose, onNavigate }) {
  const [query, setQuery] = useState("");
  const [captures, setCaptures] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (isOpen) onClose();
        else setQuery("");
      }
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    Promise.all([
      api.getCards().catch(() => []),
      api.getTasks().catch(() => []),
    ]).then(([cardsData, tasksData]) => {
      setCaptures(cardsData || []);
      setTasks(tasksData?.tasks || tasksData || []);
    }).finally(() => setLoading(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const q = query.trim().toLowerCase();

  const navItems = [
    { id: "capture", label: "Go to Capture", icon: "✏️", category: "Navigation" },
    { id: "tasks", label: "Go to Tasks", icon: "📋", category: "Navigation" },
    { id: "study", label: "Go to Study", icon: "⏱️", category: "Navigation" },
    { id: "papers", label: "Go to Papers", icon: "📚", category: "Navigation" },
    { id: "circles", label: "Go to Circles", icon: "👥", category: "Navigation" },
    { id: "career", label: "Go to Career", icon: "🎯", category: "Navigation" },
    { id: "coach", label: "Go to Coach", icon: "💬", category: "Navigation" },
  ].filter((item) => !q || item.label.toLowerCase().includes(q));

  const filteredCaptures = captures.filter((c) =>
    !q || (c.title && c.title.toLowerCase().includes(q)) || (c.summary && c.summary.toLowerCase().includes(q)) || (c.raw && c.raw.toLowerCase().includes(q))
  ).slice(0, 5);

  const filteredTasks = tasks.filter((t) =>
    !q || (t.title && t.title.toLowerCase().includes(q))
  ).slice(0, 5);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 580, padding: 0, overflow: "hidden", borderRadius: 14 }}
      >
        {/* Search Header */}
        <div style={{ display: "flex", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid var(--line)" }}>
          <span style={{ fontSize: 18, marginRight: 10, color: "var(--ink-soft)" }}>🔍</span>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search captures, tasks, or navigate workspace... (⌘K)"
            style={{
              flex: 1,
              border: "none",
              background: "transparent",
              fontSize: 15,
              fontWeight: 500,
              color: "var(--ink)",
              outline: "none",
            }}
          />
          <kbd
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--line)",
              borderRadius: 6,
              padding: "2px 6px",
              fontSize: 11,
              fontFamily: "var(--sans)",
              color: "var(--ink-soft)",
            }}
          >
            ESC
          </kbd>
        </div>

        {/* Search Results */}
        <div style={{ maxHeight: 380, overflowY: "auto", padding: "8px 0" }}>
          {loading && (
            <div style={{ padding: "20px", textAlign: "center", fontSize: 13, color: "var(--ink-soft)" }}>
              Searching workspace…
            </div>
          )}

          {!loading && (
            <>
              {/* Navigation Actions */}
              {navItems.length > 0 && (
                <div style={{ padding: "4px 12px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--ink-faint)", padding: "4px 8px" }}>
                    Navigation
                  </div>
                  {navItems.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => { onNavigate(item.id); onClose(); }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 12px",
                        borderRadius: 8,
                        cursor: "pointer",
                        fontSize: 13.5,
                        fontWeight: 600,
                        color: "var(--ink)",
                        transition: "background .12s",
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-2)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      <span>{item.icon}</span>
                      <span style={{ flex: 1 }}>{item.label}</span>
                      <span style={{ fontSize: 11, color: "var(--ink-faint)" }}>Jump to</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Captures */}
              {filteredCaptures.length > 0 && (
                <div style={{ padding: "4px 12px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--ink-faint)", padding: "4px 8px" }}>
                    Captures ({filteredCaptures.length})
                  </div>
                  {filteredCaptures.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => { onNavigate("capture"); onClose(); }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 12px",
                        borderRadius: 8,
                        cursor: "pointer",
                        fontSize: 13.5,
                        color: "var(--ink)",
                        transition: "background .12s",
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-2)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      <span>📝</span>
                      <div style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <span style={{ fontWeight: 600 }}>{c.title || c.summary || c.raw || "Untitled Capture"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Tasks */}
              {filteredTasks.length > 0 && (
                <div style={{ padding: "4px 12px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--ink-faint)", padding: "4px 8px" }}>
                    Tasks ({filteredTasks.length})
                  </div>
                  {filteredTasks.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => { onNavigate("tasks"); onClose(); }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 12px",
                        borderRadius: 8,
                        cursor: "pointer",
                        fontSize: 13.5,
                        color: "var(--ink)",
                        transition: "background .12s",
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-2)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      <span>{t.completed ? "✅" : "📋"}</span>
                      <div style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <span style={{ fontWeight: 600, textDecoration: t.completed ? "line-through" : "none" }}>{t.title}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {navItems.length === 0 && filteredCaptures.length === 0 && filteredTasks.length === 0 && (
                <div style={{ padding: "24px", textAlign: "center", fontSize: 13.5, color: "var(--ink-soft)" }}>
                  No results found for "{query}". Try a different search term.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
