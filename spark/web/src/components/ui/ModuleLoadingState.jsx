import React from "react";

const MESSAGES = {
  tasks: "Loading your tasks…",
  capture: "Loading your captures…",
  study: "Loading your learning sessions…",
  chat: "Loading chats…",
  career: "Loading your career workspace…",
  coach: "Loading interview coach…",
  account: "Loading account profile…",
  upgrade: "Loading subscription plans…",
};

export default function ModuleLoadingState({ moduleName = "module" }) {
  const message = MESSAGES[moduleName.toLowerCase()] || `Loading ${moduleName}…`;

  return (
    <div
      style={{
        padding: "40px 20px",
        textAlign: "center",
        color: "var(--ink-soft)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 220,
      }}
    >
      <div
        className="spin"
        style={{
          width: 24,
          height: 24,
          border: "2.5px solid var(--line)",
          borderTopColor: "var(--marigold)",
          borderRadius: "50%",
          marginBottom: 12,
        }}
      />
      <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-soft)" }}>
        {message}
      </div>
    </div>
  );
}
