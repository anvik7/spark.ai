import React, { useState, useEffect } from "react";
import { api } from "./api.js";
import { Chakra } from "./Chakra.jsx";

export default function ResetPassword({ token, onBackToLogin, onBackToHome }) {
  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState("");
  const [initErr, setInitErr] = useState("");

  // Form states
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [success, setSuccess] = useState(false);

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setInitErr("No password reset token provided. Please request a new reset link.");
      setVerifying(false);
      return;
    }

    setVerifying(true);
    setInitErr("");
    api.verifyResetToken(token)
      .then((res) => {
        setTokenValid(true);
        if (res?.masked_email) setMaskedEmail(res.masked_email);
      })
      .catch((e) => {
        setTokenValid(false);
        setInitErr(e.message || "This password reset link is invalid or has expired.");
      })
      .finally(() => setVerifying(false));
  }, [token]);

  // Validation rules
  const hasMinLen = password.length >= 8;
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const canSubmit = hasMinLen && passwordsMatch && !busy;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!hasMinLen) {
      setErr("Password must be at least 8 characters long.");
      return;
    }
    if (!passwordsMatch) {
      setErr("Passwords do not match. Please re-check.");
      return;
    }

    setBusy(true);
    setErr("");
    try {
      await api.resetPassword(token, password);
      setSuccess(true);
    } catch (e) {
      setErr(e.message || "Failed to reset password. Please request a new reset link.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen" style={{ display: "flex", flexDirection: "column", minHeight: "100vh", padding: "0 20px" }}>
      {/* Header */}
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
          onClick={onBackToLogin}
          style={{ background: "none", border: "none", color: "var(--ink-soft)", fontSize: 13, cursor: "pointer", padding: "8px 4px" }}
        >
          ← Log in
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
          <div className="eyebrow" style={{ marginBottom: 4 }}>SECURITY</div>
          <h1 className="title" style={{ fontSize: 24, marginBottom: 6 }}>Create new password</h1>

          {verifying ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "var(--ink-soft)" }}>
              <span className="spin" style={{ display: "inline-block", marginRight: 8 }} /> Verifying security link…
            </div>
          ) : initErr || !tokenValid ? (
            <div>
              <div
                style={{
                  background: "#FEF2F2",
                  border: "1px solid #FECACA",
                  borderRadius: 10,
                  padding: 16,
                  marginBottom: 20,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#DC2626", marginBottom: 6 }}>
                  Invalid or Expired Link
                </div>
                <div style={{ fontSize: 13, color: "#7F1D1D", lineHeight: 1.5 }}>
                  {initErr || "This password reset token has expired or was already used."}
                </div>
              </div>

              <button
                type="button"
                className="primary"
                onClick={onBackToLogin}
                style={{ width: "100%", padding: "12px", fontSize: 14 }}
              >
                Back to Login
              </button>
            </div>
          ) : success ? (
            <div>
              <div
                style={{
                  background: "var(--marigold-light, #FEF9EC)",
                  border: "1px solid var(--marigold, #F59E0B)",
                  borderRadius: 10,
                  padding: 20,
                  marginBottom: 20,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>
                  Password Reset Successful
                </div>
                <div style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.5 }}>
                  Your password has been securely updated. You can now log in to your SparkDhi workspace.
                </div>
              </div>

              <button
                type="button"
                className="primary"
                onClick={onBackToLogin}
                style={{ width: "100%", padding: "14px", fontSize: 14, fontWeight: 700 }}
              >
                Proceed to Login
              </button>
            </div>
          ) : (
            <div>
              {maskedEmail && (
                <p className="sub" style={{ marginBottom: 18, fontSize: 13.5 }}>
                  Updating password for <strong>{maskedEmail}</strong>
                </p>
              )}

              {err && <div className="err" style={{ marginBottom: 16 }}>{err}</div>}

              <form onSubmit={handleSubmit}>
                {/* New Password */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--ink-soft)", marginBottom: 6 }}>
                    New Password
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      className="field"
                      style={{ paddingRight: 44 }}
                      type={showPassword ? "text" : "password"}
                      placeholder="Minimum 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoFocus
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

                {/* Confirm New Password */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--ink-soft)", marginBottom: 6 }}>
                    Confirm New Password
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      className="field"
                      style={{ paddingRight: 44 }}
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Re-type new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      disabled={busy}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((s) => !s)}
                      title={showConfirmPassword ? "Hide password" : "Show password"}
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
                      {showConfirmPassword ? "🙈" : "👁️"}
                    </button>
                  </div>
                </div>

                {/* Requirements Checklist */}
                <div style={{ marginBottom: 20, fontSize: 12, color: "var(--ink-soft)", display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: hasMinLen ? "#059669" : "var(--ink-soft)" }}>
                    <span>{hasMinLen ? "✓" : "○"}</span>
                    <span>At least 8 characters</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: passwordsMatch ? "#059669" : "var(--ink-soft)" }}>
                    <span>{passwordsMatch ? "✓" : "○"}</span>
                    <span>Passwords match</span>
                  </div>
                </div>

                <button
                  className="primary"
                  type="submit"
                  disabled={!canSubmit}
                  style={{ width: "100%", padding: "14px", fontSize: 14, fontWeight: 700 }}
                >
                  {busy ? "Saving new password…" : "Reset Password"}
                </button>
              </form>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
