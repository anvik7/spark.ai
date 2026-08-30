import React, { useEffect, useRef, useState } from "react";
import { api, setToken, hasToken } from "./api.js";
import { Chakra } from "./Chakra.jsx";
import Career from "./Career.jsx";
import Interview from "./Interview.jsx";
import Heatmap from "./Heatmap.jsx";
import Landing from "./Landing.jsx";
import Capture from "./Capture.jsx";
import Upgrade from "./Upgrade.jsx";
import Login from "./Login.jsx";
import Signup from "./Signup.jsx";
import Account from "./Account.jsx";
import Papers from "./Papers.jsx";
import Circles from "./Circles.jsx";
import { ShareButton } from "./ShareCard.jsx";
import StudyTracker from "./components/StudyTracker";
import Avatar from "./components/Avatar.jsx";

/* ---------- tiny inline icons ---------- */
const Ico = {
  pen: <path d="M4 20h4L18 10l-4-4L4 16v4Z M14 6l4 4" />,
  cards: <path d="M4 7h16v13H4z M4 7l2-3h12l2 3 M8 12h8 M8 16h5" />,
  study: <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z" />,
  mic: <path d="M12 4a3 3 0 0 1 3 3v4a3 3 0 0 1-6 0V7a3 3 0 0 1 3-3Z M6 11a6 6 0 0 0 12 0 M12 17v3" />,
  paper: <path d="M14 3v5h5 M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-5Z" />,
  career: <path d="M12 3l2.5 5 5.5.8-4 3.9 1 5.5-5-2.6-5 2.6 1-5.5-4-3.9 5.5-.8z" />,
  coach: <path d="M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M4 21v-1a6 6 0 0 1 12 0v1 M18 8l2 2-2 2" />,
  circles: <><circle cx="8" cy="8" r="3" /><circle cx="16" cy="8" r="3" /><circle cx="12" cy="16" r="3" /><path d="M10.5 10.5l1.5 2.5 M13.5 10.5l-1.5 2.5" /></>,
  account: <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />,
};

const Svg = ({ d, cls = "ico" }) => (
  <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);

