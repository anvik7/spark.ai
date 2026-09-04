import React, { useEffect, useState, useRef, useCallback } from "react";
import { api } from "./api.js";
import EmojiPicker from "./components/chat/EmojiPicker.jsx";

const QUICK_REACTIONS = ["❤️", "😂", "🔥", "👍", "👀", "🫡"];

/* ── Helper Functions & Constants ────────────────────────────── */

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return "Yesterday " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + " " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function fmtDateDivider(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// 12 Original Spark Expressive Stickers
const SPARK_STICKERS = [
  { id: "spark_bolt", name: "Spark Power", icon: "⚡", bg: "#FEF3C7", text: "#92400E", label: "Spark Power!" },
  { id: "spark_brain", name: "Deep Focus", icon: "🧠", bg: "#EDE9FE", text: "#6D28D9", label: "Deep Focus" },
  { id: "spark_fire", name: "On Fire", icon: "🔥", bg: "#FEE2E2", text: "#B91C1C", label: "On Fire!" },
  { id: "spark_target", name: "Nailed It", icon: "🎯", bg: "#ECFDF5", text: "#047857", label: "Nailed It!" },
  { id: "spark_thinking", name: "Hmm...", icon: "🤔", bg: "#FEF3C7", text: "#B45309", label: "Thinking..." },
  { id: "spark_rocket", name: "Launching", icon: "🚀", bg: "#E0F2FE", text: "#0369A1", label: "To The Moon!" },
  { id: "spark_wave", name: "Hey Sparkler", icon: "👋", bg: "#FCE7F3", text: "#BE185D", label: "Hey Sparkler!" },
  { id: "spark_party", name: "Congrats", icon: "🎉", bg: "#FEF3C7", text: "#D97706", label: "Celebration!" },
  { id: "spark_heart", name: "Spark Love", icon: "💜", bg: "#F3E8FF", text: "#7E22CE", label: "Appreciate You" },
  { id: "spark_clap", name: "Applause", icon: "👏", bg: "#ECFDF5", text: "#065F46", label: "Well Done!" },
  { id: "spark_bulb", name: "Aha Idea", icon: "💡", bg: "#FEF9C3", text: "#854D0E", label: "Great Idea!" },
  { id: "spark_star", name: "Superb", icon: "⭐", bg: "#FEF3C7", text: "#A16207", label: "Superb Work!" },
];

function getStickerInfo(stickerId) {
  return SPARK_STICKERS.find((s) => s.id === stickerId) || {
    id: stickerId,
    name: "Sticker",
    icon: "✨",
    bg: "#EDE9FE",
    text: "#6D28D9",
    label: "Spark Sticker",
  };
}

// Client-side Canvas Image Compression
function compressImage(file, maxWidth = 1024, maxHeight = 1024, quality = 0.8) {
  return new Promise((resolve) => {
    if (!file || !file.type.startsWith("image/")) {
      resolve(file);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressed = new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), {
                type: "image/jpeg",
                lastModified: Date.now(),
              });
              resolve(compressed);
            } else {
              resolve(file);
            }
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

/* ── MAIN CHAT COMPONENT ─────────────────────────────────────── */

export default function Circles({ onOpenUpgrade, user }) {
  const [circles, setCircles] = useState([]);
  const [discovered, setDiscovered] = useState([]);
  const [discoveredUsers, setDiscoveredUsers] = useState([]);
  const [selectedCircle, setSelectedCircle] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // Action Menu (+ button)
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [activeModal, setActiveModal] = useState(null); // "public_community" | "private_chat" | "private_group"
  const [userProfileTarget, setUserProfileTarget] = useState(null);

  const isPaidUser = Boolean(user?.is_active_paid || user?.trial?.active || user?.plan === "pro" || user?.plan === "plus");

  const loadData = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [mine, publicComms] = await Promise.all([
        api.myCircles().catch(() => []),
        api.discoverCircles().catch(() => []),
      ]);
      setCircles(mine || []);
      setDiscovered(publicComms || []);
    } catch (e) {
      setErr(e.message || "Failed to load conversations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle live user search for stranger discovery
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setDiscoveredUsers([]);
      return;
    }
    const timer = setTimeout(() => {
      api.searchUsers(q)
        .then(setDiscoveredUsers)
        .catch(() => setDiscoveredUsers([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleOpenCircle = (c) => {
    setSelectedCircle(c);
  };

  const handleBackToList = () => {
    setSelectedCircle(null);
    loadData();
  };

  const startPrivateChatWithUser = async (targetUser) => {
    if (!isPaidUser) {
      onOpenUpgrade?.();
      return;
    }
    try {
      const circle = await api.createCircle({
        name: targetUser.name,
        target_user_id: targetUser.id,
        is_private: true,
        avatar_icon: "👤",
      });
      setUserProfileTarget(null);
      loadData();
      handleOpenCircle(circle);
    } catch (e) {
      setErr(e.message || "Failed to start private chat.");
    }
  };

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
        isPaidUser={isPaidUser}
        onBack={handleBackToList}
        onOpenUpgrade={onOpenUpgrade}
        onError={setErr}
      />
    );
  }

  return (
    <div className="screen" style={{ maxWidth: 860, margin: "0 auto", padding: "12px 16px 80px" }}>
      {/* Spark Chat Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: "var(--ink)", display: "flex", alignItems: "center", gap: 8 }}>
            <span>Spark Chat</span>
            <span style={{ fontSize: 11, fontWeight: 700, background: "#8B5CF6", color: "#FFF", padding: "2px 8px", borderRadius: 12 }}>
              Social
            </span>
          </h1>
          <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--ink-soft)" }}>
            Connect, discover people, and share study captures & ideas.
          </p>
        </div>

        {/* WeChat-inspired "+" Action Button */}
        <div style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setShowPlusMenu((prev) => !prev)}
            title="Start Conversation"
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              border: "1px solid var(--line)",
              background: "var(--surface)",
              color: "var(--ink)",
              fontSize: 22,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              transition: "transform .15s ease",
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
                top: 46,
                width: 220,
                background: "var(--surface)",
                border: "1px solid var(--line)",
                borderRadius: 14,
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
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 16 }}>🌐</span>
                <span style={{ flex: 1 }}>New Public Community</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#059669", background: "#D1FAE5", padding: "1px 6px", borderRadius: 4 }}>
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
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 16 }}>👤</span>
                <span style={{ flex: 1 }}>New Private 1-to-1</span>
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
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 16 }}>🔒</span>
                <span style={{ flex: 1 }}>New Private Group</span>
                <span style={{ fontSize: 11 }}>🔒</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {err && (
        <div style={{ padding: "10px 14px", borderRadius: 10, background: "#FEE2E2", border: "1px solid #FCA5A5", color: "#991B1B", fontSize: 13, marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>⚠️ {err}</span>
          <button onClick={() => setErr("")} style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 700, color: "inherit" }}>✕</button>
        </div>
      )}

      {/* Global Chat Search Bar */}
      <div style={{ marginBottom: 18, position: "relative" }}>
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="🔍 Search conversations, public communities & people..."
          style={{
            width: "100%",
            padding: "11px 16px",
            borderRadius: 12,
            border: "1px solid var(--line)",
            fontSize: 14,
            background: "var(--surface-2)",
            color: "var(--ink)",
            boxShadow: "inset 0 1px 2px rgba(0,0,0,0.03)",
          }}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            style={{
              position: "absolute",
              right: 12,
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              color: "var(--ink-soft)",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        )}
      </div>

      {loading && (
        <div style={{ padding: 40, textAlign: "center", color: "var(--ink-soft)", fontSize: 14 }}>
          <div className="spinner" style={{ marginBottom: 10 }}>⚡</div>
          Loading Spark conversations…
        </div>
      )}

      {!loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* SEARCH RESULTS OVERLAY IF TYPING */}
          {q && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "#8B5CF6", marginBottom: 8 }}>
                🔍 Search Results for "{searchQuery}"
              </div>

              {/* Discoverable Users Result */}
              {discoveredUsers.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ink-soft)", marginBottom: 6 }}>
                    People on Spark
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {discoveredUsers.map((u) => (
                      <div
                        key={u.id}
                        onClick={() => setUserProfileTarget(u.id)}
                        style={{
                          padding: "10px 14px",
                          borderRadius: 12,
                          background: "var(--surface)",
                          border: "1px solid var(--line)",
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#EDE9FE", color: "#6D28D9", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15 }}>
                          {u.avatarUrl ? <img src={u.avatarUrl} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} /> : "👤"}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{u.name}</div>
                          <div style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>Spark Learner · Tap to view profile</div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startPrivateChatWithUser(u);
                          }}
                          style={{
                            padding: "5px 12px",
                            borderRadius: 8,
                            border: "none",
                            background: "var(--p-gradient)",
                            color: "#FFF",
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          Message
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SECTION 1: RECENT CONVERSATIONS */}
          {!q && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--ink-soft)" }}>
                  Recent Conversations
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-soft)" }}>
                  {circles.length} Active
                </span>
              </div>

              {circles.length === 0 ? (
                <div style={{ padding: "28px 16px", background: "var(--surface)", borderRadius: 14, border: "1px dashed var(--line)", textAlign: "center" }}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>💬</div>
                  <h4 style={{ margin: "0 0 4px", fontSize: 14.5, fontWeight: 700, color: "var(--ink)" }}>
                    Your conversations will appear here
                  </h4>
                  <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-soft)" }}>
                    Join a public community below or tap <b>+</b> to start chatting with people.
                  </p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {circles.map((c) => (
                    <ConversationRow
                      key={c.id}
                      circle={c}
                      isJoined={true}
                      onSelect={() => handleOpenCircle(c)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SECTION 2: PUBLIC COMMUNITIES (FREE FOR EVERYONE) */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--ink-soft)", display: "flex", alignItems: "center", gap: 6 }}>
                <span>Public Communities</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#059669", background: "#D1FAE5", padding: "1px 6px", borderRadius: 4 }}>
                  FREE
                </span>
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#059669" }}>
                {filteredPublicMine.length + unjoinedPublic.length} Available
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
                <div style={{ padding: "18px 14px", background: "var(--surface-2)", borderRadius: 12, border: "1px dashed var(--line)", textAlign: "center", fontSize: 13, color: "var(--ink-soft)" }}>
                  No public communities found. Tap <b>+</b> to create a free community!
                </div>
              )}
            </div>
          </div>

          {/* SECTION 3: PRIVATE CHATS & GROUPS (PREMIUM INDICATOR & LIST) */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--ink-soft)", display: "flex", alignItems: "center", gap: 6 }}>
                <span>Private Conversations</span>
                <span style={{ fontSize: 11 }}>🔒</span>
              </span>
            </div>

            {!isPaidUser ? (
              <div
                style={{
                  padding: 16,
                  borderRadius: 14,
                  background: "linear-gradient(135deg, rgba(139,92,246,0.06), rgba(245,158,11,0.06))",
                  border: "1.5px solid rgba(139,92,246,0.2)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 16,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontSize: 24, width: 42, height: 42, borderRadius: 10, background: "#EDE9FE", color: "#6D28D9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    🔒
                  </div>
                  <div>
                    <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: "var(--ink)" }}>
                      Private 1-to-1 & Group Chats
                    </h4>
                    <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--ink-soft)" }}>
                      Public Spark communities are 100% free. Upgrade to unlock private 1-to-1 messaging.
                    </p>
                  </div>
                </div>

                <button
                  onClick={onOpenUpgrade}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 10,
                    border: "none",
                    background: "var(--p-gradient)",
                    color: "#FFF",
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    boxShadow: "0 2px 6px rgba(139,92,246,0.2)",
                  }}
                >
                  Upgrade →
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {filteredPrivateMine.map((c) => (
                  <ConversationRow
                    key={c.id}
                    circle={c}
                    isJoined={true}
                    onSelect={() => handleOpenCircle(c)}
                  />
                ))}

                {filteredPrivateMine.length === 0 && (
                  <div style={{ padding: "18px 14px", background: "var(--surface-2)", borderRadius: 12, border: "1px dashed var(--line)", textAlign: "center", fontSize: 13, color: "var(--ink-soft)" }}>
                    No private chats yet. Tap <b>+</b> to start a private conversation.
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

      {/* Stranger Public Profile Modal */}
      {userProfileTarget && (
        <UserProfileModal
          userId={userProfileTarget}
          onClose={() => setUserProfileTarget(null)}
          onMessage={(targetUser) => startPrivateChatWithUser(targetUser)}
          onError={setErr}
        />
      )}
    </div>
  );
}

/* ── Conversation Row Component ────────────────────────────── */

function ConversationRow({ circle, isJoined, onSelect }) {
  const latest = circle.latestMessage;
  const icon = circle.avatarIcon || (circle.isPrivate ? "🔒" : "🌐");

  return (
    <div
      onClick={onSelect}
      style={{
        padding: "12px 14px",
        borderRadius: 14,
        background: "var(--surface)",
        border: "1px solid var(--line)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        cursor: "pointer",
        transition: "all .15s ease",
        boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
      }}
    >
      {/* Avatar / Icon */}
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: circle.isPrivate ? "linear-gradient(135deg, #FEF3C7, #FDE68A)" : "var(--surface-2)",
          color: circle.isPrivate ? "#92400E" : "var(--ink)",
          fontSize: 22,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          border: "1px solid var(--line)",
          overflow: "hidden",
        }}
      >
        {icon.startsWith("http") ? (
          <img src={icon} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          icon
        )}
      </div>

      {/* Text Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
            <span style={{ fontSize: 14.5, fontWeight: 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {circle.name}
            </span>
            {circle.isPrivate && <span style={{ fontSize: 10 }}>🔒</span>}
          </div>
          <span style={{ fontSize: 11, color: "var(--ink-soft)", marginLeft: 6, flexShrink: 0 }}>
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
                marginLeft: 10,
                padding: "4px 12px",
                borderRadius: 8,
                border: "none",
                background: "#059669",
                color: "#FFF",
                fontSize: 11.5,
                fontWeight: 700,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              Join (Free)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── CONVERSATION MESSAGING VIEW (CircleDetail) ─────────────── */

function CircleDetail({ circle, user, isPaidUser, onBack, onOpenUpgrade, onError }) {
  const [messages, setMessages] = useState([]);
  const [textInput, setTextInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  // Attachment & Popup Menus
  const [showAttachmentSheet, setShowAttachmentSheet] = useState(false);
  const [showCapturePicker, setShowCapturePicker] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);

  // Reaction & Emoji States
  const [reactionBarMsgId, setReactionBarMsgId] = useState(null);
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState(null);
  const [showComposerEmojiPicker, setShowComposerEmojiPicker] = useState(false);
  const longPressTimerRef = useRef(null);

  // Selection & Modals
  const [selectedCapture, setSelectedCapture] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);
  const [deletingMsgId, setDeletingMsgId] = useState(null);
  const [reportingMsgId, setReportingMsgId] = useState(null);

  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);

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

  // Real-time polling (2.5s interval with visibility pause)
  useEffect(() => {
    loadMessages();
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        loadMessages();
      }
    }, 2500);
    return () => clearInterval(interval);
  }, [loadMessages]);

  // Auto-scroll to bottom on message load
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Dismiss reaction bar on outside tap/click
  useEffect(() => {
    const handleDocClick = () => {
      setReactionBarMsgId(null);
    };
    window.addEventListener("click", handleDocClick);
    return () => window.removeEventListener("click", handleDocClick);
  }, []);

  /* Message Sending Handlers */
  const handleSendText = async (e) => {
    e?.preventDefault();
    if (!textInput.trim() || sending) return;

    const contentStr = textInput.trim();
    setTextInput("");
    setSending(true);
    setShowComposerEmojiPicker(false);

    try {
      const newMsg = await api.sendMessage(circle.id, { content: contentStr, message_type: "text" });
      setMessages((prev) => [...prev, newMsg]);
    } catch (err) {
      onError(err.message || "Failed to send message.");
    } finally {
      setSending(false);
    }
  };

  /* Reaction Handlers with Optimistic UI and Rollback */
  const handleToggleReaction = async (msgId, emoji) => {
    setReactionBarMsgId(null);
    setReactionPickerMsgId(null);

    const prevMessages = [...messages];
    setMessages((current) =>
      current.map((m) => {
        if (m.id !== msgId) return m;
        const currentRx = m.reactions || [];
        const existingRx = currentRx.find((r) => r.reacted);
        let updatedRx = [];

        if (existingRx && existingRx.emoji === emoji) {
          // Toggle off (remove own reaction)
          updatedRx = currentRx
            .map((r) => {
              if (r.emoji === emoji) {
                const newCount = r.count - 1;
                const newUsers = (r.users || []).filter((u) => u.id !== user?.id);
                return { ...r, count: newCount, users: newUsers, reacted: false };
              }
              return r;
            })
            .filter((r) => r.count > 0);
        } else if (existingRx && existingRx.emoji !== emoji) {
          // Change own reaction
          const removedOld = currentRx
            .map((r) => {
              if (r.emoji === existingRx.emoji) {
                const newCount = r.count - 1;
                const newUsers = (r.users || []).filter((u) => u.id !== user?.id);
                return { ...r, count: newCount, users: newUsers, reacted: false };
              }
              return r;
            })
            .filter((r) => r.count > 0);

          const target = removedOld.find((r) => r.emoji === emoji);
          if (target) {
            updatedRx = removedOld.map((r) =>
              r.emoji === emoji
                ? {
                    ...r,
                    count: r.count + 1,
                    users: [...(r.users || []), { id: user?.id, name: user?.name || "Me" }],
                    reacted: true,
                  }
                : r
            );
          } else {
            updatedRx = [
              ...removedOld,
              {
                emoji,
                count: 1,
                users: [{ id: user?.id, name: user?.name || "Me" }],
                reacted: true,
              },
            ];
          }
        } else {
          // Add new reaction
          const target = currentRx.find((r) => r.emoji === emoji);
          if (target) {
            updatedRx = currentRx.map((r) =>
              r.emoji === emoji
                ? {
                    ...r,
                    count: r.count + 1,
                    users: [...(r.users || []), { id: user?.id, name: user?.name || "Me" }],
                    reacted: true,
                  }
                : r
            );
          } else {
            updatedRx = [
              ...currentRx,
              {
                emoji,
                count: 1,
                users: [{ id: user?.id, name: user?.name || "Me" }],
                reacted: true,
              },
            ];
          }
        }

        return { ...m, reactions: updatedRx };
      })
    );

    try {
      const res = await api.toggleMessageReaction(circle.id, msgId, emoji);
      if (res && res.reactions) {
        setMessages((current) =>
          current.map((m) => (m.id === msgId ? { ...m, reactions: res.reactions } : m))
        );
      }
    } catch (err) {
      setMessages(prevMessages);
      onError(err.message || "Failed to update reaction.");
    }
  };

  const handleTouchStartMessage = (msgId) => {
    longPressTimerRef.current = setTimeout(() => {
      setReactionBarMsgId(msgId);
    }, 420);
  };

  const handleTouchEndMessage = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleInsertComposerEmoji = (emoji) => {
    setTextInput((prev) => prev + emoji);
  };

  const handleSendImageFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setShowAttachmentSheet(false);
    setSending(true);

    try {
      // Compress client-side
      const compressed = await compressImage(file);
      const res = await api.uploadChatImage(compressed);
      const newMsg = await api.sendMessage(circle.id, {
        content: "Sent a photo 📷",
        message_type: "image",
        media_url: res.url,
      });
      setMessages((prev) => [...prev, newMsg]);
    } catch (err) {
      onError(err.message || "Failed to upload image.");
    } finally {
      setSending(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSendCaptureCard = async (capture) => {
    setShowCapturePicker(false);
    setShowAttachmentSheet(false);
    setSending(true);

    try {
      const newMsg = await api.sendMessage(circle.id, {
        content: `Shared Capture: ${capture.title || capture.raw.slice(0, 40)}`,
        message_type: "capture",
        capture_id: capture.id,
        capture_title: capture.title || capture.raw.slice(0, 50),
        capture_summary: capture.summary || capture.raw.slice(0, 120),
        capture_kind: capture.kind || "text",
      });
      setMessages((prev) => [...prev, newMsg]);
    } catch (err) {
      onError(err.message || "Failed to share Capture card.");
    } finally {
      setSending(false);
    }
  };

  /* Edit & Delete Handlers */
  const handleSaveEdit = async (msgId, newContent) => {
    try {
      const updated = await api.editMessage(circle.id, msgId, newContent);
      setMessages((prev) => prev.map((m) => (m.id === msgId ? updated : m)));
      setEditingMsg(null);
    } catch (err) {
      onError(err.message || "Failed to edit message.");
    }
  };

  const handleConfirmDelete = async (msgId) => {
    try {
      const deleted = await api.deleteMessage(circle.id, msgId);
      setMessages((prev) => prev.map((m) => (m.id === msgId ? deleted : m)));
      setDeletingMsgId(null);
    } catch (err) {
      onError(err.message || "Failed to delete message.");
    }
  };

  const handleMuteCircle = async () => {
    setShowOptionsMenu(false);
    try {
      if (circle.isMuted) {
        await api.unmuteCircle(circle.id);
      } else {
        await api.muteCircle(circle.id);
      }
      loadMessages();
    } catch (err) {
      onError(err.message || "Failed to update mute settings.");
    }
  };

  const handleBlockPartner = async () => {
    setShowOptionsMenu(false);
    if (!circle.targetUserId) return;
    if (confirm("Block this user? They will not be able to send you messages.")) {
      try {
        await api.blockUser(circle.targetUserId);
        onBack();
      } catch (err) {
        onError(err.message || "Failed to block user.");
      }
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 120px)", maxWidth: 860, margin: "0 auto", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.06)", position: "relative" }}>
      {/* Hidden File Input for Image Upload */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        onChange={handleSendImageFile}
        style={{ display: "none" }}
      />

      {/* Top Navigation Header Bar */}
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line)", background: "var(--surface-2)", display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={onBack}
          style={{ background: "none", border: "none", fontSize: 20, fontWeight: 700, color: "var(--ink)", cursor: "pointer", padding: "4px 8px", borderRadius: 8 }}
          title="Back to Conversations"
        >
          ←
        </button>

        <div style={{ width: 36, height: 36, borderRadius: 10, background: circle.isPrivate ? "linear-gradient(135deg, #FEF3C7, #FDE68A)" : "#EDE9FE", color: circle.isPrivate ? "#92400E" : "#6D28D9", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--line)" }}>
          {circle.avatarIcon || (circle.isPrivate ? "🔒" : "🌐")}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {circle.name}
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
            <span style={{ fontWeight: 700, color: circle.isPrivate ? "#D97706" : "#059669" }}>
              {circle.isPrivate ? "🔒 Private Conversation" : "🌐 Public Community (Free)"}
            </span>
            <span>·</span>
            <span style={{ color: "#059669", fontWeight: 600 }}>🟢 Active</span>
          </div>
        </div>

        {/* Options Menu Button */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setShowOptionsMenu((p) => !p)}
            style={{ background: "none", border: "none", fontSize: 18, fontWeight: 700, color: "var(--ink-soft)", cursor: "pointer", padding: "4px 8px", borderRadius: 8 }}
          >
            ⋮
          </button>

          {showOptionsMenu && (
            <div style={{ position: "absolute", right: 0, top: 34, width: 180, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", zIndex: 100, padding: "4px 0" }}>
              <button
                onClick={handleMuteCircle}
                style={{ width: "100%", padding: "8px 14px", background: "none", border: "none", textAlign: "left", fontSize: 13, color: "var(--ink)", cursor: "pointer" }}
              >
                {circle.isMuted ? "🔔 Unmute Notifications" : "🔕 Mute Notifications"}
              </button>

              {circle.isPrivate && circle.targetUserId && (
                <button
                  onClick={handleBlockPartner}
                  style={{ width: "100%", padding: "8px 14px", background: "none", border: "none", textAlign: "left", fontSize: 13, color: "#DC2626", cursor: "pointer" }}
                >
                  🚫 Block User
                </button>
              )}

              <button
                onClick={() => {
                  setShowOptionsMenu(false);
                  onBack();
                }}
                style={{ width: "100%", padding: "8px 14px", background: "none", border: "none", textAlign: "left", fontSize: 13, color: "var(--ink-soft)", cursor: "pointer" }}
              >
                🚪 Leave Conversation
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div style={{ flex: 1, padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, background: "var(--surface)" }}>
        {loading && (
          <div style={{ textAlign: "center", fontSize: 13, color: "var(--ink-soft)", paddingTop: 30 }}>
            <div className="spinner" style={{ marginBottom: 8 }}>⚡</div>
            Loading chat timeline…
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div style={{ textAlign: "center", fontSize: 13, color: "var(--ink-soft)", paddingTop: 50, paddingBottom: 50 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
            No messages in this conversation yet.<br />Send the first message or sticker below!
          </div>
        )}

        {!loading &&
          messages.map((m, idx) => {
            const isMe = m.userId === user?.id;
            const prevMsg = messages[idx - 1];
            const showDateDivider = !prevMsg || new Date(m.createdAt).toDateString() !== new Date(prevMsg.createdAt).toDateString();

            return (
              <React.Fragment key={m.id}>
                {showDateDivider && (
                  <div style={{ textAlign: "center", margin: "12px 0 6px" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-soft)", background: "var(--surface-2)", padding: "3px 12px", borderRadius: 12, border: "1px solid var(--line)" }}>
                      {fmtDateDivider(m.createdAt)}
                    </span>
                  </div>
                )}

                <div
                  onTouchStart={() => !m.isDeleted && handleTouchStartMessage(m.id)}
                  onTouchEnd={handleTouchEndMessage}
                  onTouchCancel={handleTouchEndMessage}
                  onContextMenu={(e) => {
                    if (!m.isDeleted) {
                      e.preventDefault();
                      setReactionBarMsgId((curr) => (curr === m.id ? null : m.id));
                    }
                  }}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: isMe ? "flex-end" : "flex-start",
                    position: "relative",
                  }}
                >
                  {/* Sender Name & Time */}
                  <div style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 3, display: "flex", gap: 6, alignItems: "center" }}>
                    {!isMe && <span style={{ fontWeight: 700, color: "var(--ink)" }}>{m.senderName}</span>}
                    <span>{fmtDate(m.createdAt)}</span>
                    {m.isEdited && <span style={{ fontStyle: "italic", color: "var(--ink-faint)" }}>(edited)</span>}
                  </div>

                  {/* Compact Quick Reaction Bar (shown on long-press or hover trigger) */}
                  {reactionBarMsgId === m.id && !m.isDeleted && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: "absolute",
                        bottom: "calc(100% - 2px)",
                        [isMe ? "right" : "left"]: 0,
                        zIndex: 60,
                        display: "flex",
                        alignItems: "center",
                        gap: 3,
                        background: "var(--surface)",
                        border: "1px solid var(--line)",
                        borderRadius: 24,
                        padding: "4px 8px",
                        boxShadow: "0 6px 20px rgba(0,0,0,0.16)",
                        animation: "fadeIn .12s ease",
                      }}
                    >
                      {QUICK_REACTIONS.map((em) => {
                        const hasReacted = (m.reactions || []).some((r) => r.emoji === em && r.reacted);
                        return (
                          <button
                            key={em}
                            type="button"
                            onClick={() => handleToggleReaction(m.id, em)}
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: "50%",
                              border: "none",
                              background: hasReacted ? "rgba(139, 92, 246, 0.18)" : "transparent",
                              cursor: "pointer",
                              fontSize: 19,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              transition: "transform .12s ease",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.22)")}
                            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
                          >
                            {em}
                          </button>
                        );
                      })}

                      {/* + button to open full emoji picker */}
                      <button
                        type="button"
                        onClick={() => {
                          setReactionBarMsgId(null);
                          setReactionPickerMsgId(m.id);
                        }}
                        title="All Emojis"
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          border: "1px solid var(--line)",
                          background: "var(--surface-2)",
                          color: "var(--ink)",
                          cursor: "pointer",
                          fontSize: 14,
                          fontWeight: 700,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          marginLeft: 2,
                        }}
                      >
                        +
                      </button>
                    </div>
                  )}

                  {/* Message Bubble Container */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, maxWidth: "82%" }}>
                    {/* Hover Action Menu trigger for own non-deleted text message */}
                    {isMe && !m.isDeleted && m.messageType === "text" && (
                      <div className="msg-actions" style={{ display: "flex", gap: 4 }}>
                        <button
                          onClick={() => setEditingMsg(m)}
                          title="Edit Message"
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--ink-soft)", padding: 2 }}
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => setDeletingMsgId(m.id)}
                          title="Delete Message"
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#DC2626", padding: 2 }}
                        >
                          🗑️
                        </button>
                      </div>
                    )}

                    {/* Quick Reaction Button for anyone */}
                    {!m.isDeleted && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setReactionBarMsgId((curr) => (curr === m.id ? null : m.id));
                        }}
                        title="React with emoji"
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          fontSize: 13,
                          color: "var(--ink-soft)",
                          padding: 2,
                          opacity: 0.65,
                          order: isMe ? -1 : 1,
                        }}
                      >
                        😊
                      </button>
                    )}

                    {/* Deleted Message Render */}
                    {m.isDeleted ? (
                      <div
                        style={{
                          padding: "8px 14px",
                          borderRadius: 14,
                          background: "var(--surface-2)",
                          color: "var(--ink-soft)",
                          fontSize: 12.5,
                          fontStyle: "italic",
                          border: "1px dashed var(--line)",
                        }}
                      >
                        🚫 [This message was deleted]
                      </div>
                    ) : m.messageType === "sticker" ? (
                      /* Sticker Message Render */
                      <StickerMessageBubble stickerId={m.stickerId} isMe={isMe} />
                    ) : m.messageType === "image" ? (
                      /* Image Message Render */
                      <div
                        onClick={() => setSelectedImage(m.mediaUrl)}
                        style={{
                          borderRadius: 14,
                          overflow: "hidden",
                          border: "1.5px solid var(--line)",
                          cursor: "pointer",
                          maxWidth: 240,
                          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                        }}
                      >
                        <img src={m.mediaUrl} alt="Chat attachment" style={{ width: "100%", maxHeight: 240, objectFit: "cover", display: "block" }} />
                      </div>
                    ) : m.messageType === "capture" ? (
                      /* Spark Capture Card Render */
                      <CaptureCardBubble
                        msg={m}
                        isMe={isMe}
                        onOpen={() => setSelectedCapture(m)}
                      />
                    ) : (
                      /* Standard Text Message Render */
                      <div
                        style={{
                          padding: "10px 15px",
                          borderRadius: isMe ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                          background: isMe ? "#8B5CF6" : "var(--surface-2)",
                          color: isMe ? "#FFFFFF" : "var(--ink)",
                          fontSize: 14,
                          lineHeight: 1.45,
                          wordBreak: "break-word",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                        }}
                      >
                        {m.content}
                      </div>
                    )}

                    {/* Report action for received message */}
                    {!isMe && !m.isDeleted && (
                      <button
                        onClick={() => setReportingMsgId(m.id)}
                        title="Report message"
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, opacity: 0.5, padding: 2 }}
                      >
                        🚩
                      </button>
                    )}
                  </div>

                  {/* Reaction Pills Badges below bubble */}
                  {m.reactions && m.reactions.length > 0 && !m.isDeleted && (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 4,
                        marginTop: 4,
                        justifyContent: isMe ? "flex-end" : "flex-start",
                      }}
                    >
                      {m.reactions.map((rx) => {
                        const usersList = (rx.users || []).map((u) => u.name).join(", ");
                        return (
                          <button
                            key={rx.emoji}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleReaction(m.id, rx.emoji);
                            }}
                            title={usersList ? `${usersList} reacted with ${rx.emoji}` : rx.emoji}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              padding: "2px 8px",
                              borderRadius: 12,
                              border: rx.reacted ? "1.5px solid #8B5CF6" : "1px solid var(--line)",
                              background: rx.reacted ? "rgba(139, 92, 246, 0.12)" : "var(--surface-2)",
                              color: rx.reacted ? "#8B5CF6" : "var(--ink)",
                              fontSize: 12,
                              fontWeight: rx.reacted ? 700 : 500,
                              cursor: "pointer",
                              boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                              transition: "all .12s ease",
                            }}
                          >
                            <span style={{ fontSize: 13 }}>{rx.emoji}</span>
                            <span style={{ fontSize: 11.5, fontWeight: 700 }}>{rx.count}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </React.Fragment>
            );
          })}
        <div ref={bottomRef} />
      </div>

      {/* Composer Attachment Action Sheet */}
      {showAttachmentSheet && (
        <div style={{ padding: "10px 14px", background: "var(--surface-2)", borderTop: "1px solid var(--line)", display: "flex", gap: 12, justifyContent: "space-around" }}>
          <button
            onClick={() => {
              setShowAttachmentSheet(false);
              setShowCapturePicker(true);
            }}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: "var(--ink)" }}
          >
            <div style={{ width: 42, height: 42, borderRadius: 12, background: "#EDE9FE", color: "#6D28D9", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>
              🎴
            </div>
            <span style={{ fontSize: 11, fontWeight: 700 }}>Share Capture</span>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", color: "var(--ink)" }}
          >
            <div style={{ width: 42, height: 42, borderRadius: 12, background: "#E0F2FE", color: "#0369A1", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>
              📷
            </div>
            <span style={{ fontSize: 11, fontWeight: 700 }}>Photo</span>
          </button>
        </div>
      )}

      {/* Floating Composer Emoji Picker */}
      {showComposerEmojiPicker && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            bottom: 66,
            right: 12,
            zIndex: 140,
            maxWidth: "calc(100% - 24px)",
            borderRadius: 16,
            boxShadow: "0 10px 32px rgba(0,0,0,0.18)",
          }}
        >
          <EmojiPicker
            anchorTitle="Insert Emoji"
            onSelectEmoji={(emoji) => handleInsertComposerEmoji(emoji)}
            onClose={() => setShowComposerEmojiPicker(false)}
          />
        </div>
      )}

      {/* Bottom Message Composer */}
      <form onSubmit={handleSendText} style={{ padding: "10px 12px", borderTop: "1px solid var(--line)", background: "var(--surface)", display: "flex", gap: 8, alignItems: "center", position: "relative" }}>
        <button
          type="button"
          onClick={() => {
            setShowComposerEmojiPicker(false);
            setShowAttachmentSheet((p) => !p);
          }}
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            border: "1px solid var(--line)",
            background: "var(--surface-2)",
            color: "var(--ink)",
            fontSize: 18,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
          title="Add Attachment (Capture, Photo)"
        >
          +
        </button>

        <input
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          placeholder="Write a message..."
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: 20,
            border: "1px solid var(--line)",
            fontSize: 14,
            background: "var(--surface-2)",
            color: "var(--ink)",
          }}
        />

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowAttachmentSheet(false);
            setShowComposerEmojiPicker((p) => !p);
          }}
          style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", padding: "0 4px" }}
          title="Emojis & Spark Reactions"
        >
          😊
        </button>

        <button
          type="submit"
          disabled={sending || !textInput.trim()}
          style={{
            padding: "9px 16px",
            borderRadius: 20,
            border: "none",
            background: sending || !textInput.trim() ? "var(--line)" : "var(--p-gradient)",
            color: "#FFF",
            fontSize: 13,
            fontWeight: 700,
            cursor: sending || !textInput.trim() ? "not-allowed" : "pointer",
            boxShadow: sending || !textInput.trim() ? "none" : "0 2px 6px rgba(139,92,246,0.3)",
          }}
        >
          Send
        </button>
      </form>

      {/* Message Reaction Picker Modal */}
      {reactionPickerMsgId && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            backdropFilter: "blur(2px)",
          }}
          onClick={() => setReactionPickerMsgId(null)}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: "100%" }}>
            <EmojiPicker
              anchorTitle="React with Emoji"
              onSelectEmoji={(emoji) => handleToggleReaction(reactionPickerMsgId, emoji)}
              onClose={() => setReactionPickerMsgId(null)}
            />
          </div>
        </div>
      )}

      {/* Capture Picker Modal */}
      {showCapturePicker && (
        <CapturePickerModal
          onClose={() => setShowCapturePicker(false)}
          onSelect={handleSendCaptureCard}
          onError={onError}
        />
      )}

      {/* Capture Detail Modal */}
      {selectedCapture && (
        <CaptureDetailModal
          msg={selectedCapture}
          onClose={() => setSelectedCapture(null)}
        />
      )}

      {/* Image Lightbox Preview Modal */}
      {selectedImage && (
        <ImageLightboxModal
          url={selectedImage}
          onClose={() => setSelectedImage(null)}
        />
      )}

      {/* Edit Message Modal */}
      {editingMsg && (
        <EditMessageModal
          msg={editingMsg}
          onClose={() => setEditingMsg(null)}
          onSave={(newContent) => handleSaveEdit(editingMsg.id, newContent)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deletingMsgId && (
        <DeleteConfirmationModal
          onClose={() => setDeletingMsgId(null)}
          onConfirm={() => handleConfirmDelete(deletingMsgId)}
        />
      )}

      {/* Report Message Modal */}
      {reportingMsgId && (
        <ReportMessageModal
          msgId={reportingMsgId}
          onClose={() => setReportingMsgId(null)}
          onError={onError}
        />
      )}
    </div>
  );
}

