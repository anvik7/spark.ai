import React, { useEffect, useState } from "react";
import { api, setToken, hasToken } from "./api.js";
import { Chakra } from "./Chakra.jsx";
import Capture from "./Capture.jsx";
import Tasks from "./Tasks.jsx";
import Study from "./Study.jsx";
import Career from "./Career.jsx";
import Interview from "./Interview.jsx";
import Landing from "./Landing.jsx";
import Upgrade from "./Upgrade.jsx";
import Login from "./Login.jsx";
import Signup from "./Signup.jsx";
import Account from "./Account.jsx";
import Papers from "./Papers.jsx";
import Circles from "./Circles.jsx";
import Avatar from "./components/Avatar.jsx";
import CommandMenu from "./components/ui/CommandMenu.jsx";

/* ---------- SVG Navigation Icons ---------- */
const Ico = {
  capture: <path d="M12 20h9 M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />,
  tasks: <path d="M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />,
  study: <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z" />,
  career: <path d="M12 3l2.5 5 5.5.8-4 3.9 1 5.5-5-2.6-5 2.6 1-5.5-4-3.9 5.5-.8z" />,
  papers: <path d="M14 3v5h5 M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-5Z" />,
  circles: <><circle cx="8" cy="8" r="3" /><circle cx="16" cy="8" r="3" /><circle cx="12" cy="16" r="3" /><path d="M10.5 10.5l1.5 2.5 M13.5 10.5l-1.5 2.5" /></>,
  coach: <path d="M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M4 21v-1a6 6 0 0 1 12 0v1 M18 8l2 2-2 2" />,
  more: <><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /><circle cx="5" cy="12" r="1.5" /></>,
};

const Svg = ({ d, cls = "ico" }) => (
  <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>{d}</svg>
);

export default function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState("signup");
  const [tab, setTab] = useState("capture"); // CAPTURE IS MAIN WORKSPACE
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showCmdMenu, setShowCmdMenu] = useState(false);
  const [showMobileMore, setShowMobileMore] = useState(false);

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
    setShowMobileMore(false);
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

  // Exact 5 Primary Tabs Order
  const navItems = [
    { id: "capture", label: "Capture", icon: Ico.capture },
    { id: "tasks", label: "Tasks", icon: Ico.tasks },
    { id: "study", label: "Study", icon: Ico.study },
    { id: "career", label: "Career OS", icon: Ico.career },
    { id: "papers", label: "Paper Vault", icon: Ico.papers },
    { id: "circles", label: "Study Circles", icon: Ico.circles },
    { id: "coach", label: "Interview Coach", icon: Ico.coach },
  ];

  const moreTabActive = ["papers", "circles", "coach"].includes(tab);

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
            className={`plan-chip ${user.plan === "pro" || user.plan === "plus" ? "pro" : ""}`}
            style={{ width: "100%", justifyContent: "center" }}
            onClick={() => { setShowAccount(false); setShowUpgrade(true); }}
          >
            {user.plan === "pro" ? "⚡ Pro Plan" : user.plan === "plus" ? "⭐ Plus Plan" : "Free Plan · Upgrade"}
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
            <span style={{ flex: 1 }}>Search captures, tasks, study materials...</span>
            <kbd style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 4, padding: "1px 5px", fontSize: 11 }}>⌘K</kbd>
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button
              className={`plan-chip ${user.plan === "pro" || user.plan === "plus" ? "pro" : ""}`}
              onClick={() => { setShowAccount(false); setShowUpgrade(true); }}
            >
              {user.plan === "pro" ? "Pro" : user.plan === "plus" ? "Plus" : "Free Plan"}
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
              {tab === "capture" && <Capture />}
              {tab === "tasks" && <Tasks />}
              {tab === "study" && <Study />}
              {tab === "career" && <Career onNavigate={handleNav} user={user} />}
              {tab === "papers" && <Papers />}
              {tab === "circles" && <Circles />}
              {tab === "coach" && <Interview />}
            </>
          )}
        </div>
      </main>

      {/* Mobile Bottom Navigation (<768px: CAPTURE | TASKS | STUDY | CAREER | MORE) */}
      <nav className="nav">
        <NavBtn id="capture" tab={showAccount || showUpgrade || moreTabActive ? null : tab} set={handleNav} icon={Ico.capture} label="Capture" />
        <NavBtn id="tasks" tab={showAccount || showUpgrade || moreTabActive ? null : tab} set={handleNav} icon={Ico.tasks} label="Tasks" />
        <NavBtn id="study" tab={showAccount || showUpgrade || moreTabActive ? null : tab} set={handleNav} icon={Ico.study} label="Study" />
        <NavBtn id="career" tab={showAccount || showUpgrade || moreTabActive ? null : tab} set={handleNav} icon={Ico.career} label="Career" />
        <button
          className={`nav-btn ${moreTabActive || showMobileMore ? "active" : ""}`}
          onClick={() => setShowMobileMore((m) => !m)}
        >
          <Svg d={Ico.more} />
          <span>More</span>
          <span className="dot" />
        </button>
      </nav>

      {/* Mobile "More" Drawer Modal */}
      {showMobileMore && (
        <div className="modal-overlay" onClick={() => setShowMobileMore(false)}>
          <div
            className="modal-dialog"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 360, padding: 18, marginBottom: 70 }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "var(--ink-faint)", marginBottom: 12 }}>
              More Workspace Modules
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <button
                className={`sidebar-link ${tab === "papers" ? "active" : ""}`}
                onClick={() => handleNav("papers")}
              >
                <Svg d={Ico.papers} />
                <span>Paper Vault</span>
              </button>

              <button
                className={`sidebar-link ${tab === "circles" ? "active" : ""}`}
                onClick={() => handleNav("circles")}
              >
                <Svg d={Ico.circles} />
                <span>Study Circles</span>
              </button>

              <button
                className={`sidebar-link ${tab === "coach" ? "active" : ""}`}
                onClick={() => handleNav("coach")}
              >
                <Svg d={Ico.coach} />
                <span>Interview Coach</span>
              </button>

              <hr style={{ margin: "8px 0" }} />

              <button
                className="sidebar-link"
                onClick={() => { setShowAccount(true); setShowMobileMore(false); }}
              >
                <Avatar src={user?.avatar_url} name={user?.name || "User"} size={20} />
                <span>Account Settings</span>
              </button>
            </div>
          </div>
        </div>
      )}
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
