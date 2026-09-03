import React, { useEffect, useState, useRef, useCallback } from "react";
import { api } from "./api.js";

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function Circles({ onOpenUpgrade, user }) {
  const [circles, setCircles] = useState([]);
  const [discovered, setDiscovered] = useState([]);
  const [selectedCircle, setSelectedCircle] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // Action Menu (+ button)
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [activeModal, setActiveModal] = useState(null); // "public_community" | "private_chat" | "private_group"

  const isPaidUser = Boolean(user?.is_active_paid || user?.trial?.active);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [mine, publicComms] = await Promise.all([
        api.myCircles().catch(() => []),
        api.discoverCircles().catch(() => []),
      ]);
      setCircles(mine || []);
      setDiscovered(publicComms || []);
    } catch (e) {
      setErr(e.message || "Failed to load chat conversations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenCircle = (c) => {
    setSelectedCircle(c);
  };

  const handleBackToList = () => {
    setSelectedCircle(null);
    loadData();
  };

  // Filter conversations & public communities by search query
  const q = searchQuery.trim().toLowerCase();
  
  const publicCircles = circles.filter((c) => !c.isPrivate);
  const privateCircles = circles.filter((c) => c.isPrivate);

  const filteredPublicMine = publicCircles.filter((c) =>
    !q || c.name.toLowerCase().includes(q) || (c.latestMessage?.content && c.latestMessage.content.toLowerCase().includes(q))
  );

  const unjoinedPublic = discovered.filter(
    (dc) => !circles.some((mc) => mc.id === dc.id) && (!q || dc.name.toLowerCase().includes(q))
  );

  const filteredPrivateMine = privateCircles.filter((c) =>
    !q || c.name.toLowerCase().includes(q) || (c.latestMessage?.content && c.latestMessage.content.toLowerCase().includes(q))
  );

  if (selectedCircle) {
    return (
      <CircleDetail
        circle={selectedCircle}
        user={user}
        onBack={handleBackToList}
        onError={setErr}
      />
    );
  }

  return (
    <div className="screen">
      {/* Top Header Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h1 className="title" style={{ fontSize: 24, fontWeight: 800, margin: 0, color: "var(--ink)" }}>
          Chat
        </h1>

        {/* WeChat-inspired "+" Action Button */}
        <div style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setShowPlusMenu((prev) => !prev)}
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              border: "1px solid var(--line)",
              background: "var(--surface)",
              color: "var(--ink)",
              fontSize: 20,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
              boxShadow: "var(--sh-sm)",
            }}
          >
            +
          </button>

          {/* "+" Action Menu Dropdown */}
          {showPlusMenu && (
            <div
              style={{
                position: "absolute",
                right: 0,
                top: 42,
                width: 210,
                background: "var(--surface)",
                border: "1px solid var(--line)",
                borderRadius: 12,
                boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
                zIndex: 100,
                padding: "6px 0",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <button
                onClick={() => {
                  setShowPlusMenu(false);
                  setActiveModal("public_community");
                }}
                style={{
                  padding: "10px 14px",
                  background: "none",
                  border: "none",
                  textAlign: "left",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--ink)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span>🌐</span>
                <span>New Public Community</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#059669", background: "#D1FAE5", padding: "1px 5px", borderRadius: 4, marginLeft: "auto" }}>
                  FREE
                </span>
              </button>

              <button
                onClick={() => {
                  setShowPlusMenu(false);
                  if (!isPaidUser) {
                    onOpenUpgrade?.();
                  } else {
                    setActiveModal("private_chat");
                  }
                }}
                style={{
                  padding: "10px 14px",
                  background: "none",
                  border: "none",
                  textAlign: "left",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--ink)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span>👤</span>
                <span>New Private Chat</span>
                <span style={{ fontSize: 11 }}>🔒</span>
              </button>

              <button
                onClick={() => {
                  setShowPlusMenu(false);
                  if (!isPaidUser) {
                    onOpenUpgrade?.();
                  } else {
                    setActiveModal("private_group");
                  }
                }}
                style={{
                  padding: "10px 14px",
                  background: "none",
                  border: "none",
                  textAlign: "left",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--ink)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span>🔒</span>
                <span>New Private Group</span>
                <span style={{ fontSize: 11 }}>🔒</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {err && (
        <div className="err" style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>⚠️ {err}</span>
          <button onClick={() => setErr("")} style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 700, color: "inherit" }}>✕</button>
        </div>
      )}

      {/* Search Input Bar */}
      <div style={{ marginBottom: 16 }}>
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="🔍 Search conversations & public communities..."
          style={{
            width: "100%",
            padding: "9px 14px",
            borderRadius: 10,
            border: "1px solid var(--line)",
            fontSize: 13.5,
            background: "var(--surface-2)",
            color: "var(--ink)",
          }}
        />
      </div>

      {loading && (
        <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: "var(--ink-soft)" }}>
          Loading conversations…
        </div>
      )}

      {!loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* SECTION 1: PUBLIC COMMUNITIES (FREE FOR EVERYONE) */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 11.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--ink-soft)" }}>
                Public Communities (Free)
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#059669", background: "#D1FAE5", padding: "2px 8px", borderRadius: 10 }}>
                {filteredPublicMine.length + unjoinedPublic.length} Available
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {/* My Joined Public Communities */}
              {filteredPublicMine.map((c) => (
                <ConversationRow
                  key={c.id}
                  circle={c}
                  isJoined={true}
                  onSelect={() => handleOpenCircle(c)}
                />
              ))}

              {/* Discoverable Unjoined Public Communities */}
              {unjoinedPublic.map((c) => (
                <ConversationRow
                  key={c.id}
                  circle={c}
                  isJoined={false}
                  onSelect={async () => {
                    try {
                      const joined = await api.joinCircleById(c.id);
                      loadData();
                      handleOpenCircle(joined);
                    } catch (e) {
                      setErr(e.message || "Failed to join public community.");
                    }
                  }}
                />
              ))}

              {filteredPublicMine.length === 0 && unjoinedPublic.length === 0 && (
                <div style={{ padding: "18px 14px", background: "var(--surface-2)", borderRadius: 10, border: "1px dashed var(--line)", textAlign: "center", fontSize: 13, color: "var(--ink-soft)" }}>
                  No public communities found. Tap <b>+</b> to create one for free!
                </div>
              )}
            </div>
          </div>

          {/* SECTION 2: PRIVATE CONVERSATIONS (PAID) */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 11.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--ink-soft)" }}>
                Private Conversations 🔒
              </span>
            </div>

            {!isPaidUser ? (
              <div
                style={{
                  padding: 16,
                  borderRadius: 12,
                  background: "var(--surface)",
                  border: "1.5px solid var(--line)",
                  boxShadow: "var(--sh-sm)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 20 }}>🔒</span>
                  <div>
                    <h3 style={{ fontSize: 14.5, fontWeight: 700, margin: 0, color: "var(--ink)" }}>
                      Private Chat is a premium feature
                    </h3>
                    <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--ink-soft)" }}>
                      Keep your public Spark conversations free. Upgrade to connect privately 1-to-1 or create private groups.
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                  <button
                    onClick={onOpenUpgrade}
                    style={{
                      padding: "7px 16px",
                      borderRadius: 8,
                      border: "none",
                      background: "var(--p-gradient)",
                      color: "#ffffff",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Upgrade →
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {filteredPrivateMine.map((c) => (
                  <ConversationRow
                    key={c.id}
                    circle={c}
                    isJoined={true}
                    onSelect={() => handleOpenCircle(c)}
                  />
                ))}

                {filteredPrivateMine.length === 0 && (
                  <div style={{ padding: "18px 14px", background: "var(--surface-2)", borderRadius: 10, border: "1px dashed var(--line)", textAlign: "center", fontSize: 13, color: "var(--ink-soft)" }}>
                    No private chats yet. Tap <b>+</b> to start a private chat or group.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Creation Modals */}
      {activeModal === "public_community" && (
        <CreatePublicCommunityModal
          onClose={() => setActiveModal(null)}
          onCreated={(c) => {
            setActiveModal(null);
            loadData();
            handleOpenCircle(c);
          }}
          onError={setErr}
        />
      )}

      {activeModal === "private_chat" && (
        <CreatePrivateChatModal
          onClose={() => setActiveModal(null)}
          onCreated={(c) => {
            setActiveModal(null);
            loadData();
            handleOpenCircle(c);
          }}
          onError={setErr}
        />
      )}

      {activeModal === "private_group" && (
        <CreatePrivateGroupModal
          onClose={() => setActiveModal(null)}
          onCreated={(c) => {
            setActiveModal(null);
            loadData();
            handleOpenCircle(c);
          }}
          onError={setErr}
        />
      )}
    </div>
  );
}

/* ── WeChat-Style Conversation Row Component ────────────── */
function ConversationRow({ circle, isJoined, onSelect }) {
  const latest = circle.latestMessage;
  const icon = circle.avatarIcon || (circle.isPrivate ? "🔒" : "🌐");

  return (
    <div
      onClick={onSelect}
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        background: "var(--surface)",
        borderBottom: "1px solid var(--line)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        cursor: "pointer",
        transition: "background .15s ease",
      }}
    >
      {/* Compact Avatar */}
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 10,
          background: circle.isPrivate ? "var(--marigold-light)" : "var(--surface-2)",
          color: circle.isPrivate ? "var(--marigold-dark)" : "var(--ink)",
          fontSize: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          border: "1px solid var(--line)",
        }}
      >
        {icon}
      </div>

      {/* Message Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {circle.name}
          </span>
          <span style={{ fontSize: 11, color: "var(--ink-faint)", marginLeft: 6, flexShrink: 0 }}>
            {latest ? fmtDate(latest.createdAt) : ""}
          </span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12.5, color: "var(--ink-soft)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            {latest ? `${latest.senderName}: ${latest.content}` : circle.description || "Public community"}
          </span>

          {!isJoined && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelect();
              }}
              style={{
                marginLeft: 8,
                padding: "3px 10px",
                borderRadius: 6,
                border: "none",
                background: "var(--marigold-light)",
                color: "var(--marigold-dark)",
                fontSize: 11.5,
                fontWeight: 700,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              Join
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Create Public Community Modal (Free) ────────────── */
function CreatePublicCommunityModal({ onClose, onCreated, onError }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("General");
  const [icon, setIcon] = useState("🌐");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await api.createCircle({
        name: name.trim(),
        description: description.trim(),
        exam_tag: category,
        avatar_icon: icon,
        is_private: false,
      });
      onCreated(res);
    } catch (err) {
      onError(err.message || "Failed to create public community.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: 20, width: "100%", maxWidth: 420, boxShadow: "var(--sh-md)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--ink)" }}>New Public Community</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, fontWeight: 700 }}>✕</button>
        </div>

        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 0, marginBottom: 14 }}>
          Anyone on Spark can discover and join this community for free.
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-soft)", display: "block", marginBottom: 4 }}>Community Icon</label>
            <div style={{ display: "flex", gap: 8 }}>
              {["🌐", "📚", "💻", "🎨", "🔬", "🚀"].map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setIcon(ic)}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    border: icon === ic ? "1.5px solid var(--marigold)" : "1px solid var(--line)",
                    background: icon === ic ? "var(--marigold-light)" : "var(--surface-2)",
                    fontSize: 16,
                    cursor: "pointer",
                  }}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>

          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Community Name (e.g. AI Engineers Club)"
            required
            style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13.5, background: "var(--surface-2)", color: "var(--ink)" }}
          />

          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description..."
            style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13.5, background: "var(--surface-2)", color: "var(--ink)" }}
          />

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
            <button type="button" onClick={onClose} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface-2)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
            <button type="submit" disabled={busy || !name.trim()} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: busy || !name.trim() ? "var(--line)" : "var(--p-gradient)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{busy ? "Creating…" : "Create Community (Free)"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Create Private Chat Modal (Paid User Search) ────────────── */
