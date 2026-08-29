import React, { useEffect, useRef, useState } from "react";
import { api, setToken, hasToken } from "./api.js";
import { Chakra } from "./Chakra.jsx";
import Career from "./Career.jsx";
import Interview from "./Interview.jsx";
import Heatmap from "./Heatmap.jsx";
import Landing from "./Landing.jsx";
import Review from "./Review.jsx";
import Capture from "./Capture.jsx";
import Upgrade from "./Upgrade.jsx";
import Login from "./Login.jsx";
import Signup from "./Signup.jsx";
import Account from "./Account.jsx";
import Papers from "./Papers.jsx";
import Circles from "./Circles.jsx";
import { ShareButton } from "./ShareCard.jsx";
import StudyTracker from "./components/StudyTracker";

/* ---------- tiny inline icons ---------- */
const Ico = {
  pen: <path d="M4 20h4L18 10l-4-4L4 16v4Z M14 6l4 4" />,
  cards: <path d="M4 7h16v13H4z M4 7l2-3h12l2 3 M8 12h8 M8 16h5" />,
  study: <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z" />,
  review: <path d="M12 4a8 8 0 1 0 8 8 M12 4v4 M20 12h-4 M12 9v3l2 2" />,
  connect: <path d="M7 8a3 3 0 1 0 0-1 M17 8a3 3 0 1 0 0-1 M9.5 7h5 M12 10v4 M9 18a3 3 0 1 0 6 0" />,
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

const fmtDate = (s) => {
  const d = new Date(s);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

/* ===================================================================== */
export default function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [showAuth, setShowAuth] = useState(false);
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
  if (!user) return showAuth ? <Auth onAuthed={(u) => setUser(u)} /> : <Landing onGetStarted={() => setShowAuth(true)} />;

  return (
    <div className="app">
      <header className="topbar">
        <div className="wordmark" onClick={() => { setShowUpgrade(false); setShowAccount(true); }} style={{ cursor: "pointer" }}>
          <Chakra size={22} /><span className="logo-mark">Spark.AI</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className={`plan-chip ${user.plan === "pro" ? "pro" : ""}`}
            onClick={() => { setShowAccount(false); setShowUpgrade(true); }}>
            {user.plan === "pro" ? "Pro" : `Free · ${user.card_count}/${user.free_card_limit}`}
          </button>
          <button
            className={`nav-btn ${showAccount ? "active" : ""}`}
            style={{ padding: 6, borderRadius: "50%", background: "none", border: "none", cursor: "pointer", color: "var(--ink)" }}
            onClick={() => { setShowUpgrade(false); setShowAccount(a => !a); }}
            title="Account"
          >
            <Svg d={Ico.account} cls="ico" />
          </button>
        </div>
      </header>

      {showAccount ? (
        <Account user={user} onLogout={() => { setShowAccount(false); setUser(null); }} />
      ) : showUpgrade ? (
        <Upgrade user={user} onUpgraded={() => { setShowUpgrade(false); refreshUser(); }} onBack={() => setShowUpgrade(false)} />
      ) : (
        <>
          {tab === "capture" && <Capture onSaved={() => setRefreshCards(r => r + 1)} />}
          {tab === "cards" && <Cards key={refreshCards} flash={flash} onChange={refreshUser} />}
          {tab === "study" && <StudyTracker />}
          {tab === "review" && <Review />}
          {tab === "connect" && <Connect />}
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
        <NavBtn id="review" tab={showAccount || showUpgrade ? null : tab} set={handleNav} icon={Ico.review} label="Review" />
        <NavBtn id="connect" tab={showAccount || showUpgrade ? null : tab} set={handleNav} icon={Ico.connect} label="Connect" />
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
function Auth({ onAuthed }) {
  const [mode, setMode] = useState("signup");

  const handleAuth = (user) => {
    setToken(localStorage.getItem("spark_token"));
    onAuthed(user);
  };

  if (mode === "login") {
    return <Login onAuthed={handleAuth} goToSignup={() => setMode("signup")} />;
  }
  return <Signup onAuthed={handleAuth} goToLogin={() => setMode("login")} />;
}

/* ---------- Card list ---------- */
const KIND_LABEL = { text: "Note", link: "Link", image: "Image", voice: "Voice", pdf: "PDF", github: "GitHub" };
const DIFF_LABEL = ["", "Intro", "Easy", "Medium", "Hard", "Expert"];

function CardView({ c, onDelete }) {
  const heading = c.title || c.summary || c.raw;
  const showSummary = c.title && c.summary && c.summary !== c.title;

  return (
    <article className={`card kind-${c.kind}`}>
      <span className="eyebrow" style={{ margin: 0 }}>
        {KIND_LABEL[c.kind] || c.kind}{c.topic ? ` · ${c.topic}` : ""}
      </span>
      <p className="summary" style={{ marginTop: 4 }}>{heading}</p>
      {showSummary && <p className="raw">{c.summary}</p>}
      {!c.title && c.summary !== c.raw && (
        <p className="raw">{c.raw.slice(0, 220)}{c.raw.length > 220 ? "…" : ""}</p>
      )}
      <div className="tags" style={{ marginTop: 8, alignItems: "center" }}>
        {c.difficulty > 0 && <span className="tag">{DIFF_LABEL[c.difficulty]}</span>}
        {c.importance > 0 && (
          <span className="tag" style={{ background: "rgba(224,146,47,.14)", color: "var(--marigold)" }}>★ {c.importance}/10</span>
        )}
        {c.tags.map((t) => <span className="tag" key={t}>#{t}</span>)}
      </div>
      {c.source_url && (
        <a className="raw" href={c.source_url} target="_blank" rel="noopener noreferrer"
          style={{ display: "inline-block", marginTop: 8, color: "var(--ink-soft)", textDecoration: "underline", fontSize: 12 }}>
          {c.source_url.slice(0, 48)}{c.source_url.length > 48 ? "…" : ""}
        </a>
      )}
      <div className="meta" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span className="date">{fmtDate(c.created_at)}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ShareButton card={c} />
          <button className="del" onClick={() => onDelete(c.id)} aria-label="Delete">✕</button>
        </div>
      </div>
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
    await api.deleteCard(id);
    setCards((cs) => cs.filter((c) => c.id !== id));
    api.tags().then(setTags); onChange?.();
    flash("Card deleted");
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
      {cards && displayedCards.map((c) => <CardView key={c.id} c={c} onDelete={remove} />)}
    </div>
  );
}

/* ---------- Connect the dots ---------- */
function Connect() {
  const [q, setQ] = useState("");
  const [mode, setMode] = useState("ask");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");

  const run = async () => {
    if (!q.trim()) return;
    setBusy(true); setErr(""); setResult(null);
    try { setResult(await api.connect(q.trim(), mode)); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="screen">
      <div className="eyebrow">Connect the dots</div>
      <h1 className="title">Your memory, on demand</h1>
      <p className="sub">Ask anything you've captured — "what do I know about digital marketing?" — and Spark writes you a briefing pulled straight from your own notes.</p>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button onClick={() => setMode("ask")}
          style={{
            fontSize: 12.5, padding: "5px 12px", borderRadius: 20, cursor: "pointer",
            border: `1px solid ${mode === "ask" ? "var(--marigold)" : "var(--line)"}`,
            background: mode === "ask" ? "var(--marigold-light)" : "var(--surface-2)",
            color: mode === "ask" ? "var(--marigold-dark)" : "var(--ink-soft)"
          }}>
          Ask
        </button>
        <button onClick={() => setMode("draft")}
          style={{
            fontSize: 12.5, padding: "5px 12px", borderRadius: 20, cursor: "pointer",
            border: `1px solid ${mode === "draft" ? "var(--marigold)" : "var(--line)"}`,
            background: mode === "draft" ? "var(--marigold-light)" : "var(--surface-2)",
            color: mode === "draft" ? "var(--marigold-dark)" : "var(--ink-soft)"
          }}>
          Draft
        </button>
      </div>
      <div className="searchbar">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder={mode === "draft" ? "e.g. Draft a LinkedIn post about my progress this month…" : "A topic or question…"} />
        <button className="btn" onClick={run} disabled={busy}>{busy ? <span className="spin" /> : mode === "draft" ? "Draft" : "Ask"}</button>
      </div>
      {err && <div className="err">{err}</div>}
      {result && (
        <>
          <div className="briefing">{result.briefing}</div>
          {result.cards.length > 0 && (
            <>
              <div className="eyebrow">Sources · {result.cards.length}</div>
              {result.cards.map((c) => <CardView key={c.id} c={c} onDelete={() => { }} />)}
            </>
          )}
        </>
      )}
    </div>
  );
}


