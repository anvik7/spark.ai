import React, { useState } from "react";
import { api, setToken } from "./api.js";
import { Chakra } from "./Chakra.jsx";

export default function Login({ onAuthed, goToSignup, onBackToHome }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const data = await api.login(email.trim(), password);
      const token = data.token || data.access_token;
      setToken(token);
      onAuthed?.(data.user);
    } catch (e) {
      setErr(e.message || "Failed to log in. Please check your email and password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen" style={{ display: "flex", flexDirection: "column", minHeight: "100vh", padding: "0 20px" }}>
      {/* Header with Logo */}
      <header
        style={{
          width: "100%",
          maxWidth: 440,
          margin: "0 auto",
          padding: "20px 0 10px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div
          onClick={onBackToHome}
          style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
          title="Back to home"
        >
          <Chakra size={24} />
          <span className="logo-mark" style={{ fontSize: 19, fontWeight: 700 }}>Spark</span>
        </div>
        <button
          onClick={onBackToHome}
          style={{ background: "none", border: "none", color: "var(--ink-soft)", fontSize: 13, cursor: "pointer" }}
        >
          ← Home
        </button>
      </header>

      {/* Main Centered Login Card */}
      <main style={{ width: "100%", maxWidth: 440, margin: "auto", padding: "20px 0 40px" }}>
        <div
          style={{
            background: "var(--surface, #FFFFFF)",
            border: "1.5px solid var(--line, #E5E7EB)",
            borderRadius: "var(--r, 16px)",
            padding: "28px 24px",
            boxShadow: "var(--sh-sm)",
          }}
        >
          <div className="eyebrow" style={{ marginBottom: 4 }}>WELCOME BACK</div>
          <h1 className="title" style={{ fontSize: 26, marginBottom: 4 }}>Log in to Spark</h1>
          <p className="sub" style={{ marginBottom: 20, fontSize: 14 }}>Pick up where you left off.</p>

          {err && <div className="err" style={{ marginBottom: 16 }}>{err}</div>}

          <form onSubmit={submit}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--ink-soft)", marginBottom: 6 }}>
                Email Address
              </label>
              <input
                className="field"
                type="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                disabled={busy}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--ink-soft)", marginBottom: 6 }}>
                Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  className="field"
                  style={{ paddingRight: 44 }}
                  type={showPassword ? "text" : "password"}
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={busy}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  title={showPassword ? "Hide password" : "Show password"}
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 16,
                    color: "var(--ink-soft)",
                    padding: 4,
                  }}
                >
                  {showPassword ? "🙈" : "👁️"}
                </button>
              </div>
            </div>

            <button className="primary" type="submit" disabled={busy} style={{ width: "100%", padding: "14px" }}>
              {busy ? "Logging in…" : "Log in"}
            </button>
          </form>

          <p style={{ textAlign: "center", marginTop: 20, fontSize: 13.5, color: "var(--ink-soft)", margin: "20px 0 0" }}>
            New here?{" "}
            <span
              style={{ color: "var(--marigold-dark)", fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}
              onClick={goToSignup}
            >
              Create an account
            </span>
          </p>
        </div>
      </main>
    </div>
  );
}