import React, { useState } from "react";
import { api, setToken } from "./api.js";

export default function Signup({ onAuthed, goToLogin }) {
  const [name, setName] = useState("");
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
      const data = await api.signup(email, password, name);
      const token = data.token || data.access_token;
      setToken(token);
      onAuthed?.(data.user);
    } catch (e) {
      setErr(e.message || "Signup failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <div className="eyebrow">GET STARTED</div>
      <h1 className="title">Create your Spark</h1>
      <p className="sub">Free plan included — upgrade any time.</p>

      {err && <div className="err">{err}</div>}

      <form onSubmit={submit}>
        <input
          className="field"
          style={{ marginBottom: 12 }}
          type="text"
          placeholder="Your name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="field"
          style={{ marginBottom: 12 }}
          type="email"
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
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
          {busy ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p style={{ textAlign: "center", marginTop: 18, fontSize: 14, color: "var(--ink-soft)" }}>
        Already have an account?{" "}
        <span
          style={{ color: "var(--marigold-dark)", fontWeight: 600, cursor: "pointer" }}
          onClick={goToLogin}
        >
          Log in
        </span>
      </p>
    </div>
  );
}