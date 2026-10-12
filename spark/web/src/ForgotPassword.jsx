import React, { useState } from "react";
import { api } from "./api.js";
import { Chakra } from "./Chakra.jsx";

export default function ForgotPassword({ goToLogin, onBackToHome }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErr("Please enter your email address.");
      return;
    }

    setBusy(true);
    setErr("");
    try {
      await api.forgotPassword(cleanEmail);
      setSubmitted(true);
    } catch (e) {
      setErr(e.message || "Unable to process password reset request. Please try again.");
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
          className="spark-logo-lockup"
          onClick={onBackToHome}
          title="Back to home"
          style={{ cursor: "pointer" }}
        >
          <Chakra size={32} />
          <span className="logo-mark" style={{ fontSize: 20 }}>SparkDhi</span>
        </div>
        <button
          type="button"
          onClick={goToLogin}
          style={{ background: "none", border: "none", color: "var(--ink-soft)", fontSize: 13, cursor: "pointer", padding: "8px 4px" }}
        >
          ← Back to Login
        </button>
      </header>

      {/* Main Container */}
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
          <div className="eyebrow" style={{ marginBottom: 4 }}>ACCOUNT RECOVERY</div>
          <h1 className="title" style={{ fontSize: 24, marginBottom: 6 }}>Forgot password?</h1>
          <p className="sub" style={{ marginBottom: 20, fontSize: 13.5, lineHeight: 1.45 }}>
            Enter your account email and we'll send you instructions to reset your password.
          </p>

          {err && <div className="err" style={{ marginBottom: 16 }}>{err}</div>}

          {submitted ? (
            <div>
              <div
                style={{
                  background: "var(--marigold-light, #FEF9EC)",
                  border: "1px solid var(--marigold, #F59E0B)",
                  borderRadius: 10,
                  padding: 16,
                  marginBottom: 20,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 8 }}>✉️</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>
                  Check your inbox
                </div>
                <div style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.5 }}>
                  If an account exists for <strong>{email}</strong>, we've sent password reset instructions. Please check your inbox and spam folder.
                </div>
              </div>

              <button
                type="button"
                className="primary"
                onClick={goToLogin}
                style={{ width: "100%", padding: "12px", fontSize: 14 }}
              >
                Return to Login
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 18 }}>
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

              <button
                className="primary"
                type="submit"
                disabled={busy || !email.trim()}
                style={{ width: "100%", padding: "14px", fontSize: 14, fontWeight: 700 }}
              >
                {busy ? "Sending reset link…" : "Send reset link"}
              </button>
            </form>
          )}

          <div style={{ textAlign: "center", marginTop: 22, borderTop: "1px solid var(--line)", paddingTop: 16 }}>
            <button
              type="button"
              onClick={goToLogin}
              style={{
                background: "none",
                border: "none",
                color: "var(--marigold-dark)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              ← Remembered password? Log in
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
