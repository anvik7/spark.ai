import React, { useEffect, useState, useCallback, Suspense, lazy } from "react";
import { api, setToken, hasToken } from "./api.js";
import { Chakra } from "./Chakra.jsx";
import Landing from "./Landing.jsx";
import Login from "./Login.jsx";
import Signup from "./Signup.jsx";
import Avatar from "./components/Avatar.jsx";
import CommandMenu from "./components/ui/CommandMenu.jsx";
import ModuleErrorBoundary from "./components/ui/ModuleErrorBoundary.jsx";
import ModuleLoadingState from "./components/ui/ModuleLoadingState.jsx";

// Lazy-loaded standalone module chunks
const Home = lazy(() => import("./Home.jsx"));
const Capture = lazy(() => import("./Capture.jsx"));
const Tasks = lazy(() => import("./Tasks.jsx"));
const Study = lazy(() => import("./Study.jsx"));
const Career = lazy(() => import("./Career.jsx"));
const Interview = lazy(() => import("./Interview.jsx"));
const Circles = lazy(() => import("./Circles.jsx"));
const Account = lazy(() => import("./Account.jsx"));
const Upgrade = lazy(() => import("./Upgrade.jsx"));

/* ---------- SVG Navigation Icons ---------- */
const Ico = {
  capture: <path d="M12 20h9 M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />,
  tasks: <path d="M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />,
  study: <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z" />,
  career: <path d="M12 3l2.5 5 5.5.8-4 3.9 1 5.5-5-2.6-5 2.6 1-5.5-4-3.9 5.5-.8z" />,
  circles: <><circle cx="8" cy="8" r="3" /><circle cx="16" cy="8" r="3" /><circle cx="12" cy="16" r="3" /><path d="M10.5 10.5l1.5 2.5 M13.5 10.5l-1.5 2.5" /></>,
  coach: <path d="M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M4 21v-1a6 6 0 0 1 12 0v1 M18 8l2 2-2 2" />,
  more: <><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /><circle cx="5" cy="12" r="1.5" /></>,
};

const Svg = ({ d, cls = "ico" }) => (
  <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>{d}</svg>
);

import SharedCapture from "./SharedCapture.jsx";

