import React, { useState } from "react";

async function req(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Something went wrong");
  return data;
}

export default function Signup({ onAuthed, goToLogin }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (password.length < 8) {
      setErr("Use at least 8 characters");
      return;
    }
    setBusy(true); setErr("");
    try {
      const data = await req("POST", "/api/auth/signup", { email, password, name });
      localStorage.setItem("spark_token", data.token);
      onAuthed?.(data.user);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <div className="eyebrow">Get started</div>
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
          onChange={e => setName(e.target.value)}
          autoFocus
        />
        <input
          className="field"
          style={{ marginBottom: 12 }}
          type="email"
          placeholder="you@email.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
        <input
          className="field"
          style={{ marginBottom: 18 }}
          type="password"
          placeholder="Password (min 8 characters)"
          value={password}
          onChange={e => setPassword(e.target.value)}
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
