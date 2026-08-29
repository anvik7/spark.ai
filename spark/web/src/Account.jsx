import React, { useState, useRef } from "react";
import { api, setToken } from "./api.js";
import Avatar from "./components/Avatar.jsx";

export default function Account({ user = {}, onLogout, onUpdateUser }) {
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef();

  const logout = () => {
    setBusy(true);
    setToken("");
    onLogout?.();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setErr("Please select a valid image file (PNG, JPG, WebP, GIF).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErr("Image file size must be under 5MB.");
      return;
    }

    setUploading(true);
    setErr("");

    try {
      const updatedUser = await api.uploadAvatar(file);
      onUpdateUser?.(updatedUser);
    } catch (error) {
      setErr(error.message || "Failed to upload profile photo.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleRemoveAvatar = async () => {
    setUploading(true);
    setErr("");
    try {
      const updatedUser = await api.deleteAvatar();
      onUpdateUser?.(updatedUser);
    } catch (error) {
      setErr(error.message || "Failed to remove profile photo.");
    } finally {
      setUploading(false);
    }
  };

  const isPro = user?.plan === "pro";
  const cardCount = user?.card_count || 0;
  const freeLimit = user?.free_card_limit || 1;
  const pct = Math.min(100, Math.round((cardCount / freeLimit) * 100));
  const hasCustomAvatar = Boolean(user?.avatar_url);

  return (
    <div className="screen">
      <div className="eyebrow">Account</div>

      {/* Profile Header & Avatar Management */}
      <div style={{
        background: "var(--surface)", border: "1.5px solid var(--line)",
        borderRadius: "var(--r)", padding: 20, marginBottom: 16,
        boxShadow: "var(--sh-sm)", display: "flex", flexDirection: "column",
        alignItems: "center", textAlignment: "center", gap: 12
      }}>
        <div style={{ position: "relative" }}>
          <Avatar src={user?.avatar_url} name={user?.name || "User"} size={80} />
          {uploading && (
            <div style={{
              position: "absolute", inset: 0, borderRadius: "50%",
              background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center",
              justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 600
            }}>
              Uploading…
            </div>
          )}
        </div>

        <div style={{ textAlign: "center" }}>
          <h1 className="title" style={{ fontSize: 22, margin: 0 }}>{user?.name || "Your account"}</h1>
          <p className="sub" style={{ margin: "2px 0 0", fontSize: 13.5 }}>{user?.email}</p>
        </div>

        {err && <div className="err" style={{ width: "100%", margin: "4px 0 0", fontSize: 13 }}>{err}</div>}

        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{
              padding: "7px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600,
              border: "1px solid var(--line)", background: "var(--surface-2)",
              color: "var(--ink)", cursor: "pointer", transition: "all .15s"
            }}
          >
            {hasCustomAvatar ? "Change photo" : "Upload photo"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/heic"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />

          {hasCustomAvatar && (
            <button
              onClick={handleRemoveAvatar}
              disabled={uploading}
              style={{
                padding: "7px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600,
                border: "1px solid #FECACA", background: "#FEF2F2",
                color: "#DC2626", cursor: "pointer", transition: "all .15s"
              }}
            >
              Remove photo
            </button>
          )}
        </div>
      </div>

      {/* Plan Card */}
      <div style={{
        background: "var(--surface)", border: "1.5px solid var(--line)",
        borderRadius: "var(--r)", padding: 20, marginBottom: 16,
        boxShadow: "var(--sh-sm)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>Plan</span>
          <span style={{
            fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 20,
            background: isPro ? "linear-gradient(135deg, var(--marigold), var(--marigold-dark))" : "var(--surface-2)",
            color: isPro ? "#fff" : "var(--ink-soft)",
          }}>
            {isPro ? "Pro" : "Free"}
          </span>
        </div>

        {!isPro && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 6 }}>
              <span>Cards used</span>
              <span>{cardCount} / {freeLimit}</span>
            </div>
            <div style={{ height: 7, borderRadius: 4, background: "var(--surface-2)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: "var(--marigold)" }} />
            </div>
          </>
        )}

        {isPro && user?.plan_until && (
          <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: 0 }}>
            Renews {new Date(user.plan_until).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </p>
        )}
      </div>

      <button
        onClick={logout}
        disabled={busy}
        className="btn sm"
        style={{
          width: "100%", padding: "12px 16px", borderRadius: "var(--r-s)",
          border: "1px solid var(--line)", background: "var(--surface-2)",
          color: "var(--ink-soft)", fontSize: 14, fontWeight: 600, cursor: "pointer",
        }}
      >
        Log out
      </button>
    </div>
  );
}
