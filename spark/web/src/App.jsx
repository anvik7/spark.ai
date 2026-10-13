import React, { useEffect, useState, useCallback, Suspense, lazy, startTransition } from "react";
import { api, setToken, hasToken } from "./api.js";
import { Chakra } from "./Chakra.jsx";
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
const Landing = lazy(() => import("./Landing.jsx"));
const Login = lazy(() => import("./Login.jsx"));
const Signup = lazy(() => import("./Signup.jsx"));
const ForgotPassword = lazy(() => import("./ForgotPassword.jsx"));
const ResetPassword = lazy(() => import("./ResetPassword.jsx"));
const SharedCapture = lazy(() => import("./SharedCapture.jsx"));

/* ---------- SVG Navigation Icons ---------- */
const Ico = {
  hamburger: (
    <>
      <line x1="4" y1="8.5" x2="20" y2="8.5" />
      <line x1="4" y1="15.5" x2="15" y2="15.5" />
    </>
  ),
  sidebarToggle: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="9" y1="4" x2="9" y2="20" />
    </>
  ),
  close: (
    <>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </>
  ),
  home: <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></>,
  capture: <path d="M12 20h9 M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />,
  tasks: <path d="M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />,
  study: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>,
  career: <path d="M12 3l2.5 5 5.5.8-4 3.9 1 5.5-5-2.6-5 2.6 1-5.5-4-3.9 5.5-.8z" />,
  circles: <><circle cx="8" cy="8" r="3" /><circle cx="16" cy="8" r="3" /><circle cx="12" cy="16" r="3" /><path d="M10.5 10.5l1.5 2.5 M13.5 10.5l-1.5 2.5" /></>,
  coach: <path d="M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M4 21v-1a6 6 0 0 1 12 0v1 M18 8l2 2-2 2" />,
  more: <><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /><circle cx="5" cy="12" r="1.5" /></>,
  user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
  upgrade: <><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>,
};

const Svg = ({ d, cls = "ico", size = 18 }) => (
  <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: size, height: size, flexShrink: 0 }}>{d}</svg>
);