/* ── STICKER BUBBLE COMPONENT ───────────────────────────────── */

function StickerMessageBubble({ stickerId, isMe }) {
  const info = getStickerInfo(stickerId);
  return (
    <div
      style={{
        padding: "10px 14px",
        borderRadius: 16,
        background: info.bg,
        border: `1.5px solid ${info.text}33`,
        display: "flex",
        alignItems: "center",
        gap: 10,
        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
      }}
    >
      <span style={{ fontSize: 28 }}>{info.icon}</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 800, color: info.text }}>{info.label}</div>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: info.text, opacity: 0.8 }}>Spark Sticker</div>
      </div>
    </div>
  );
}

/* ── CAPTURE CARD BUBBLE COMPONENT ───────────────────────────── */

function CaptureCardBubble({ msg, isMe, onOpen }) {
  return (
    <div
      onClick={onOpen}
      style={{
        padding: "12px 14px",
        borderRadius: 14,
        background: "var(--surface)",
        border: "1.5px solid #8B5CF6",
        maxWidth: 280,
        cursor: "pointer",
        boxShadow: "0 4px 12px rgba(139,92,246,0.12)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: "#8B5CF6", background: "#EDE9FE", padding: "2px 8px", borderRadius: 6, textTransform: "uppercase" }}>
          🎴 Spark Capture
        </span>
        <span style={{ fontSize: 11, color: "var(--ink-soft)" }}>Tap to view →</span>
      </div>

      <h4 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 4px", color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {msg.captureTitle || "Shared Capture Card"}
      </h4>

      {msg.captureSummary && (
        <p style={{ margin: 0, fontSize: 12, color: "var(--ink-soft)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.4 }}>
          {msg.captureSummary}
        </p>
      )}
    </div>
  );
}

/* ── CAPTURE PICKER MODAL ───────────────────────────────────── */

function CapturePickerModal({ onClose, onSelect, onError }) {
  const [captures, setCaptures] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getCaptures()
      .then((res) => setCaptures(res.cards || res || []))
      .catch((err) => onError(err.message || "Failed to load saved Captures."))
      .finally(() => setLoading(false));
  }, [onError]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: 20, width: "100%", maxWidth: 440, maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 10px 30px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: "var(--ink)", display: "flex", alignItems: "center", gap: 6 }}>
            <span>🎴 Select Capture Card</span>
          </h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, fontWeight: 700 }}>✕</button>
        </div>

        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 0, marginBottom: 12 }}>
          Choose one of your saved Spark Captures to share in this chat.
        </p>

        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {loading && <div style={{ padding: 20, textAlign: "center", fontSize: 13, color: "var(--ink-soft)" }}>Loading Captures…</div>}

          {!loading && captures.length === 0 && (
            <div style={{ padding: 20, textAlign: "center", fontSize: 13, color: "var(--ink-soft)" }}>
              No saved Captures found. Create captures in the Capture tab first!
            </div>
          )}

          {captures.map((c) => (
            <div
              key={c.id}
              onClick={() => onSelect(c)}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                background: "var(--surface-2)",
                border: "1px solid var(--line)",
                cursor: "pointer",
                transition: "all .15s ease",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.title || c.raw.slice(0, 40)}
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#8B5CF6", background: "#EDE9FE", padding: "1px 6px", borderRadius: 4 }}>
                  {c.kind || "text"}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: "var(--ink-soft)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.summary || c.raw}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── CAPTURE DETAIL MODAL ───────────────────────────────────── */

function CaptureDetailModal({ msg, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
      <div style={{ background: "var(--surface)", border: "1.5px solid #8B5CF6", borderRadius: 16, padding: 20, width: "100%", maxWidth: 460, boxShadow: "0 12px 36px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: "#8B5CF6", background: "#EDE9FE", padding: "3px 10px", borderRadius: 8 }}>
            🎴 Shared Spark Capture Card
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, fontWeight: 700 }}>✕</button>
        </div>

        <h3 style={{ fontSize: 17, fontWeight: 800, margin: "0 0 10px", color: "var(--ink)" }}>
          {msg.captureTitle || "Shared Capture"}
        </h3>

        {msg.captureSummary && (
          <div style={{ padding: "12px 14px", borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--line)", marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-soft)", marginBottom: 4 }}>SUMMARY</div>
            <p style={{ margin: 0, fontSize: 13, color: "var(--ink)", lineHeight: 1.5 }}>
              {msg.captureSummary}
            </p>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 18px", borderRadius: 10, border: "none", background: "var(--p-gradient)", color: "#FFF", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── IMAGE LIGHTBOX MODAL ───────────────────────────────────── */

function ImageLightboxModal({ url, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 16 }}
    >
      <div style={{ position: "relative", maxWidth: "90vw", maxHeight: "90vh" }}>
        <button
          onClick={onClose}
          style={{ position: "absolute", right: -12, top: -12, width: 32, height: 32, borderRadius: "50%", background: "#FFF", border: "none", fontSize: 16, fontWeight: 700, cursor: "pointer" }}
        >
          ✕
        </button>
        <img src={url} alt="Full preview" style={{ maxWidth: "100%", maxHeight: "85vh", borderRadius: 12, display: "block" }} />
      </div>
    </div>
  );
}

/* ── EDIT MESSAGE MODAL ─────────────────────────────────────── */

function EditMessageModal({ msg, onClose, onSave }) {
  const [content, setContent] = useState(msg.content);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!content.trim()) return;
    onSave(content.trim());
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: 20, width: "100%", maxWidth: 400 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px", color: "var(--ink)" }}>Edit Message</h3>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13.5, background: "var(--surface-2)", color: "var(--ink)", resize: "vertical" }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" onClick={onClose} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface-2)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
            <button type="submit" disabled={!content.trim()} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--p-gradient)", color: "#FFF", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── DELETE CONFIRMATION MODAL ───────────────────────────────── */

function DeleteConfirmationModal({ onClose, onConfirm }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: 20, width: "100%", maxWidth: 360, textAlign: "center" }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px", color: "var(--ink)" }}>Delete Message?</h3>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--ink-soft)" }}>
          This message will be deleted from the chat history.
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface-2)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button onClick={onConfirm} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#DC2626", color: "#FFF", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Delete</button>
        </div>
      </div>
    </div>
  );
}

