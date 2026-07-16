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
/* ---------- tiny inline icons ---------- */
const Ico = {
  pen: <path d="M4 20h4L18 10l-4-4L4 16v4Z M14 6l4 4" />,
  cards: <path d="M4 7h16v13H4z M4 7l2-3h12l2 3 M8 12h8 M8 16h5" />,
  review: <path d="M12 4a8 8 0 1 0 8 8 M12 4v4 M20 12h-4 M12 9v3l2 2" />,
  connect: <path d="M7 8a3 3 0 1 0 0-1 M17 8a3 3 0 1 0 0-1 M9.5 7h5 M12 10v4 M9 18a3 3 0 1 0 6 0" />,
  mic: <path d="M12 4a3 3 0 0 1 3 3v4a3 3 0 0 1-6 0V7a3 3 0 0 1 3-3Z M6 11a6 6 0 0 0 12 0 M12 17v3" />,
  paper: <path d="M14 3v5h5 M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-5Z" />,
  career: <path d="M12 3l2.5 5 5.5.8-4 3.9 1 5.5-5-2.6-5 2.6 1-5.5-4-3.9 5.5-.8z" />,
  coach: <path d="M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M4 21v-1a6 6 0 0 1 12 0v1 M18 8l2 2-2 2" />,
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

  useEffect(() => {
    if (!hasToken()) { setBooting(false); return; }
    api.me().then(setUser).catch(() => setToken("")).finally(() => setBooting(false));
  }, []);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2600); };
  const reload = () => setRefreshCards((r) => r + 1);
  const refreshUser = () => api.me().then(setUser).catch(() => {});

  if (booting) return <div className="empty" style={{ paddingTop: 120 }}>Loading…</div>;
  if (!user) return showAuth ? <Auth onAuthed={(u) => setUser(u)} /> : <Landing onGetStarted={() => setShowAuth(true)} />;

  return (
    <div className="app">
      <header className="topbar">
        <div className="wordmark"><Chakra size={22} /><b>Spark.AI</b></div>
        <button className={`plan-chip ${user.plan === "pro" ? "pro" : ""}`}
          onClick={() => setShowUpgrade(true)}>
          {user.plan === "pro" ? "Pro" : `Free · ${user.card_count}/${user.free_card_limit}`}
        </button>
      </header>

      {showUpgrade
        ? <Upgrade user={user} onUpgraded={() => { setShowUpgrade(false); refreshUser(); }} onBack={() => setShowUpgrade(false)} />
        : <>
            {tab === "capture" && <Capture onSaved={() => setRefreshCards(r => r + 1)} />}
            {tab === "cards" && <Cards key={refreshCards} flash={flash} onChange={refreshUser} />}
            {tab === "review" && <Review />}
            {tab === "connect" && <Connect />}
            {tab === "career" && <Career onNavigate={setTab} />}
            {tab === "coach" && <Interview />}
          </>
      }

      {toast && <div className="toast">{toast}</div>}

      <nav className="nav">
        <NavBtn id="capture" tab={tab} set={setTab} icon={Ico.pen} label="Capture" />
        <NavBtn id="cards" tab={tab} set={setTab} icon={Ico.cards} label="Cards" />
        <NavBtn id="review" tab={tab} set={setTab} icon={Ico.review} label="Review" />
        <NavBtn id="connect" tab={tab} set={setTab} icon={Ico.connect} label="Connect" />
        <NavBtn id="career" tab={tab} set={setTab} icon={Ico.career} label="Career" />
        <NavBtn id="coach" tab={tab} set={setTab} icon={Ico.coach} label="Coach" />
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(""); setBusy(true);
    try {
      const r = mode === "signup"
        ? await api.signup(email, password, name)
        : await api.login(email, password);
      setToken(r.token);
      onAuthed(r.user);
    } catch (e) { setErr(e.message || "Something went wrong"); }
    finally { setBusy(false); }
  };

  return (
    <div className="auth">
      <div className="wordmark" style={{ marginBottom: 22 }}><Chakra size={24} /><b style={{ fontSize: 24 }}>Spark</b></div>
      <h1>{mode === "signup" ? "Start your second brain." : "Welcome back."}</h1>
      <p>Capture a thought in seconds. Spark tags it, files it, and brings it back before you forget it.</p>
      {mode === "signup" && (
        <div className="field"><label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></div>
      )}
      <div className="field"><label>Email</label>
        <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" /></div>
      <div className="field"><label>Password</label>
        <input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password}
          onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={mode === "signup" ? "At least 8 characters" : "Your password"} /></div>
      {err && <div className="err">{err}</div>}
      <button className="btn full" onClick={submit} disabled={busy || !email || !password}>
        {busy ? <span className="spin" /> : mode === "signup" ? "Create account" : "Sign in"}
      </button>
      <div className="switch">
        {mode === "signup" ? "Already have an account? " : "New here? "}
        <button onClick={() => { setErr(""); setMode(mode === "signup" ? "login" : "signup"); }}>
          {mode === "signup" ? "Sign in" : "Create one"}
        </button>
      </div>
    </div>
  );
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
      <div className="meta">
        <span className="date">{fmtDate(c.created_at)}</span>
        <button className="del" onClick={() => onDelete(c.id)} aria-label="Delete">✕</button>
      </div>
    </article>
  );
}

function Cards({ flash, onChange }) {
  const [cards, setCards] = useState(null);
  const [tags, setTags] = useState([]);
  const [active, setActive] = useState(null);

  const load = (tag) => api.cards(tag ? { tag } : {}).then(setCards);
  useEffect(() => { load(active); api.tags().then(setTags); }, [active]);

  const remove = async (id) => {
    await api.deleteCard(id);
    setCards((cs) => cs.filter((c) => c.id !== id));
    api.tags().then(setTags); onChange?.();
    flash("Card deleted");
  };

  return (
    <div className="screen">
      <Heatmap />
      <div className="eyebrow">Your cards</div>
      <h1 className="title">{cards ? `${cards.length} saved` : "Loading…"}</h1>
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
      {cards && cards.length === 0 && (
        <div className="empty">No cards yet.<br />Head to Capture and save your first thought.</div>
      )}
      {cards && cards.map((c) => <CardView key={c.id} c={c} onDelete={remove} />)}
    </div>
  );
}


/* ---------- Connect the dots ---------- */
function Connect() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");

  const run = async () => {
    if (!q.trim()) return;
    setBusy(true); setErr(""); setResult(null);
    try { setResult(await api.connect(q.trim())); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="screen">
      <div className="eyebrow">Connect the dots</div>
      <h1 className="title">Ask your notes</h1>
      <p className="sub">“What do I know about digital marketing?” Spark pulls every related card and drafts a connected briefing.</p>
      <div className="searchbar">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="A topic or question…" />
        <button className="btn" onClick={run} disabled={busy}>{busy ? <span className="spin" /> : "Ask"}</button>
      </div>
      {err && <div className="err">{err}</div>}
      {result && (
        <>
          <div className="briefing">{result.briefing}</div>
          {result.cards.length > 0 && (
            <>
              <div className="eyebrow">Sources · {result.cards.length}</div>
              {result.cards.map((c) => <CardView key={c.id} c={c} onDelete={() => {}} />)}
            </>
          )}
        </>
      )}
    </div>
  );
}

