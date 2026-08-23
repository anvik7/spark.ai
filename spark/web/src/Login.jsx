import React, { useState } from "react";
import { api, setToken } from "./api.js";

export default function Login({ onAuthed, goToSignup }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const data = await api.login(email, password);
      // Synchronize token state and localStorage
      const token = data.token || data.access_token;
      setToken(token);
      onAuthed?.(data.user);
    } catch (e) {
      setErr(e.message || "Failed to log in");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <div className="eyebrow">Welcome back</div>
      <h1 className="title">Log in to Spark</h1>
      <p className="sub">Pick up where you left off.</p>

      {err && <div className="err">{err}</div>}

      <form onSubmit={submit}>
        <input
          className="field"
          style={{ marginBottom: 12 }}
          type="email"
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />
        <input
          className="field"
          style={{ marginBottom: 18 }}
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>

      <p style={{ textAlign: "center", marginTop: 18, fontSize: 14, color: "var(--ink-soft)" }}>
        New here?{" "}
        <span
          style={{ color: "var(--marigold-dark)", fontWeight: 600, cursor: "pointer" }}
          onClick={goToSignup}
        >
          Create an account
        </span>
      </p>
    </div>
  );
}