export function relativeTime(isoOrDate) {
  if (!isoOrDate) return "Just now";
  const d = new Date(isoOrDate);
  if (isNaN(d.getTime())) return "Just now";
  const now = new Date();
  const diffSec = Math.floor((now - d) / 1000);
  if (diffSec < 45) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hours ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)} days ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function fmtDate(s) {
  if (!s) return "";
  const d = new Date(s);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/* ===================================================================== */
export default function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState("signup");
  const [tab, setTab] = useState("capture");
  const [toast, setToast] = useState("");
  const [refreshCards, setRefreshCards] = useState(0);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showAccount, setShowAccount] = useState(false);

  useEffect(() => {
    if (!hasToken()) { setBooting(false); return; }
    api.me().then(setUser).catch(() => setToken("")).finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    if (user?.avatar_url) {
      document.body.setAttribute("data-persona", user.avatar_url);
    } else {
      document.body.removeAttribute("data-persona");
    }
  }, [user?.avatar_url]);

  useEffect(() => {
    const onUnauthorized = () => { setUser(null); setShowAuth(true); };
    window.addEventListener("spark:unauthorized", onUnauthorized);
    return () => window.removeEventListener("spark:unauthorized", onUnauthorized);
  }, []);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2600); };
  const reload = () => setRefreshCards((r) => r + 1);
  const refreshUser = () => api.me().then(setUser).catch(() => { });

  const handleNav = (targetTab) => {
    setShowUpgrade(false);
    setShowAccount(false);
    setTab(targetTab);
  };

  if (booting) return <div className="empty" style={{ paddingTop: 120 }}>Loading…</div>;
  if (!user) {
    return showAuth ? (
      <Auth
        onAuthed={(u) => setUser(u)}
        onBackToHome={() => setShowAuth(false)}
        initialMode={authMode}
      />
    ) : (
      <Landing
        onGetStarted={() => { setAuthMode("signup"); setShowAuth(true); }}
        onLogin={() => { setAuthMode("login"); setShowAuth(true); }}
      />
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="wordmark" onClick={() => { setShowUpgrade(false); setShowAccount(false); setTab("capture"); }} style={{ cursor: "pointer" }}>
          <Chakra size={22} /><span className="logo-mark">Spark</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className={`plan-chip ${user.plan === "pro" ? "pro" : ""}`}
            onClick={() => { setShowAccount(false); setShowUpgrade(true); }}>
            {user.plan === "pro" ? "Pro" : `Free · ${user.card_count}/${user.free_card_limit}`}
          </button>
          <button
            className={`nav-btn ${showAccount ? "active" : ""}`}
            style={{ padding: 2, borderRadius: "50%", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={() => { setShowUpgrade(false); setShowAccount(a => !a); }}
            title="Account"
          >
            <Avatar src={user?.avatar_url} name={user?.name || "User"} size={28} />
          </button>
        </div>
      </header>

      {showAccount ? (
        <Account
          user={user}
          onLogout={() => { setShowAccount(false); setUser(null); }}
          onUpdateUser={(updated) => setUser(prev => ({ ...prev, ...updated }))}
        />
      ) : showUpgrade ? (
        <Upgrade user={user} onUpgraded={() => { setShowUpgrade(false); refreshUser(); }} onBack={() => setShowUpgrade(false)} />
      ) : (
        <>
          {tab === "capture" && <Capture onSaved={() => { setRefreshCards(r => r + 1); refreshUser(); }} />}
          {tab === "cards" && <Cards key={refreshCards} flash={flash} onChange={refreshUser} />}
          {tab === "study" && <StudyTracker />}
          {tab === "papers" && <Papers />}
          {tab === "circles" && <Circles />}
          {tab === "career" && <Career onNavigate={handleNav} user={user} />}
          {tab === "coach" && <Interview />}
        </>
      )}

      {toast && <div className="toast">{toast}</div>}

      <nav className="nav">
        <NavBtn id="capture" tab={showAccount || showUpgrade ? null : tab} set={handleNav} icon={Ico.pen} label="Capture" />
        <NavBtn id="cards" tab={showAccount || showUpgrade ? null : tab} set={handleNav} icon={Ico.cards} label="Cards" />
        <NavBtn id="study" tab={showAccount || showUpgrade ? null : tab} set={handleNav} icon={Ico.study} label="Study" />
        <NavBtn id="papers" tab={showAccount || showUpgrade ? null : tab} set={handleNav} icon={Ico.paper} label="Papers" />
        <NavBtn id="circles" tab={showAccount || showUpgrade ? null : tab} set={handleNav} icon={Ico.circles} label="Circles" />
        <NavBtn id="career" tab={showAccount || showUpgrade ? null : tab} set={handleNav} icon={Ico.career} label="Career" />
        <NavBtn id="coach" tab={showAccount || showUpgrade ? null : tab} set={handleNav} icon={Ico.coach} label="Coach" />
      </nav>
    </div>
  );
}

function NavBtn({ id, tab, set, icon, label }) {
  return (
    <button className={tab === id ? "nav-btn active" : "nav-btn"} onClick={() => set(id)}>
      <Svg d={icon} cls="ico" /><span>{label}</span><span className="dot" />
    </button>
  );
}

/* ---------- Auth ---------- */
function Auth({ onAuthed, onBackToHome, initialMode = "signup" }) {
  const [mode, setMode] = useState(initialMode);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const handleAuth = (user) => {
    setToken(localStorage.getItem("spark_token"));
    onAuthed(user);
  };

  if (mode === "login") {
    return <Login onAuthed={handleAuth} goToSignup={() => setMode("signup")} onBackToHome={onBackToHome} />;
  }
  return <Signup onAuthed={handleAuth} goToLogin={() => setMode("login")} onBackToHome={onBackToHome} />;
}

/* ---------- Card list & Reusable Card Component ---------- */
const KIND_LABEL = { text: "Note", link: "Link", image: "Image", voice: "Voice", pdf: "PDF", github: "GitHub", idea: "Idea", insight: "Insight", goal: "Goal" };
const DIFF_LABEL = ["", "Intro", "Easy", "Medium", "Hard", "Expert"];

export function CardView({ c, onDelete, onUpdate }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(c.raw || c.title || c.summary || "");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const rawText = c.raw || c.title || c.summary || "";
  const isLong = rawText.length > 220;
  const displayContent = expanded || !isLong ? rawText : rawText.slice(0, 220) + "…";
  const kind = c.kind || (c.topic ? c.topic.toLowerCase() : "text");
  const kindLabel = KIND_LABEL[kind] || (c.topic ? c.topic : "Note");

  const handleSaveEdit = async () => {
    if (!editText.trim()) return;
    setSaving(true);
    try {
      const updated = await api.updateCard(c.id, { raw: editText.trim() });
      onUpdate?.(updated || { ...c, raw: editText.trim() });
      setEditing(false);
    } catch (err) {
      alert(err.message || "Failed to update card");
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className={`card kind-${kind}`} style={{ position: "relative" }}>
      {/* Card Header with ⋯ Action Menu */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {c.user_name && (
            <Avatar src={c.user_avatar} name={c.user_name} size={22} />
          )}
          <span className="eyebrow" style={{ margin: 0 }}>
            {kindLabel}{c.topic && c.topic.toLowerCase() !== kind ? ` · ${c.topic}` : ""}
          </span>
          <span className="date" style={{ fontSize: 11.5, color: "var(--ink-faint)" }}>
            · {relativeTime(c.created_at)}
          </span>
        </div>

        {/* ⋯ Action Menu Button & Dropdown */}
        <div ref={menuRef} style={{ position: "relative" }}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            title="Card options"
            aria-label="Card options"
            style={{
              background: menuOpen ? "var(--surface-3)" : "none",
              border: "none",
              borderRadius: "50%",
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "var(--ink-soft)",
              fontSize: 16,
              lineHeight: 1,
              transition: "background .15s",
            }}
          >
            ⋯
          </button>

          {menuOpen && (
            <div
              style={{
                position: "absolute",
                right: 0,
                top: 32,
                zIndex: 40,
                background: "var(--surface, #FFFFFF)",
                border: "1px solid var(--line, #E5E7EB)",
                borderRadius: "var(--r-s, 10px)",
                padding: 4,
                width: 140,
                boxShadow: "var(--sh-md, 0 4px 16px rgba(0,0,0,.12))",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <button
                onClick={() => { setMenuOpen(false); setEditing(true); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
                  borderRadius: 6, border: "none", background: "none",
                  fontSize: 13, color: "var(--ink)", cursor: "pointer", textAlign: "left",
                }}
              >
                ✏️ Edit note
              </button>
              <button
                onClick={() => { setMenuOpen(false); setConfirmDelete(true); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
                  borderRadius: 6, border: "none", background: "none",
                  fontSize: 13, color: "#DC2626", fontWeight: 600, cursor: "pointer", textAlign: "left",
                }}
              >
                🗑️ Delete card
              </button>
            </div>
          )}
        </div>
      </div>

      {editing ? (
        <div style={{ marginTop: 8 }}>
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={4}
            style={{
              width: "100%", padding: "10px 12px", borderRadius: 8,
              border: "1.5px solid var(--marigold)", fontSize: 14,
              fontFamily: "var(--sans)", resize: "vertical", outline: "none"
            }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "flex-end" }}>
            <button className="btn sm" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
            <button
              className="btn sm"
              style={{ background: "var(--marigold)", color: "#fff", border: "none", fontWeight: 600 }}
              onClick={handleSaveEdit}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : (
        <>
          {c.title && c.title !== rawText && (
            <p className="summary" style={{ marginTop: 4, fontWeight: 600 }}>{c.title}</p>
          )}
          <p className="raw" style={{ marginTop: 4, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {displayContent}
          </p>
          {isLong && (
            <button
              onClick={() => setExpanded(e => !e)}
              style={{
                background: "none", border: "none", color: "var(--marigold-dark)",
                fontSize: 12.5, fontWeight: 600, cursor: "pointer", marginTop: 6, padding: 0
              }}
            >
              {expanded ? "Show less" : "Read more →"}
            </button>
          )}
        </>
      )}

      {c.source_url && c.source_url.startsWith("/api/uploads/") ? (
        <div style={{ marginTop: 10, borderRadius: 8, overflow: "hidden", border: "1px solid var(--line)" }}>
          <img
            src={c.source_url}
            alt={c.title || "Uploaded capture"}
            style={{ width: "100%", maxHeight: 380, objectFit: "cover", display: "block" }}
            loading="lazy"
          />
        </div>
      ) : c.source_url ? (
        <div style={{
          marginTop: 10, padding: "8px 12px", background: "var(--surface-2)",
          borderRadius: 8, border: "1px solid var(--line)", fontSize: 12
        }}>
          <span style={{ color: "var(--ink-faint)", display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>Link Source</span>
          <a href={c.source_url} target="_blank" rel="noopener noreferrer" style={{ color: "#2563EB", wordBreak: "break-all", fontWeight: 500, textDecoration: "underline" }}>
            {c.source_url}
          </a>
        </div>
      ) : null}

      <div className="tags" style={{ marginTop: 8, alignItems: "center" }}>
        {c.difficulty > 0 && <span className="tag">{DIFF_LABEL[c.difficulty]}</span>}
        {c.importance > 0 && (
          <span className="tag" style={{ background: "rgba(224,146,47,.14)", color: "var(--marigold)" }}>★ {c.importance}/10</span>
        )}
        {c.tags && c.tags.map((t) => <span className="tag" key={t}>#{t}</span>)}
      </div>

      <div className="meta" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, marginTop: 10 }}>
        <ShareButton card={c} />
      </div>

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 999, background: "rgba(0,0,0,0.4)",
          backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20
        }}>
          <div style={{
            background: "var(--surface)", borderRadius: 16, padding: 24,
            maxWidth: 360, width: "100%", boxShadow: "var(--sh-lg)", border: "1px solid var(--line)"
          }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>Delete this card?</h3>
            <p style={{ margin: "8px 0 20px", fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.5 }}>
              This card and its media will be permanently removed from your second brain. This action cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{
                  padding: "8px 16px", borderRadius: 8, border: "1px solid var(--line)",
                  background: "var(--surface-2)", color: "var(--ink-soft)", fontSize: 14,
                  fontWeight: 600, cursor: "pointer"
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setConfirmDelete(false);
                  onDelete(c.id);
                }}
                style={{
                  padding: "8px 16px", borderRadius: 8, border: "none",
                  background: "#DC2626", color: "#fff", fontSize: 14,
                  fontWeight: 600, cursor: "pointer"
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function Cards({ flash, onChange }) {
  const [cards, setCards] = useState(null);
  const [tags, setTags] = useState([]);
  const [active, setActive] = useState(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("newest");

  const load = (tag) => api.cards(tag ? { tag } : {}).then(setCards).catch(() => { });
  useEffect(() => { load(active); api.tags().then(setTags).catch(() => { }); }, [active]);

  const remove = async (id) => {
    try {
      await api.deleteCard(id);
      setCards((cs) => cs.filter((c) => c.id !== id));
      api.tags().then(setTags); onChange?.();
      flash("Card deleted");
    } catch (err) {
      alert(err.message || "Failed to delete card");
    }
  };

  const handleUpdate = (updatedCard) => {
    setCards((cs) => cs.map((c) => c.id === updatedCard.id ? { ...c, ...updatedCard } : c));
  };

  const displayedCards = (cards || [])
    .filter((c) => {
      if (!q.trim()) return true;
      const query = q.toLowerCase();
      return (
        (c.raw && c.raw.toLowerCase().includes(query)) ||
        (c.title && c.title.toLowerCase().includes(query)) ||
        (c.summary && c.summary.toLowerCase().includes(query)) ||
        (c.tags && c.tags.some((t) => t.toLowerCase().includes(query)))
      );
    })
    .sort((a, b) => {
      if (sort === "oldest") return new Date(a.created_at) - new Date(b.created_at);
      if (sort === "importance") return (b.importance || 0) - (a.importance || 0);
      return new Date(b.created_at) - new Date(a.created_at);
    });

  return (
    <div className="screen">
      <Heatmap />
      <div className="eyebrow">Your cards</div>
      <h1 className="title">{cards ? `${cards.length} saved` : "Your cards"}</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search your cards…"
          style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13.5 }}
        />
        <select value={sort} onChange={e => setSort(e.target.value)}
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13, background: "var(--surface)" }}>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="importance">Most important</option>
        </select>
      </div>

      {tags.length > 0 && (
        <div className="tags" style={{ margin: "4px 0 16px" }}>
          <button className="tag" style={active ? {} : { background: "var(--ink)", color: "#fff" }}
            onClick={() => setActive(null)}>all</button>
          {tags.slice(0, 12).map((t) => (
            <button className="tag" key={t.tag}
              style={active === t.tag ? { background: "var(--ink)", color: "#fff" } : {}}
              onClick={() => setActive(t.tag)}>#{t.tag} · {t.count}</button>
          ))}
        </div>
      )}
      {!cards && (
        <>
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton" style={{ height: 90, marginBottom: 12, borderRadius: "var(--r)" }} />
          ))}
        </>
      )}
      {cards && displayedCards.length === 0 && (
        <div className="empty">No cards found.<br />{q ? "Try a different search term." : "Head to Capture and save your first thought."}</div>
      )}
      {cards && displayedCards.map((c) => <CardView key={c.id} c={c} onDelete={remove} onUpdate={handleUpdate} />)}
    </div>
  );
}