function CreatePrivateChatModal({ onClose, onCreated, onError }) {
  const [query, setQuery] = useState("");
  const [usersList, setUsersList] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setUsersList([]);
      return;
    }
    const timer = setTimeout(() => {
      api.searchUsers(query.trim()).then(setUsersList).catch(() => setUsersList([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const handleSelectUser = async (targetUser) => {
    setBusy(true);
    try {
      const res = await api.createCircle({
        name: targetUser.name,
        target_user_id: targetUser.id,
        is_private: true,
        avatar_icon: "👤",
      });
      onCreated(res);
    } catch (err) {
      onError(err.message || "Failed to start private chat.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: 20, width: "100%", maxWidth: 420, boxShadow: "var(--sh-md)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--ink)" }}>New Private Chat 🔒</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, fontWeight: 700 }}>✕</button>
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search registered user by name or email..."
          autoFocus
          style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13.5, background: "var(--surface-2)", color: "var(--ink)", marginBottom: 12 }}
        />

        <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {usersList.map((u) => (
            <div
              key={u.id}
              onClick={() => handleSelectUser(u)}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                background: "var(--surface-2)",
                border: "1px solid var(--line)",
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
              }}
            >
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--marigold-light)", color: "var(--marigold-dark)", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
                👤
              </div>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>{u.name}</div>
                <div style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>{u.email}</div>
              </div>
            </div>
          ))}

          {query.trim() && usersList.length === 0 && (
            <div style={{ padding: 14, textAlign: "center", fontSize: 12.5, color: "var(--ink-soft)" }}>
              No registered user found matching "{query}"
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Create Private Group Modal (Paid) ────────────── */
function CreatePrivateGroupModal({ onClose, onCreated, onError }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await api.createCircle({
        name: name.trim(),
        description: description.trim(),
        is_private: true,
        avatar_icon: "🔒",
      });
      onCreated(res);
    } catch (err) {
      onError(err.message || "Failed to create private group.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: 20, width: "100%", maxWidth: 420, boxShadow: "var(--sh-md)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--ink)" }}>New Private Group 🔒</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, fontWeight: 700 }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Private Group Name"
            required
            style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13.5, background: "var(--surface-2)", color: "var(--ink)" }}
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Group Purpose / Description..."
            style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13.5, background: "var(--surface-2)", color: "var(--ink)" }}
          />

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
            <button type="button" onClick={onClose} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface-2)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
            <button type="submit" disabled={busy || !name.trim()} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: busy || !name.trim() ? "var(--line)" : "var(--p-gradient)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{busy ? "Creating…" : "Create Private Group"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Conversation Messaging View (CircleDetail) ────────────── */
