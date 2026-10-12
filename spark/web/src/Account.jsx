import React, { useState, useRef, useEffect } from "react";
import { api, setToken } from "./api.js";
import Avatar, { isImageAvatarUrl } from "./components/Avatar.jsx";

export default function Account({ user = {}, onLogout, onUpdateUser, theme = "system", onChangeTheme }) {
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [successMsg, setSuccessMsg] = useState("");
  const [err, setErr] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const logout = () => {
    setBusy(true);
    setToken("");
    onLogout?.();
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    e.target.value = "";
    setErr("");
    setSuccessMsg("");

    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setErr("Image file size exceeds 5MB limit. Please choose a smaller photo.");
      return;
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    const allowedExts = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
    if (!allowedTypes.includes(file.type) && !allowedExts.includes(ext)) {
      setErr("File format not supported. Allowed formats: PNG, JPG, JPEG, WEBP, GIF.");
      return;
    }

    if (previewUrl && previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }

    const objectUrl = URL.createObjectURL(file);
    setSelectedFile(file);
    setPreviewUrl(objectUrl);
  };

  const handleCancelPreview = () => {
    if (previewUrl && previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setSelectedFile(null);
    setErr("");
  };

  const handleSaveAvatar = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setErr("");
    setSuccessMsg("");
    try {
      const updatedUser = await api.uploadAvatar(selectedFile);
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(null);
      setSelectedFile(null);
      setSuccessMsg("Profile picture uploaded successfully!");
      onUpdateUser?.(updatedUser);
      setTimeout(() => setSuccessMsg(""), 3500);
    } catch (error) {
      setErr(error.message || "Failed to upload profile picture. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setUploading(true);
    setErr("");
    setSuccessMsg("");
    try {
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(null);
      setSelectedFile(null);

      const updatedUser = await api.deleteAvatar();
      setSuccessMsg("Profile picture removed. Reverted to default avatar.");
      onUpdateUser?.(updatedUser);
      setTimeout(() => setSuccessMsg(""), 3500);
    } catch (error) {
      setErr(error.message || "Failed to remove profile picture.");
    } finally {
      setUploading(false);
    }
  };

  const isPro = user?.plan === "pro";
  const isPlus = user?.plan === "plus";
  const isPaid = isPro || isPlus;
  const isTrial = user?.entitlements?.trial?.active || user?.trial_active;
  const trialDays = user?.entitlements?.trial?.days_remaining ?? (isTrial ? 14 : 0);
  const cardCount = user?.card_count || 0;
  const freeLimit = user?.free_card_limit || 1;
  const pct = Math.min(100, Math.round((cardCount / freeLimit) * 100));

  return (
    <div className="screen">
      <div className="eyebrow">Account</div>

      {/* Profile Header & Avatar Management Display */}
      <div
        style={{
          background: "var(--surface)",
          border: "1.5px solid var(--line)",
          borderRadius: "var(--r)",
          padding: 24,
          marginBottom: 16,
          boxShadow: "var(--sh-sm)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: 14,
        }}
      >
        <div style={{ position: "relative", display: "inline-block" }}>
          <Avatar src={previewUrl || user?.avatar_url} name={user?.name || "User"} size={88} />
          {previewUrl && (
            <span
              style={{
                position: "absolute",
                top: -4,
                right: -4,
                background: "var(--marigold-dark, #D97706)",
                color: "#fff",
                fontSize: 10,
                fontWeight: 700,
                padding: "2px 6px",
                borderRadius: 10,
                textTransform: "uppercase",
                letterSpacing: ".04em",
                boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
              }}
            >
              Preview
            </span>
          )}
        </div>

        <div>
          <h1 className="title" style={{ fontSize: 22, margin: 0 }}>
            {user?.name || "Your account"}
          </h1>
          <p className="sub" style={{ margin: "4px 0 0", fontSize: 13.5 }}>
            {user?.email}
          </p>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginTop: 8,
              fontSize: 12,
              fontWeight: 500,
              color: "var(--ink-soft)",
              background: "var(--surface-2)",
              padding: "4px 12px",
              borderRadius: 16,
              border: "1px solid var(--line)",
            }}
          >
            <span>{isImageAvatarUrl(user?.avatar_url) ? "Custom Profile Photo" : "Standard Initials"}</span>
          </div>
        </div>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          style={{ display: "none" }}
          onChange={handleFileSelect}
        />

        {/* Profile Picture Controls */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          {previewUrl ? (
            <>
              <button
                onClick={handleSaveAvatar}
                disabled={uploading}
                style={{
                  padding: "8px 16px",
                  borderRadius: "var(--r-s, 8px)",
                  background: "var(--marigold-dark, #D97706)",
                  color: "#fff",
                  border: "none",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: uploading ? "not-allowed" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {uploading ? "Saving photo…" : "✓ Save Photo"}
              </button>
              <button
                onClick={handleCancelPreview}
                disabled={uploading}
                style={{
                  padding: "8px 14px",
                  borderRadius: "var(--r-s, 8px)",
                  background: "var(--surface-2, #F1F5F9)",
                  color: "var(--ink-soft)",
                  border: "1px solid var(--line)",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: uploading ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                style={{
                  padding: "8px 16px",
                  borderRadius: "var(--r-s, 8px)",
                  background: "var(--surface-2, #F1F5F9)",
                  color: "var(--ink)",
                  border: "1px solid var(--line)",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: uploading ? "not-allowed" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                <span>{user?.avatar_url ? "Change Picture" : "Upload Picture"}</span>
              </button>
              {user?.avatar_url && (
                <button
                  onClick={handleRemoveAvatar}
                  disabled={uploading}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "var(--r-s, 8px)",
                    background: "transparent",
                    color: "var(--red, #DC2626)",
                    border: "1px solid rgba(220, 38, 38, 0.2)",
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: uploading ? "not-allowed" : "pointer",
                  }}
                >
                  {uploading ? "Removing…" : "Remove Picture"}
                </button>
              )}
            </>
          )}
        </div>

        {uploading && (
          <div style={{ fontSize: 12, color: "var(--ink-soft)", fontStyle: "italic" }}>
            Processing avatar update…
          </div>
        )}

        {successMsg && (
          <div
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: "var(--r-s, 8px)",
              background: "rgba(16, 185, 129, 0.1)",
              border: "1px solid rgba(16, 185, 129, 0.25)",
              color: "#059669",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            {successMsg}
          </div>
        )}

        {err && <div className="err" style={{ width: "100%", margin: "4px 0 0", fontSize: 13 }}>{err}</div>}
      </div>

      {/* Appearance / Theme Toggle */}
      <div
        style={{
          background: "var(--surface)",
          border: "1.5px solid var(--line)",
          borderRadius: "var(--r)",
          padding: 20,
          marginBottom: 16,
          boxShadow: "var(--sh-sm)",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: ".05em",
            color: "var(--ink-soft)",
            textTransform: "uppercase",
            marginBottom: 12,
          }}
        >
          Appearance
        </div>
        <div
          style={{
            display: "flex",
            gap: 0,
            borderRadius: 10,
            border: "1.5px solid var(--line)",
            overflow: "hidden",
          }}
        >
          {[
            { id: "light", icon: "☀️", label: "Light" },
            { id: "dark", icon: "🌙", label: "Dark" },
            { id: "system", icon: "◐", label: "System" },
          ].map((opt) => (
            <button
              key={opt.id}
              onClick={() => onChangeTheme?.(opt.id)}
              aria-label={`${opt.label} theme`}
              aria-pressed={theme === opt.id}
              style={{
                flex: 1,
                padding: "10px 8px",
                fontSize: 13,
                fontWeight: theme === opt.id ? 700 : 500,
                fontFamily: "var(--sans)",
                background: theme === opt.id ? "var(--marigold-light)" : "var(--surface-2)",
                color: theme === opt.id ? "var(--marigold-dark)" : "var(--ink-soft)",
                border: "none",
                borderRight: "1px solid var(--line)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                transition: "background .15s, color .15s",
              }}
            >
              <span>{opt.icon}</span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Plan Card */}
      <div
        style={{
          background: "var(--surface)",
          border: "1.5px solid var(--line)",
          borderRadius: "var(--r)",
          padding: 20,
          marginBottom: 16,
          boxShadow: "var(--sh-sm)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", display: "block" }}>Account Plan</span>
            <span style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
              {isPro
                ? "Full-power SparkDhi workspace · 1,000 AI calls/day, 10GB storage, Voice Interviews & Advanced Analytics."
                : isPlus
                ? "Everyday SparkDhi workspace · 100 AI calls/day, 1GB storage, Tasks & Career Intelligence."
                : isTrial
                ? `14-Day Full Access Trial (${trialDays} ${trialDays === 1 ? 'day' : 'days'} remaining) · Complete workspace unlocked.`
                : "Trial has ended · Upgrade to Plus or Pro to resume AI generation and uploads. Your data is safely preserved."}
            </span>
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              padding: "4px 12px",
              borderRadius: 20,
              background: isPro
                ? "linear-gradient(135deg, var(--marigold), var(--marigold-dark))"
                : isPlus
                ? "var(--marigold-light)"
                : isTrial
                ? "var(--surface-2)"
                : "rgba(239, 68, 68, 0.1)",
              color: isPro ? "#fff" : isPlus ? "var(--marigold-dark)" : isTrial ? "var(--ink)" : "#DC2626",
              flexShrink: 0,
              marginLeft: 12,
            }}
          >
            {isPro ? "Pro" : isPlus ? "Plus" : isTrial ? "14-Day Trial" : "Expired"}
          </span>
        </div>

        {isPaid && user?.plan_until && (
          <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: "8px 0 0" }}>
            {user?.subscription_status === "cancelled" ? "Cancels " : "Renews "}
            {new Date(user.plan_until).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
            {user?.billing_interval ? ` (${user.billing_interval}, ${user.billing_currency || 'INR'})` : ""}
          </p>
        )}
      </div>

      <button
        onClick={logout}
        disabled={busy}
        className="btn sm"
        style={{
          width: "100%",
          padding: "12px 16px",
          borderRadius: "var(--r-s)",
          border: "1px solid var(--line)",
          background: "var(--surface-2)",
          color: "var(--ink-soft)",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {busy ? "Logging out…" : "Log out"}
      </button>
    </div>
  );
}