export default function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState("signup");
  const [tab, setTab] = useState("tasks");
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showCmdMenu, setShowCmdMenu] = useState(false);

  // ── Theme system (Light / Dark / System) ──
  const [theme, setThemeState] = useState(() => localStorage.getItem("spark_theme") || "system");

  const applyTheme = useCallback((mode) => {
    const isDark = mode === "dark" ||
      (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (isDark) {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    // Update meta theme-color
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", isDark ? "#141419" : "#ECE9E2");
  }, []);

  const handleChangeTheme = useCallback((newTheme) => {
    setThemeState(newTheme);
    localStorage.setItem("spark_theme", newTheme);
    applyTheme(newTheme);
  }, [applyTheme]);

  // Apply theme on mount and listen for system changes
  useEffect(() => {
    applyTheme(theme);
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => { if (theme === "system") applyTheme("system"); };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [theme, applyTheme]);

  // Check public shared capture URL route
  const currentPath = typeof window !== "undefined" ? window.location.pathname : "";
  if (currentPath.startsWith("/shared/capture/")) {
    const shareToken = currentPath.replace("/shared/capture/", "").trim();
    return <SharedCapture shareToken={shareToken} />;
  }

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
    localStorage.setItem("spark_active_tab", targetTab);
  };

  if (booting) return <div className="empty" style={{ paddingTop: 120 }}>Loading Spark Workspace…</div>;
  if (!user) {
    return showAuth ? (
      <Auth
        onAuthed={(u) => {
          setUser(u);
          setShowAuth(false);
          handleNav("tasks");
        }}
        onBackToHome={() => setShowAuth(false)}
        initialMode={authMode}
      />
    ) : (
      <Landing
        onGetStarted={() => { setAuthMode("signup"); setShowAuth(true); }}
        onLogin={() => { setAuthMode("login"); setShowAuth(true); }}
        theme={theme}
        onChangeTheme={handleChangeTheme}
      />
    );
  }

  // Exact 6 Global Modules Sequence (Tasks -> Capture -> Study -> Chat -> Career -> Coach)
  const navItems = [
    { id: "tasks", label: "Tasks", shortLabel: "Tasks", icon: Ico.tasks },
    { id: "capture", label: "Capture", shortLabel: "Capture", icon: Ico.capture },
    { id: "study", label: "Study", shortLabel: "Study", icon: Ico.study },
    { id: "circles", label: "Chat", shortLabel: "Chat", icon: Ico.circles },
    { id: "career", label: "Career OS", shortLabel: "Career", icon: Ico.career },
    { id: "coach", label: "Interview Coach", shortLabel: "Coach", icon: Ico.coach },
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
        <div className="sidebar-header spark-logo-lockup" onClick={() => handleNav("home")} style={{ cursor: "pointer" }} title="Spark Home">
          <Chakra size={32} />
          <span className="logo-mark" style={{ fontSize: 22 }}>Spark</span>
        </div>

        <div className="sidebar-workspace" onClick={() => handleNav("home")} style={{ cursor: "pointer" }} title="Spark Home">
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
        {/* Mobile Header (< 768px) */}
        <header className="topbar-mobile">
          <div className="spark-logo-lockup" onClick={() => handleNav("home")} title="Spark Home">
            <Chakra size={32} />
            <span className="logo-mark" style={{ fontSize: 20 }}>Spark</span>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={() => setShowCmdMenu(true)}
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--line)",
                borderRadius: 8,
                width: 32,
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                cursor: "pointer",
                color: "var(--ink-soft)",
              }}
              title="Search (⌘K)"
            >
              🔍
            </button>

            <button
              className={`plan-chip ${user.plan === "pro" || user.plan === "plus" ? "pro" : ""}`}
              onClick={() => { setShowAccount(false); setShowUpgrade(true); }}
              style={{ fontSize: 11, padding: "3px 8px" }}
            >
              {user.plan === "pro" ? "Pro" : user.plan === "plus" ? "Plus" : "Free"}
            </button>

            <button
              onClick={() => {
                const nextTheme = theme === "dark" ? "light" : theme === "light" ? "system" : "dark";
                handleChangeTheme(nextTheme);
              }}
              aria-label={`Current theme: ${theme}. Click to switch theme`}
              title={`Theme: ${theme.charAt(0).toUpperCase() + theme.slice(1)}`}
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--line)",
                borderRadius: 8,
                width: 32,
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                cursor: "pointer",
                color: "var(--ink)",
              }}
            >
              {theme === "dark" ? "🌙" : theme === "light" ? "☀️" : "◐"}
            </button>

            <button
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
              onClick={() => { setShowUpgrade(false); setShowAccount((a) => !a); }}
            >
              <Avatar src={user?.avatar_url} name={user?.name || "User"} size={28} />
            </button>
          </div>
        </header>

        {/* Desktop Header (>= 768px) */}
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
              onClick={() => {
                const nextTheme = theme === "dark" ? "light" : theme === "light" ? "system" : "dark";
                handleChangeTheme(nextTheme);
              }}
              aria-label={`Current theme: ${theme}. Click to switch theme`}
              title={`Theme: ${theme.charAt(0).toUpperCase() + theme.slice(1)}`}
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--line)",
                borderRadius: 8,
                width: 34,
                height: 34,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 15,
                cursor: "pointer",
                color: "var(--ink)",
              }}
            >
              {theme === "dark" ? "🌙" : theme === "light" ? "☀️" : "◐"}
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
            <ModuleErrorBoundary moduleName="Account">
              <Suspense fallback={<ModuleLoadingState moduleName="Account" />}>
                <Account
                  user={user}
                  onLogout={() => { setShowAccount(false); setUser(null); setTab("tasks"); localStorage.removeItem("spark_active_tab"); }}
                  onUpdateUser={(updated) => setUser((prev) => ({ ...prev, ...updated }))}
                  theme={theme}
                  onChangeTheme={handleChangeTheme}
                />
              </Suspense>
            </ModuleErrorBoundary>
          ) : showUpgrade ? (
            <ModuleErrorBoundary moduleName="Upgrade">
              <Suspense fallback={<ModuleLoadingState moduleName="Upgrade" />}>
                <Upgrade user={user} onUpgraded={() => { setShowUpgrade(false); refreshUser(); }} onBack={() => setShowUpgrade(false)} />
              </Suspense>
            </ModuleErrorBoundary>
          ) : (
            <>
              {tab === "home" && (
                <ModuleErrorBoundary moduleName="Home">
                  <Suspense fallback={<ModuleLoadingState moduleName="Home" />}>
                    <Home
                      user={user}
                      onNavigate={handleNav}
                      onOpenUpgrade={() => setShowUpgrade(true)}
                    />
                  </Suspense>
                </ModuleErrorBoundary>
              )}
              {tab === "capture" && (
                <ModuleErrorBoundary moduleName="Capture">
                  <Suspense fallback={<ModuleLoadingState moduleName="Capture" />}>
                    <Capture onNavigate={handleNav} />
                  </Suspense>
                </ModuleErrorBoundary>
              )}

              {tab === "tasks" && (
                <ModuleErrorBoundary moduleName="Tasks">
                  <Suspense fallback={<ModuleLoadingState moduleName="Tasks" />}>
                    <Tasks />
                  </Suspense>
                </ModuleErrorBoundary>
              )}

              {tab === "study" && (
                <ModuleErrorBoundary moduleName="Study">
                  <Suspense fallback={<ModuleLoadingState moduleName="Study" />}>
                    <Study onOpenUpgrade={() => setShowUpgrade(true)} />
                  </Suspense>
                </ModuleErrorBoundary>
              )}

              {tab === "circles" && (
                <ModuleErrorBoundary moduleName="Chat">
                  <Suspense fallback={<ModuleLoadingState moduleName="Chat" />}>
                    <Circles onOpenUpgrade={() => setShowUpgrade(true)} user={user} />
                  </Suspense>
                </ModuleErrorBoundary>
              )}

              {tab === "career" && (
                <ModuleErrorBoundary moduleName="Career">
                  <Suspense fallback={<ModuleLoadingState moduleName="Career" />}>
                    <Career onNavigate={handleNav} user={user} />
                  </Suspense>
                </ModuleErrorBoundary>
              )}

              {tab === "coach" && (
                <ModuleErrorBoundary moduleName="Coach">
                  <Suspense fallback={<ModuleLoadingState moduleName="Coach" />}>
                    <Interview />
                  </Suspense>
                </ModuleErrorBoundary>
              )}
            </>
          )}
        </div>
      </main>

      {/* Mobile Bottom Navigation (Tasks | Capture | Study | Chat | Career | Coach) */}
      <nav className="nav">
        {navItems.map((item) => (
          <NavBtn
            key={item.id}
            id={item.id}
            tab={showAccount || showUpgrade ? null : tab}
            set={handleNav}
            icon={item.icon}
            label={item.shortLabel || item.label}
          />
        ))}
      </nav>
    </div>
  );
}

function NavBtn({ id, tab, set, icon, label }) {
  const isActive = tab === id;
  return (
    <button
      className={isActive ? "nav-btn active" : "nav-btn"}
      onClick={() => set(id)}
      aria-label={label}
      aria-current={isActive ? "page" : undefined}
    >
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
