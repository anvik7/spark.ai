import React, { useEffect, useState, useRef } from "react";
import { api } from "./api.js";
import Avatar from "./components/Avatar.jsx";

const EXAMS = ["JEE", "NEET", "GATE", "UPSC", "CAT", "CLAT", "Other"];

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function fmtTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export default function Circles() {
  const [tab, setTab] = useState("my");       // "my" | "discover" | "detail"
  const [myCircles, setMyCircles] = useState(null);
  const [discovered, setDiscovered] = useState(null);
  const [filterExam, setFilterExam] = useState("");
  const [selectedCircle, setSelectedCircle] = useState(null);
  const [err, setErr] = useState("");

  const loadMine = () => api.myCircles().then(setMyCircles).catch((e) => setErr(e.message));
  const loadDiscover = () => api.discoverCircles(filterExam).then(setDiscovered).catch((e) => setErr(e.message));

  useEffect(() => { loadMine(); }, []);
  useEffect(() => { if (tab === "discover") loadDiscover(); }, [tab, filterExam]);

  const openDetail = (circle) => { setSelectedCircle(circle); setTab("detail"); };
  const goBack = () => { setTab("my"); setSelectedCircle(null); loadMine(); };

  return (
    <div className="screen">
      <div className="eyebrow">Study Circles</div>
      <h1 className="title">Your Study Groups</h1>
      <p className="sub">
        Create or join private study circles. Share an invite code to let friends join.
      </p>

      {err && (
        <div className="err" style={{ marginBottom: 12 }}>
          {err}
          <button onClick={() => setErr("")} style={{ marginLeft: 8, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>✕</button>
        </div>
      )}

      {tab === "detail" && selectedCircle ? (
        <CircleDetail circle={selectedCircle} onBack={goBack} onError={setErr} />
      ) : (
        <>
          {/* Tab switcher */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <button
              className="btn"
              onClick={() => setTab("my")}
              style={{
                background: tab === "my" ? "var(--ink)" : "var(--surface-2)",
                color: tab === "my" ? "#fff" : "var(--ink-soft)",
                border: "1px solid var(--line)",
              }}
            >
              My Circles
            </button>
            <button
              className="btn"
              onClick={() => setTab("discover")}
              style={{
                background: tab === "discover" ? "var(--ink)" : "var(--surface-2)",
                color: tab === "discover" ? "#fff" : "var(--ink-soft)",
                border: "1px solid var(--line)",
              }}
            >
              Discover
            </button>
          </div>

          {tab === "my" && (
            <MyCirclesTab
              circles={myCircles}
              onOpen={openDetail}
              onReload={loadMine}
              onError={setErr}
            />
          )}

          {tab === "discover" && (
            <DiscoverTab
              circles={discovered}
              filterExam={filterExam}
              setFilterExam={setFilterExam}
              onOpen={openDetail}
              onJoined={() => { loadMine(); loadDiscover(); }}
              onError={setErr}
            />
          )}
        </>
      )}
    </div>
  );
}

/* ---------- My Circles Tab ---------- */
function MyCirclesTab({ circles, onOpen, onReload, onError }) {
  const [showCreate, setShowCreate] = useState(false);
  const [showJoinCode, setShowJoinCode] = useState(false);

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          className="btn"
          onClick={() => { setShowCreate(true); setShowJoinCode(false); }}
          style={{ background: "var(--marigold)", color: "#fff", border: "none", fontWeight: 600 }}
        >
          + Create Circle
        </button>
        <button
          className="btn"
          onClick={() => { setShowJoinCode(true); setShowCreate(false); }}
          style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }}
        >
          🔑 Join with Code
        </button>
      </div>

      {showCreate && (
        <CreateCircleForm
          onCreated={(c) => { setShowCreate(false); onReload(); onOpen(c); }}
          onCancel={() => setShowCreate(false)}
          onError={onError}
        />
      )}

      {showJoinCode && (
        <JoinCodeForm
          onJoined={(c) => { setShowJoinCode(false); onReload(); onOpen(c); }}
          onCancel={() => setShowJoinCode(false)}
          onError={onError}
        />
      )}

      {!circles && (
        <>{[1, 2].map((i) => (
          <div key={i} className="skeleton" style={{ height: 84, marginBottom: 12, borderRadius: "var(--r)" }} />
        ))}</>
      )}

      {circles && circles.length === 0 && !showCreate && !showJoinCode && (
        <div className="empty" style={{ padding: "40px 20px" }}>
          <span className="empty-icon">👥</span>
          <h3 className="empty-title">No circles joined yet</h3>
          <p className="empty-sub">Create your own private group or join one with an invite code.</p>
        </div>
      )}

      {circles && circles.map((c) => (
        <CircleCard key={c.id} c={c} onClick={() => onOpen(c)} />
      ))}
    </>
  );
}


