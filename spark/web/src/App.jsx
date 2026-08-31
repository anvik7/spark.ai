import React, { useEffect, useRef, useState } from "react";
import { api, setToken, hasToken } from "./api.js";
import { Chakra } from "./Chakra.jsx";
import Career from "./Career.jsx";
import Interview from "./Interview.jsx";
import Heatmap from "./Heatmap.jsx";
import Landing from "./Landing.jsx";
import Capture from "./Capture.jsx";
import Tasks from "./Tasks.jsx";
import Upgrade from "./Upgrade.jsx";
import Login from "./Login.jsx";
import Signup from "./Signup.jsx";
import Account from "./Account.jsx";
import Papers from "./Papers.jsx";
import Circles from "./Circles.jsx";
import StudyTracker from "./components/StudyTracker";
import Avatar from "./components/Avatar.jsx";
import CommandMenu from "./components/ui/CommandMenu.jsx";

/* ---------- SVG Navigation Icons ---------- */
const Ico = {
  capture: <path d="M4 20h4L18 10l-4-4L4 16v4Z M14 6l4 4" />,
  tasks: <path d="M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />,
  study: <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z" />,
  papers: <path d="M14 3v5h5 M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-5Z" />,
  circles: <><circle cx="8" cy="8" r="3" /><circle cx="16" cy="8" r="3" /><circle cx="12" cy="16" r="3" /><path d="M10.5 10.5l1.5 2.5 M13.5 10.5l-1.5 2.5" /></>,
  career: <path d="M12 3l2.5 5 5.5.8-4 3.9 1 5.5-5-2.6-5 2.6 1-5.5-4-3.9 5.5-.8z" />,
  coach: <path d="M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M4 21v-1a6 6 0 0 1 12 0v1 M18 8l2 2-2 2" />,
};

const Svg = ({ d, cls = "ico" }) => (
  <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>{d}</svg>
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

export default function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState("signup");
  const [tab, setTab] = useState("capture");
  const [toast, setToast] = useState("");
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showCmdMenu, setShowCmdMenu] = useState(false);

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

  const refreshUser = () => api.me().then(setUser).catch(() => { });

  const handleNav = (targetTab) => {
    setShowUpgrade(false);
    setShowAccount(false);
    setTab(targetTab);
  };

  if (booting) return <div className="empty" style={{ paddingTop: 120 }}>Loading Spark Workspace…</div>;
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

  const navItems = [
    { id: "capture", label: "Capture", icon: Ico.capture },
    { id: "tasks", label: "Tasks", icon: Ico.tasks },
    { id: "study", label: "Study", icon: Ico.study },
    { id: "papers", label: "Paper Vault", icon: Ico.papers },
    { id: "circles", label: "Circles", icon: Ico.circles },
    { id: "career", label: "Career OS", icon: Ico.career },
    { id: "coach", label: "Interview Coach", icon: Ico.coach },
  ];

  return (
    <div className="app-layout">
      {/* Command Palette (⌘K) */}
      <CommandMenu
        isOpen={showCmdMenu}
        onClose={() => setShowCmdMenu(false)}
        onNavigate={handleNav}
      />

      {/* Desktop Persistent Sidebar */}
      <aside className="app-sidebar">
        <div className="sidebar-header" onClick={() => handleNav("capture")} style={{ cursor: "pointer" }}>
          <Chakra size={24} />
          <span className="logo-mark" style={{ fontSize: 20 }}>Spark</span>
        </div>

        <div className="sidebar-workspace">
          <span>⚡</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Personal Workspace
          </span>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`sidebar-link ${tab === item.id && !showAccount && !showUpgrade ? "active" : ""}`}
              onClick={() => handleNav(item.id)}
            >
              <Svg d={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            className={`plan-chip ${user.plan === "pro" ? "pro" : ""}`}
            style={{ width: "100%", justifyContent: "center" }}
            onClick={() => { setShowAccount(false); setShowUpgrade(true); }}
          >
            {user.plan === "pro" ? "⚡ Pro Workspace" : "Free Plan · Upgrade"}
          </button>
          
          <div
            onClick={() => { setShowUpgrade(false); setShowAccount((a) => !a); }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              borderRadius: 8,
              cursor: "pointer",
              background: showAccount ? "var(--surface-2)" : "transparent",
            }}
          >
            <Avatar src={user?.avatar_url} name={user?.name || "User"} size={32} />
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user?.name || "Spark User"}
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-soft)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user?.email}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Workspace */}
      <main className="app-main">
        {/* Top Header Bar */}
        <header className="topbar-desktop">
          <div className="cmd-search-trigger" onClick={() => setShowCmdMenu(true)}>
            <span>🔍</span>
            <span style={{ flex: 1 }}>Search captures, tasks...</span>
            <kbd style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 4, padding: "1px 5px", fontSize: 11 }}>⌘K</kbd>
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button
              className={`plan-chip ${user.plan === "pro" ? "pro" : ""}`}
              onClick={() => { setShowAccount(false); setShowUpgrade(true); }}
            >
              {user.plan === "pro" ? "Pro" : "Free Plan"}
            </button>
            <button
              style={{ background: "none", border: "none", cursor: "pointer", padding: 2, borderRadius: "50%" }}
              onClick={() => { setShowUpgrade(false); setShowAccount((a) => !a); }}
            >
              <Avatar src={user?.avatar_url} name={user?.name || "User"} size={32} />
            </button>
          </div>
        </header>

        {/* Page Content Container */}
        <div className="workspace-container">
          {showAccount ? (
            <Account
              user={user}
              onLogout={() => { setShowAccount(false); setUser(null); }}
              onUpdateUser={(updated) => setUser((prev) => ({ ...prev, ...updated }))}
            />
          ) : showUpgrade ? (
            <Upgrade user={user} onUpgraded={() => { setShowUpgrade(false); refreshUser(); }} onBack={() => setShowUpgrade(false)} />
          ) : (
            <>
              {tab === "capture" && <Capture onSaved={refreshUser} />}
              {tab === "tasks" && <Tasks />}
              {tab === "study" && <StudyTracker />}
              {tab === "papers" && <Papers />}
              {tab === "circles" && <Circles />}
              {tab === "career" && <Career onNavigate={handleNav} user={user} />}
              {tab === "coach" && <Interview />}
            </>
          )}
        </div>
      </main>

      {/* Mobile Bottom Navigation (<768px) */}
      <nav className="nav">
        <NavBtn id="capture" tab={showAccount || showUpgrade ? null : tab} set={handleNav} icon={Ico.capture} label="Capture" />
        <NavBtn id="tasks" tab={showAccount || showUpgrade ? null : tab} set={handleNav} icon={Ico.tasks} label="Tasks" />
        <NavBtn id="study" tab={showAccount || showUpgrade ? null : tab} set={handleNav} icon={Ico.study} label="Study" />
        <NavBtn id="papers" tab={showAccount || showUpgrade ? null : tab} set={handleNav} icon={Ico.papers} label="Papers" />
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
      <Svg d={icon} /><span>{label}</span><span className="dot" />
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