/* ── REPORT MESSAGE MODAL ────────────────────────────────────── */

function ReportMessageModal({ msgId, onClose, onError }) {
  const [reason, setReason] = useState("inappropriate");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.reportMessage(msgId, reason, details);
      alert("Report submitted. Thank you for helping keep Spark safe.");
      onClose();
    } catch (err) {
      onError(err.message || "Failed to submit report.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, padding: 20, width: "100%", maxWidth: 380 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px", color: "var(--ink)" }}>Report Message 🚩</h3>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <select value={reason} onChange={(e) => setReason(e.target.value)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13, background: "var(--surface-2)", color: "var(--ink)" }}>
            <option value="inappropriate">Inappropriate content</option>
            <option value="spam">Spam or flooding</option>
            <option value="harassment">Harassment / Bullying</option>
            <option value="other">Other</option>
          </select>
          <input
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Additional details (optional)..."
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13, background: "var(--surface-2)", color: "var(--ink)" }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface-2)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
            <button type="submit" disabled={busy} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#DC2626", color: "#FFF", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{busy ? "Submitting…" : "Submit Report"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── STRANGER USER PUBLIC PROFILE MODAL ───────────────────────── */

function UserProfileModal({ userId, onClose, onMessage, onError }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getUserPublicProfile(userId)
      .then(setProfile)
      .catch((err) => onError(err.message || "Failed to load user profile."))
      .finally(() => setLoading(false));
  }, [userId, onError]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}>
      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: 22, width: "100%", maxWidth: 380, textAlign: "center", boxShadow: "0 10px 30px rgba(0,0,0,0.2)" }}>
        {loading && <div style={{ padding: 20, fontSize: 13, color: "var(--ink-soft)" }}>Loading profile…</div>}

        {!loading && profile && (
          <>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#EDE9FE", color: "#6D28D9", fontSize: 26, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", border: "2px solid #8B5CF6" }}>
              {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} /> : "👤"}
            </div>

            <h3 style={{ fontSize: 17, fontWeight: 800, margin: "0 0 2px", color: "var(--ink)" }}>{profile.name}</h3>
            <div style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 14 }}>Spark Social Member</div>

            {profile.publicCommunities?.length > 0 && (
              <div style={{ margin: "0 0 16px", textAlign: "left" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-soft)", marginBottom: 6 }}>PUBLIC COMMUNITIES</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {profile.publicCommunities.map((c) => (
                    <span key={c.id} style={{ fontSize: 11.5, background: "var(--surface-2)", padding: "3px 8px", borderRadius: 6, border: "1px solid var(--line)" }}>
                      {c.avatarIcon} {c.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface-2)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Close</button>
              <button onClick={() => onMessage(profile)} style={{ padding: "8px 18px", borderRadius: 10, border: "none", background: "var(--p-gradient)", color: "#FFF", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Message</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── CREATION MODALS ─────────────────────────────────────────── */

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
      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: 22, width: "100%", maxWidth: 420 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: "var(--ink)" }}>New Public Community</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, fontWeight: 700 }}>✕</button>
        </div>

        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 0, marginBottom: 14 }}>
          Anyone on Spark can discover and join this community for free.
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-soft)", display: "block", marginBottom: 6 }}>Community Icon</label>
            <div style={{ display: "flex", gap: 8 }}>
              {["🌐", "📚", "💻", "🎨", "🔬", "🚀"].map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setIcon(ic)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    border: icon === ic ? "2px solid #8B5CF6" : "1px solid var(--line)",
                    background: icon === ic ? "#EDE9FE" : "var(--surface-2)",
                    fontSize: 18,
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
            style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 13.5, background: "var(--surface-2)", color: "var(--ink)" }}
          />

          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description..."
            style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 13.5, background: "var(--surface-2)", color: "var(--ink)" }}
          />

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
            <button type="button" onClick={onClose} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface-2)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
            <button type="submit" disabled={busy || !name.trim()} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--p-gradient)", color: "#FFF", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{busy ? "Creating…" : "Create Community (Free)"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

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
      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: 22, width: "100%", maxWidth: 420 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: "var(--ink)" }}>New Private Chat 🔒</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, fontWeight: 700 }}>✕</button>
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search registered user by name..."
          autoFocus
          style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 13.5, background: "var(--surface-2)", color: "var(--ink)", marginBottom: 12 }}
        />

        <div style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {usersList.map((u) => (
            <div
              key={u.id}
              onClick={() => handleSelectUser(u)}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                background: "var(--surface-2)",
                border: "1px solid var(--line)",
                display: "flex",
                alignItems: "center",
                gap: 12,
                cursor: "pointer",
              }}
            >
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#FEF3C7", color: "#92400E", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
                👤
              </div>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)" }}>{u.name}</div>
                <div style={{ fontSize: 11, color: "var(--ink-soft)" }}>Spark Member</div>
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
      <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: 22, width: "100%", maxWidth: 420 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: "var(--ink)" }}>New Private Group 🔒</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, fontWeight: 700 }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Private Group Name"
            required
            style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 13.5, background: "var(--surface-2)", color: "var(--ink)" }}
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Group Purpose / Description..."
            style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--line)", fontSize: 13.5, background: "var(--surface-2)", color: "var(--ink)" }}
          />

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
            <button type="button" onClick={onClose} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface-2)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
            <button type="submit" disabled={busy || !name.trim()} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--p-gradient)", color: "#FFF", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{busy ? "Creating…" : "Create Private Group"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