function CircleDetail({ circle, user, onBack, onError }) {
  const [messages, setMessages] = useState([]);
  const [textInput, setTextInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef(null);

  const loadMessages = useCallback(async () => {
    try {
      const res = await api.getCircleMessages(circle.id);
      setMessages(res.messages || []);
    } catch (err) {
      onError(err.message || "Failed to load messages.");
    } finally {
      setLoading(false);
    }
  }, [circle.id, onError]);

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 4000);
    return () => clearInterval(interval);
  }, [loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if (!textInput.trim()) return;

    setSending(true);
    try {
      const newMsg = await api.sendMessage(circle.id, textInput.trim());
      setMessages((prev) => [...prev, newMsg]);
      setTextInput("");
    } catch (err) {
      onError(err.message || "Failed to send message.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 130px)", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, overflow: "hidden", boxShadow: "var(--sh-sm)" }}>
      {/* Header Bar */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)", background: "var(--surface-2)", display: "flex", alignItems: "center", justifyBetween: "space-between", gap: 12 }}>
        <button
          onClick={onBack}
          style={{ background: "none", border: "none", fontSize: 16, fontWeight: 700, color: "var(--ink)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
        >
          <span>←</span>
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {circle.name}
          </h2>
          <span style={{ fontSize: 11, color: circle.isPrivate ? "var(--marigold-dark)" : "#059669", fontWeight: 600 }}>
            {circle.isPrivate ? "🔒 Private Conversation" : "🌐 Public Community"}
          </span>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div style={{ flex: 1, padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
        {loading && (
          <div style={{ textAlign: "center", fontSize: 12.5, color: "var(--ink-soft)", paddingTop: 20 }}>
            Loading messages…
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div style={{ textAlign: "center", fontSize: 13, color: "var(--ink-soft)", paddingTop: 40 }}>
            No messages in this conversation yet. Send the first message!
          </div>
        )}

        {messages.map((m) => {
          const isMe = m.userId === user?.id;

          return (
            <div
              key={m.id}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: isMe ? "flex-end" : "flex-start",
              }}
            >
              <div style={{ fontSize: 11, color: "var(--ink-faint)", marginBottom: 2 }}>
                {isMe ? "You" : m.senderName} · {fmtDate(m.createdAt)}
              </div>

              <div
                style={{
                  maxWidth: "80%",
                  padding: "9px 14px",
                  borderRadius: isMe ? "14px 14px 2px 14px" : "14px 14px 14px 2px",
                  background: isMe ? "var(--marigold)" : "var(--surface-2)",
                  color: isMe ? "#ffffff" : "var(--ink)",
                  fontSize: 13.5,
                  lineHeight: 1.45,
                  wordBreak: "break-word",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                }}
              >
                {m.content}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Message Composer Footer */}
      <form onSubmit={handleSendMessage} style={{ padding: 10, borderTop: "1px solid var(--line)", background: "var(--surface)", display: "flex", gap: 8, alignItems: "center" }}>
        <input
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          placeholder="Write a message..."
          style={{
            flex: 1,
            padding: "9px 14px",
            borderRadius: 20,
            border: "1px solid var(--line)",
            fontSize: 13.5,
            background: "var(--surface-2)",
            color: "var(--ink)",
          }}
        />

        <button
          type="submit"
          disabled={sending || !textInput.trim()}
          style={{
            padding: "9px 18px",
            borderRadius: 20,
            border: "none",
            background: sending || !textInput.trim() ? "var(--line)" : "var(--p-gradient)",
            color: "#ffffff",
            fontSize: 13,
            fontWeight: 700,
            cursor: sending || !textInput.trim() ? "not-allowed" : "pointer",
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}