/* ---------- Discover Tab ---------- */
function DiscoverTab({ circles, filterExam, setFilterExam, onOpen, onJoined, onError }) {
  return (
    <>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginBottom: 12 }}>
        <button
          className="tag"
          style={!filterExam ? { background: "var(--ink)", color: "#fff" } : {}}
          onClick={() => setFilterExam("")}
        >
          All Exams
        </button>
        {EXAMS.map((e) => (
          <button
            key={e}
            className="tag"
            style={filterExam === e ? { background: "var(--ink)", color: "#fff" } : {}}
            onClick={() => setFilterExam(e)}
          >
            {e}
          </button>
        ))}
      </div>

      {!circles && (
        <>{[1, 2].map((i) => (
          <div key={i} className="skeleton" style={{ height: 84, marginBottom: 12, borderRadius: "var(--r)" }} />
        ))}</>
      )}

      {circles && circles.length === 0 && (
        <div className="empty">No circles found for this filter. Be the first to create one!</div>
      )}

      {circles && circles.map((c) => (
        <CircleCard
          key={c.id}
          c={c}
          onClick={() => onOpen(c)}
          showJoin={!c.myRole}
          onJoin={() => {
            api.joinCircleById(c.id).then(() => onJoined()).catch((e) => onError(e.message));
          }}
        />
      ))}
    </>
  );
}


/* ---------- Forms ---------- */
function CreateCircleForm({ onCreated, onCancel, onError }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [exam, setExam] = useState("JEE");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await api.createCircle(name.trim(), desc.trim(), exam);
      onCreated(res);
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card" style={{ marginBottom: 16 }}>
      <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 10 }}>Create Study Circle</p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Circle Name (e.g., JEE Advanced 2027)"
        required
        style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--line)", marginBottom: 8, fontSize: 14 }}
      />
      <textarea
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="Short description or goal…"
        rows={2}
        style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--line)", marginBottom: 8, fontSize: 14 }}
      />
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>Exam Tag:</span>
        <select
          value={exam}
          onChange={(e) => setExam(e.target.value)}
          style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13, background: "var(--surface)" }}
        >
          {EXAMS.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="btn sm" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" className="btn sm" style={{ background: "var(--marigold)", color: "#fff", border: "none", fontWeight: 600 }} disabled={busy || !name.trim()}>
          {busy ? "Creating…" : "Create Circle"}
        </button>
      </div>
    </form>
  );
}

function JoinCodeForm({ onJoined, onCancel, onError }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    try {
      const res = await api.joinCircle(code.trim());
      onJoined(res);
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card" style={{ marginBottom: 16 }}>
      <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 10 }}>Join Circle with Code</p>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="Enter 6-character code (e.g. AB12CD)"
        required
        style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--line)", marginBottom: 12, fontSize: 14, letterSpacing: 1 }}
      />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="btn sm" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" className="btn sm" style={{ background: "var(--marigold)", color: "#fff", border: "none", fontWeight: 600 }} disabled={busy || !code.trim()}>
          {busy ? "Joining…" : "Join Circle"}
        </button>
      </div>
    </form>
  );
}