// Unified Navigation Destinations (Tasks primary, all modules preserved)
export const NAVIGATION_ITEMS = [
  { id: "tasks", label: "Tasks", shortLabel: "Tasks", icon: Ico.tasks, desc: "AI Problem Solver" },
  { id: "capture", label: "Capture", shortLabel: "Capture", icon: Ico.capture, desc: "Notes, Files & Vault" },
  { id: "career", label: "Career OS", shortLabel: "Career", icon: Ico.career, desc: "Resume & Readiness" },
  { id: "circles", label: "Chat & Circles", shortLabel: "Circles", icon: Ico.circles, desc: "Peer Study Groups" },
  { id: "coach", label: "Interview Coach", shortLabel: "Coach", icon: Ico.coach, desc: "Live Mock Interviews" },
  { id: "study", label: "Study Center", shortLabel: "Study", icon: Ico.study, desc: "Spaced Repetition" },
  { id: "home", label: "Home", shortLabel: "Home", icon: Ico.home, desc: "Overview & Activity" },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState("signup");
  const [tab, setTab] = useState("tasks");
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showCmdMenu, setShowCmdMenu] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("spark_sidebar_collapsed") === "true"
  );

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

  // Desktop sidebar collapse toggle (persisted)
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("spark_sidebar_collapsed", String(next));
      return next;
    });
  }, []);

  // Mobile drawer open/close with browser history back-button support
  const openMobileDrawer = useCallback(() => {
    setMobileDrawerOpen((wasOpen) => {
      if (!wasOpen && typeof window !== "undefined" && window.history?.pushState) {
        try {
          window.history.pushState({ sparkMobileDrawer: true }, "");
        } catch (_) {
          // Ignore history push errors in constrained environments
        }
      }
      return true;
    });
  }, []);

  const closeMobileDrawer = useCallback(() => {
    setMobileDrawerOpen(false);
  }, []);

  const toggleMobileDrawer = useCallback(() => {
    setMobileDrawerOpen((wasOpen) => {
      if (wasOpen) return false;
      if (typeof window !== "undefined" && window.history?.pushState) {
        try {
          window.history.pushState({ sparkMobileDrawer: true }, "");
        } catch (_) {
          // Ignore history push errors
        }
      }
      return true;
    });
  }, []);

  // Close mobile drawer on browser Back navigation (popstate), Escape key, or viewport resize to desktop
  useEffect(() => {
    const onPopState = () => {
      setMobileDrawerOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        setMobileDrawerOpen(false);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    const onResize = () => {
      if (typeof window !== "undefined" && window.innerWidth >= 768) {
        setMobileDrawerOpen(false);
      }
    };
    window.addEventListener("popstate", onPopState);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [toggleSidebar]);

  // Prevent background body scrolling while mobile navigation drawer is open
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (mobileDrawerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileDrawerOpen]);

  // Check public shared capture URL route
  const currentPath = typeof window !== "undefined" ? window.location.pathname : "";
  if (currentPath.startsWith("/shared/capture/")) {
    const shareToken = currentPath.replace("/shared/capture/", "").trim();
    return (
      <Suspense fallback={<div className="empty" style={{ paddingTop: 120 }}>Loading Capture…</div>}>
        <SharedCapture shareToken={shareToken} />
      </Suspense>
    );
  }

  // Check password reset URL route
  if (currentPath.startsWith("/reset-password")) {
    const searchParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    const token = searchParams.get("token") || "";
    return (
      <Suspense fallback={<div className="empty" style={{ paddingTop: 120 }}>Loading…</div>}>
        <ResetPassword
          token={token}
          onBackToLogin={() => {
            if (typeof window !== "undefined") window.location.href = "/";
          }}
          onBackToHome={() => {
            if (typeof window !== "undefined") window.location.href = "/";
          }}
        />
      </Suspense>
    );
  }

  useEffect(() => {
    if (!hasToken()) { setBooting(false); return; }
    api.me().then(setUser).catch(() => setToken("")).finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    const onUnauthorized = () => {
      startTransition(() => {
        setMobileDrawerOpen(false);
        setUser(null);
        setShowAuth(true);
      });
    };
    window.addEventListener("spark:unauthorized", onUnauthorized);
    return () => window.removeEventListener("spark:unauthorized", onUnauthorized);
  }, []);

  const refreshUser = () => api.me().then(setUser).catch(() => { });

  const handleNav = (targetTab) => {
    startTransition(() => {
      setMobileDrawerOpen(false);
      setShowUpgrade(false);
      setShowAccount(false);
      setTab(targetTab);
      localStorage.setItem("spark_active_tab", targetTab);
    });
  };

  const handleLogout = () => {
    setMobileDrawerOpen(false);
    setShowAccount(false);
    setShowUpgrade(false);
    setUser(null);
    setToken("");
    localStorage.removeItem("spark_token");
    localStorage.removeItem("spark_active_tab");
    setTab("tasks");
  };

  if (booting) return <div className="empty" style={{ paddingTop: 120 }}>Loading SparkDhi Workspace…</div>;
  if (!user) {
    return showAuth ? (
      <Suspense fallback={<div className="empty" style={{ paddingTop: 120 }}>Loading SparkDhi…</div>}>
        <Auth
          onAuthed={(u) => {
            startTransition(() => {
              setUser(u);
              setShowAuth(false);
              handleNav("tasks");
            });
          }}
          onBackToHome={() => setShowAuth(false)}
          initialMode={authMode}
        />
      </Suspense>
    ) : (
      <Suspense fallback={<div className="empty" style={{ paddingTop: 120 }}>Loading SparkDhi…</div>}>
        <Landing
          onGetStarted={() => { startTransition(() => { setAuthMode("signup"); setShowAuth(true); }); }}
          onLogin={() => { startTransition(() => { setAuthMode("login"); setShowAuth(true); }); }}
          theme={theme}
          onChangeTheme={handleChangeTheme}
        />
      </Suspense>
    );
  }

  const activeNavItem = NAVIGATION_ITEMS.find((item) => item.id === tab) || NAVIGATION_ITEMS[0];
  const activeWorkspaceLabel = showAccount
    ? "Account Profile"
    : showUpgrade
      ? "Plan & Billing"
      : activeNavItem.label;

  return (
    <div className={`app-layout ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      {/* Command Palette (⌘K) */}
      <CommandMenu
        isOpen={showCmdMenu}
        onClose={() => setShowCmdMenu(false)}
        onNavigate={handleNav}
      />

      {/* Desktop Collapsible Sidebar */}
      <aside
        id="desktop-sidebar"
        className={`app-sidebar ${sidebarCollapsed ? "collapsed" : ""}`}
        aria-label="Primary Sidebar Navigation"
        aria-hidden={sidebarCollapsed}
      >
        <div className="sidebar-header">
          <div
            className="spark-logo-lockup"
            onClick={() => handleNav("tasks")}
            style={{ cursor: "pointer", flex: 1, minWidth: 0 }}
            title="SparkDhi Tasks"
          >
            <Chakra size={28} />
            <span className="logo-mark" style={{ fontSize: 20 }}>SparkDhi</span>
          </div>
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={toggleSidebar}
            aria-label="Collapse sidebar"
            aria-expanded={!sidebarCollapsed}
            aria-controls="desktop-sidebar"
            title="Collapse sidebar (Ctrl+B)"
          >
            <Svg d={Ico.sidebarToggle} size={17} />
          </button>
        </div>

        <button
          type="button"
          className="sidebar-workspace"
          onClick={() => handleNav("tasks")}
          style={{ cursor: "pointer", textAlign: "left" }}
          title="Spark Tasks Workspace"
        >
          <span>⚡</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Tasks Workspace
          </span>
        </button>

        <nav className="sidebar-nav" aria-label="Workspace modules">
          {NAVIGATION_ITEMS.map((item) => {
            const isActive = tab === item.id && !showAccount && !showUpgrade;
            return (
              <button
                key={item.id}
                type="button"
                className={`sidebar-link ${isActive ? "active" : ""}`}
                onClick={() => handleNav(item.id)}
                aria-current={isActive ? "page" : undefined}
              >
                <Svg d={item.icon} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <button
            type="button"
            className={`plan-chip ${user.plan === "pro" || user.plan === "plus" ? "pro" : ""}`}
            style={{ width: "100%", justifyContent: "center" }}
            onClick={() => { setShowAccount(false); setShowUpgrade(true); }}
          >
            {user.plan === "pro" ? "⚡ Pro Plan" : user.plan === "plus" ? "⭐ Plus Plan" : (user.entitlements?.trial?.active || user.trial_active) ? `🎁 14-Day Trial (${user.entitlements?.trial?.days_remaining ?? 14}d)` : "Choose Plan · Upgrade"}
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

      {/* Mobile Slide-Over Navigation Drawer (Hidden when closed) */}
      {mobileDrawerOpen && (
        <div
          className="nav-drawer-backdrop"
          onClick={closeMobileDrawer}
          data-testid="mobile-drawer-backdrop"
        >
          <aside
            id="mobile-nav-drawer"
            className="mobile-nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-header">
              <div
                className="spark-logo-lockup"
                onClick={() => handleNav("tasks")}
                style={{ cursor: "pointer", flex: 1, minWidth: 0 }}
                title="SparkDhi Tasks"
              >
                <Chakra size={28} />
                <span className="logo-mark" style={{ fontSize: 19 }}>SparkDhi</span>
              </div>
              <button
                type="button"
                className="drawer-close-btn"
                onClick={closeMobileDrawer}
                aria-label="Close navigation menu"
              >
                <Svg d={Ico.close} size={18} />
              </button>
            </div>

            <div className="drawer-quick-actions">
              <button
                type="button"
                className="drawer-new-task-btn"
                onClick={() => handleNav("tasks")}
              >
                <span>⚡</span>
                <span>Tasks Workspace</span>
              </button>
              <button
                type="button"
                className="drawer-search-btn"
                onClick={() => {
                  closeMobileDrawer();
                  setShowCmdMenu(true);
                }}
                aria-label="Search captures and tasks"
                title="Search (⌘K)"
              >
                🔍
              </button>
            </div>

            <div className="drawer-section-label">Workspaces</div>
            <nav className="drawer-nav" aria-label="Mobile workspace navigation">
              {NAVIGATION_ITEMS.map((item) => {
                const isActive = tab === item.id && !showAccount && !showUpgrade;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`drawer-nav-item ${isActive ? "active" : ""}`}
                    onClick={() => handleNav(item.id)}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <Svg d={item.icon} size={18} />
                    <div className="drawer-nav-text">
                      <span className="drawer-nav-title">{item.label}</span>
                      <span className="drawer-nav-desc">{item.desc}</span>
                    </div>
                  </button>
                );
              })}
            </nav>

            <div className="drawer-footer">
              <div className="drawer-secondary-links">
                <button
                  type="button"
                  className={`drawer-nav-item compact ${showUpgrade ? "active" : ""}`}
                  onClick={() => {
                    closeMobileDrawer();
                    setShowAccount(false);
                    setShowUpgrade(true);
                  }}
                >
                  <Svg d={Ico.upgrade} size={17} />
                  <span className="drawer-nav-title">Plan & Billing</span>
                  <span className="drawer-plan-pill">
                    {user.plan === "pro" ? "Pro" : user.plan === "plus" ? "Plus" : "Trial"}
                  </span>
                </button>

                <button
                  type="button"
                  className={`drawer-nav-item compact ${showAccount ? "active" : ""}`}
                  onClick={() => {
                    closeMobileDrawer();
                    setShowUpgrade(false);
                    setShowAccount(true);
                  }}
                >
                  <Svg d={Ico.user} size={17} />
                  <span className="drawer-nav-title">Account Profile</span>
                </button>
              </div>

              <div className="drawer-theme-row">
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-soft)" }}>Theme</span>
                <div className="drawer-theme-segmented" role="group" aria-label="Appearance theme">
                  {[
                    { id: "light", icon: "☀️", label: "Light" },
                    { id: "dark", icon: "🌙", label: "Dark" },
                    { id: "system", icon: "◐", label: "Auto" },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleChangeTheme(m.id)}
                      className={theme === m.id ? "active" : ""}
                    >
                      {m.icon} {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="drawer-user-row">
                <div
                  className="drawer-user-info"
                  onClick={() => {
                    closeMobileDrawer();
                    setShowUpgrade(false);
                    setShowAccount(true);
                  }}
                >
                  <Avatar src={user?.avatar_url} name={user?.name || "User"} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {user?.name || "Spark User"}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ink-soft)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {user?.email}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="drawer-logout-btn"
                  onClick={handleLogout}
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <Svg d={Ico.logout} size={17} />
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Workspace */}
      <main className="app-main">
        {/* Mobile Header (< 768px) — ChatGPT-style top-left two-line hamburger + active workspace */}
        <header className="topbar-mobile">
          <div className="topbar-mobile-left">
            <button
              type="button"
              className="hamburger-btn"
              onClick={toggleMobileDrawer}
              aria-label="Open navigation menu"
              aria-expanded={mobileDrawerOpen}
              aria-controls="mobile-nav-drawer"
              title="Menu"
            >
              <Svg d={Ico.hamburger} size={20} />
            </button>

            <div
              className="spark-logo-lockup mobile-header-brand"
              onClick={() => handleNav("tasks")}
              title="SparkDhi Tasks"
            >
              <Chakra size={24} />
              <span className="logo-mark" style={{ fontSize: 17 }}>SparkDhi</span>
              <span className="mobile-workspace-pill">{activeWorkspaceLabel}</span>
            </div>
          </div>

          <div className="topbar-mobile-right">
            <button
              type="button"
              onClick={() => setShowCmdMenu(true)}
              className="mobile-icon-btn"
              aria-label="Search captures and tasks"
              title="Search (⌘K)"
            >
              🔍
            </button>

            <button
              type="button"
              onClick={() => {
                const nextTheme = theme === "dark" ? "light" : theme === "light" ? "system" : "dark";
                handleChangeTheme(nextTheme);
              }}
              aria-label={`Current theme: ${theme}. Click to switch theme`}
              title={`Theme: ${theme.charAt(0).toUpperCase() + theme.slice(1)}`}
              className="mobile-icon-btn"
            >
              {theme === "dark" ? "🌙" : theme === "light" ? "☀️" : "◐"}
            </button>

            <button
              type="button"
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}
              onClick={() => { setShowUpgrade(false); setShowAccount((a) => !a); }}
              aria-label="Account profile"
            >
              <Avatar src={user?.avatar_url} name={user?.name || "User"} size={28} />
            </button>
          </div>
        </header>

        {/* Desktop Header (>= 768px) */}
        <header className="topbar-desktop">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {sidebarCollapsed && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  type="button"
                  className="sidebar-expand-btn"
                  onClick={toggleSidebar}
                  aria-label="Expand sidebar"
                  aria-expanded={!sidebarCollapsed}
                  aria-controls="desktop-sidebar"
                  title="Expand sidebar (Ctrl+B)"
                >
                  <Svg d={Ico.hamburger} size={19} />
                </button>
                <div
                  className="spark-logo-lockup"
                  onClick={() => handleNav("tasks")}
                  style={{ cursor: "pointer", marginRight: 4 }}
                  title="SparkDhi Tasks"
                >
                  <Chakra size={26} />
                  <span className="logo-mark" style={{ fontSize: 18 }}>SparkDhi</span>
                </div>
              </div>
            )}

            <div className="cmd-search-trigger" onClick={() => setShowCmdMenu(true)}>
              <span>🔍</span>
              <span style={{ flex: 1 }}>Search captures, tasks...</span>
              <kbd style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 4, padding: "1px 5px", fontSize: 11 }}>⌘K</kbd>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button
              type="button"
              className={`plan-chip ${user.plan === "pro" || user.plan === "plus" ? "pro" : ""}`}
              onClick={() => { setShowAccount(false); setShowUpgrade(true); }}
            >
              {user.plan === "pro" ? "Pro" : user.plan === "plus" ? "Plus" : (user.entitlements?.trial?.active || user.trial_active) ? "14-Day Trial" : "Upgrade"}
            </button>

            <button
              type="button"
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
              type="button"
              style={{ background: "none", border: "none", cursor: "pointer", padding: 2, borderRadius: "50%" }}
              onClick={() => { setShowUpgrade(false); setShowAccount((a) => !a); }}
              aria-label="Account profile"
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
                  onLogout={handleLogout}
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
                    <Study onNavigate={handleNav} />
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
    </div>
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

  if (mode === "forgot") {
    return (
      <ForgotPassword
        goToLogin={() => setMode("login")}
        onBackToHome={onBackToHome}
      />
    );
  }

  if (mode === "login") {
    return (
      <Login
        onAuthed={handleAuth}
        goToSignup={() => setMode("signup")}
        onForgotPassword={() => setMode("forgot")}
        onBackToHome={onBackToHome}
      />
    );
  }
  return <Signup onAuthed={handleAuth} goToLogin={() => setMode("login")} onBackToHome={onBackToHome} />;
}