function CircleCard({ c, onClick, showJoin, onJoin }) {
  return (
    <article
      className="card"
      onClick={onClick}
      style={{ cursor: "pointer", transition: "all .15s ease", marginBottom: 12 }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <span className="eyebrow" style={{ margin: 0 }}>
            {c.examTag || "General"} · {c.memberCount} {c.memberCount === 1 ? "member" : "members"}
          </span>
          <p className="summary" style={{ marginTop: 4, fontSize: 17, fontWeight: 700, color: "var(--ink)" }}>{c.name}</p>
        </div>
        {showJoin && (
          <button
            className="btn"
            onClick={(e) => { e.stopPropagation(); onJoin?.(); }}
            style={{ fontSize: 12, padding: "4px 12px", whiteSpace: "nowrap" }}
          >
            Join
          </button>
        )}
      </div>
      {c.description && <p className="raw" style={{ marginTop: 4, fontSize: 13.5, color: "var(--ink-soft)" }}>{c.description}</p>}
      <div className="meta" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
        <span style={{ fontSize: 12, color: "var(--ink-faint)" }}>Created {fmtDate(c.createdAt)}</span>
        {c.myRole && <span className="tag" style={{ fontSize: 11, textTransform: "capitalize" }}>{c.myRole}</span>}
      </div>
    </article>
  );
}


/* ---------- Circle Detail ---------- */
function CircleDetail({ circle, onBack, onError }) {
  const [members, setMembers] = useState(null);
  const [info, setInfo] = useState(circle);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("chat"); // "chat" | "members"
  const [joining, setJoining] = useState(false);

  const isMember = Boolean(info.myRole);

  const reloadCircle = () => {
    api.circleMembers(circle.id).then(setMembers).catch((e) => onError(e.message));
    api.getCircle(circle.id).then(setInfo).catch(() => {});
  };

  useEffect(() => {
    reloadCircle();
  }, [circle.id]);

  const copyCode = () => {
    if (!info.inviteCode) return;
    navigator.clipboard.writeText(info.inviteCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleJoinDirect = async () => {
    setJoining(true);
    try {
      if (info.inviteCode) {
        await api.joinCircle(info.inviteCode);
      } else {
        await api.joinCircleById(info.id);
      }
      reloadCircle();
    } catch (e) {
      onError(e.message);
    } finally {
      setJoining(false);
    }
  };

  const handleLeave = async () => {
    if (!confirm("Leave this circle?")) return;
    try {
      await api.leaveCircle(info.id);
      onBack();
    } catch (e) {
      onError(e.message);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this circle? All members will be removed. This cannot be undone.")) return;
    try {
      await api.deleteCircle(info.id);
      onBack();
    } catch (e) {
      onError(e.message);
    }
  };

  return (
    <>
      <button
        onClick={onBack}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: "var(--ink-soft)", fontSize: 13, marginBottom: 12, padding: 0,
          display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 500
        }}
      >
        ← Back to circles
      </button>

      <article className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <span className="eyebrow" style={{ margin: 0 }}>
              {info.examTag || "Circle"} · {info.memberCount} {info.memberCount === 1 ? "member" : "members"}
            </span>
            <p className="summary" style={{ marginTop: 4, fontSize: 18, fontWeight: 700 }}>{info.name}</p>
          </div>
          {!isMember && (
            <button className="btn" onClick={handleJoinDirect} disabled={joining} style={{ fontSize: 13, padding: "6px 14px" }}>
              {joining ? <span className="spin" /> : "Join Circle"}
            </button>
          )}
        </div>

        {info.description && <p className="raw" style={{ marginTop: 6 }}>{info.description}</p>}

        {/* Invite code */}
        {info.inviteCode && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8, marginTop: 12,
            background: "var(--surface-2)", borderRadius: 8, padding: "8px 12px",
            border: "1px solid var(--line)",
          }}>
            <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>Invite code:</span>
            <code style={{ fontWeight: 600, letterSpacing: 1, fontSize: 14, flex: 1 }}>{info.inviteCode}</code>
            <button
              className="btn"
              onClick={copyCode}
              style={{ fontSize: 12, padding: "4px 10px" }}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        )}

        {/* Actions */}
        {isMember && (
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            {info.myRole === "owner" ? (
              <button className="del" onClick={handleDelete} style={{ fontSize: 12, padding: "4px 12px" }}>
                Delete circle
              </button>
            ) : (
              <button
                onClick={handleLeave}
                style={{
                  fontSize: 12, padding: "4px 12px", borderRadius: 8,
                  background: "none", border: "1px solid var(--line)", cursor: "pointer",
                  color: "var(--ink-soft)",
                }}
              >
                Leave circle
              </button>
            )}
          </div>
        )}
      </article>

      {/* Sub tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          className="btn"
          onClick={() => setActiveTab("chat")}
          style={{
            background: activeTab === "chat" ? "var(--ink)" : "var(--surface-2)",
            color: activeTab === "chat" ? "#fff" : "var(--ink-soft)",
            border: "1px solid var(--line)",
            padding: "5px 14px", fontSize: 13,
          }}
        >
          💬 Circle Chat
        </button>
        <button
          className="btn"
          onClick={() => setActiveTab("members")}
          style={{
            background: activeTab === "members" ? "var(--ink)" : "var(--surface-2)",
            color: activeTab === "members" ? "#fff" : "var(--ink-soft)",
            border: "1px solid var(--line)",
            padding: "5px 14px", fontSize: 13,
          }}
        >
          👥 Members ({info.memberCount || 0})
        </button>
      </div>

      {activeTab === "members" && (
        <>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Members</div>
          {!members && (
            <>{[1, 2].map((i) => (
              <div key={i} className="skeleton" style={{ height: 44, marginBottom: 8, borderRadius: 8 }} />
            ))}</>
          )}
          {members && members.map((m) => (
            <div
              key={m.userId}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 14px", background: "var(--surface-2)", borderRadius: 10,
                marginBottom: 8, border: "1px solid var(--line)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Avatar src={m.avatarUrl} name={m.name || "Anonymous"} size={34} />
                <span style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)" }}>{m.name || "Anonymous"}</span>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="tag" style={{ fontSize: 11, textTransform: "capitalize" }}>{m.role}</span>
                <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>Joined {fmtDate(m.joinedAt)}</span>
              </div>
            </div>
          ))}
        </>
      )}

      {activeTab === "chat" && (
        isMember ? (
          <CircleChat circleId={info.id} isOwner={info.myRole === "owner"} onError={onError} />
        ) : (
          <div style={{
            textAlign: "center", padding: "36px 20px", background: "var(--surface-2)",
            borderRadius: "var(--r)", border: "1px solid var(--line)", margin: "8px 0"
          }}>
            <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Join this circle to view and send messages</p>
            <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 16 }}>
              Chat history and discussion in <strong>{info.name}</strong> are exclusive to circle members.
            </p>
            <button className="btn" onClick={handleJoinDirect} disabled={joining} style={{ padding: "8px 20px" }}>
              {joining ? <span className="spin" /> : "Join Circle Now"}
            </button>
          </div>
        )
      )}
    </>
  );
}


/* ---------- Circle Chat Component ---------- */
function CircleChat({ circleId, isOwner, onError }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  const fetchMessages = async (isInitial = false) => {
    try {
      const res = await api.getCircleMessages(circleId, 100, 0);
      setMessages(res.messages || []);
    } catch (e) {
      if (isInitial) {
        onError(e.message);
      }
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchMessages(true);
    const timer = setInterval(() => fetchMessages(false), 3000);
    return () => clearInterval(timer);
  }, [circleId]);

  useEffect(() => {
    if (!loading && messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, loading]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);

    try {
      if (editingMsg) {
        await api.editMessage(circleId, editingMsg.id, text.trim());
        setEditingMsg(null);
      } else {
        await api.sendMessage(circleId, text.trim(), replyTo ? replyTo.id : null);
        setReplyTo(null);
      }
      setText("");
      await fetchMessages(false);
    } catch (e) {
      onError(e.message);
    } finally {
      setSending(false);
    }
  };

  const handleEdit = (msg) => {
    setEditingMsg(msg);
    setText(msg.content);
    setReplyTo(null);
  };

  const handleDelete = async (msgId) => {
    if (!confirm("Delete this message?")) return;
    try {
      await api.deleteMessage(circleId, msgId);
      await fetchMessages(false);
    } catch (e) {
      onError(e.message);
    }
  };

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: 440,
      border: "1px solid var(--line)", borderRadius: "var(--r)", background: "var(--surface)",
      overflow: "hidden"
    }}>
      {/* Messages area */}
      <div style={{ flex: 1, padding: 12, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
        {loading && <div className="empty" style={{ margin: "auto" }}>Loading chat history…</div>}
        {!loading && messages.length === 0 && (
          <div className="empty" style={{ margin: "auto" }}>
            No messages yet.<br />Be the first to say hello! 👋
          </div>
        )}
        {!loading && messages.map((m) => (
          <div key={m.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <Avatar src={m.senderAvatar} name={m.senderName || "Unknown"} size={32} />
            <div
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: 12,
                background: m.isDeleted ? "var(--surface-3)" : "var(--surface-2)",
                border: "1px solid var(--line)",
                fontSize: 13.5,
              }}
            >
              {/* Sender and time header */}
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 11, color: "var(--ink-soft)" }}>
                <span style={{ fontWeight: 600, color: "var(--ink)" }}>{m.senderName}</span>
                <span>
                  {fmtTime(m.createdAt)} {m.editedAt && !m.isDeleted ? "(edited)" : ""}
                </span>
              </div>

              {/* Reply thread header */}
              {m.replyTo && (
                <div style={{
                  fontSize: 11, color: "var(--ink-soft)", background: "var(--surface)",
                  padding: "4px 8px", borderRadius: 6, marginBottom: 6, borderLeft: "3px solid var(--marigold)",
                }}>
                  Replying to <strong>{m.replyTo.senderName}</strong>: "{m.replyTo.content.slice(0, 30)}{m.replyTo.content.length > 30 ? "…" : ""}"
                </div>
              )}

              {/* Content */}
              <div style={{ fontStyle: m.isDeleted ? "italic" : "normal", color: m.isDeleted ? "var(--ink-soft)" : "var(--ink)", wordBreak: "break-word" }}>
                {m.content}
              </div>

              {/* Message Actions */}
              {!m.isDeleted && (
                <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 11, color: "var(--ink-soft)" }}>
                  <button
                    onClick={() => { setReplyTo(m); setEditingMsg(null); }}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--marigold-dark)", fontWeight: 600 }}
                  >
                    Reply
                  </button>
                  <button
                    onClick={() => handleEdit(m)}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--ink-soft)" }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(m.id)}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#ef4444" }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Reply or edit active status banner */}
      {(replyTo || editingMsg) && (
        <div style={{
          padding: "6px 12px", background: "var(--marigold-light)", borderTop: "1px solid var(--line)",
          display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12,
        }}>
          <span>
            {replyTo && <>Replying to <strong>{replyTo.senderName}</strong></>}
            {editingMsg && <>Editing message</>}
          </span>
          <button
            onClick={() => { setReplyTo(null); setEditingMsg(null); setText(""); }}
            style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 600, color: "var(--ink-soft)" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Composer form */}
      <form onSubmit={handleSend} style={{ display: "flex", gap: 8, padding: 8, borderTop: "1px solid var(--line)", background: "var(--surface-2)" }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={editingMsg ? "Edit message…" : replyTo ? `Reply to ${replyTo.senderName}…` : "Type a message…"}
          style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--line)", fontSize: 13.5 }}
        />
        <button className="btn" type="submit" disabled={sending || !text.trim()}>
          {sending ? <span className="spin" /> : editingMsg ? "Save" : "Send"}
        </button>
      </form>
    </div>
  );
}
