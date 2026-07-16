import React, { useState } from "react";

const FREE = [
  "Capture notes, links, PDFs, voice",
  "AI auto-tagging + summarization",
  "Spaced repetition review",
  "Semantic search (Connect)",
  "Up to 100 cards",
];

const PRO = [
  "Everything in Free",
  "Unlimited cards",
  "AI career readiness score",
  "Live job market analysis",
  "AI resume audit",
  "Personalised 90-day learning plan",
  "Voice interview simulator (all rounds)",
  "Priority AI responses",
];

function loadRazorpay() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) { resolve(); return; }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = resolve;
    s.onerror = () => reject(new Error("Could not load Razorpay — check your internet."));
    document.head.appendChild(s);
  });
}

export default function Upgrade({ user, onUpgraded, onBack }) {
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState("");
  const [done, setDone] = useState(false);
  const isPro = user?.plan === "pro";

  const handleUpgrade = async () => {
    setBusy(true); setErr("");
    try {
      await loadRazorpay();
      const token = localStorage.getItem("spark_token") || "";

      // 1. Create order on backend
      const res = await fetch("/api/subscribe/order", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const order = await res.json();
      if (!res.ok) throw new Error(order.detail || "Could not create order");

      // 2. Open Razorpay checkout
      await new Promise((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: order.key_id,
          amount: order.amount,
          currency: "INR",
          name: "Spark.AI",
          description: "Pro Plan — ₹199/month",
          order_id: order.order_id,
          image: "",
          handler: async (response) => {
            try {
              const vres = await fetch("/api/subscribe/activate", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(response),
              });
              const vdata = await vres.json();
              if (!vres.ok) throw new Error(vdata.detail || "Activation failed");
              setDone(true);
              onUpgraded?.();
              resolve();
            } catch (e) { reject(e); }
          },
          prefill: {
            name: user?.email?.split("@")[0] || "",
            email: user?.email || "",
          },
          theme: { color: "#F59E0B" },
          modal: {
            ondismiss: () => reject(new Error("Payment cancelled")),
          },
        });
        rzp.on("payment.failed", (r) =>
          reject(new Error(r.error?.description || "Payment failed"))
        );
        rzp.open();
      });
    } catch (e) {
      if (!e.message.includes("cancelled")) setErr(e.message);
    } finally { setBusy(false); }
  };

  // ── Already Pro ──────────────────────────────────────────────────────────
  if (isPro || done) return (
    <div className="screen" style={{ textAlign: "center", paddingTop: 40 }}>
      <div style={{ fontSize: 48, marginBottom: 14 }}>⚡</div>
      <h1 className="title">You're on Pro</h1>
      <p className="sub">All features unlocked. Your second brain is fully powered.</p>
      <div style={{
        background: "var(--marigold-light, #FEF9EC)",
        border: "1.5px solid var(--marigold)",
        borderRadius: "var(--r)", padding: "16px 18px",
        marginBottom: 20, textAlign: "left",
      }}>
        {PRO.map(f => (
          <div key={f} style={{ display: "flex", gap: 10, padding: "5px 0",
            fontSize: 14, color: "var(--ink)" }}>
            <span style={{ color: "var(--marigold)", flexShrink: 0 }}>✓</span> {f}
          </div>
        ))}
      </div>
      {onBack && (
        <button className="btn sm" onClick={onBack}>← Back</button>
      )}
    </div>
  );

  // ── Pricing page ─────────────────────────────────────────────────────────
  return (
    <div className="screen">
      <div className="eyebrow">Upgrade</div>
      <h1 className="title">Unlock your full potential</h1>
      <p className="sub">
        Free gets you started. Pro gets you hired.
      </p>

      {err && <div className="err">{err}</div>}

      {/* Plan comparison */}
      <div style={{ display: "grid", gap: 14, marginBottom: 24 }}>

        {/* Free plan */}
        <div style={{
          border: "1.5px solid var(--line)",
          borderRadius: "var(--r)", overflow: "hidden",
        }}>
          <div style={{
            padding: "14px 18px",
            background: "var(--surface-2)",
            borderBottom: "1px solid var(--line)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Free</div>
              <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>Your current plan</div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>₹0</div>
          </div>
          <div style={{ padding: "14px 18px" }}>
            {FREE.map(f => (
              <div key={f} style={{ display: "flex", gap: 10, padding: "5px 0",
                fontSize: 13.5, color: "var(--ink-soft)" }}>
                <span style={{ color: "var(--ink-faint)", flexShrink: 0 }}>✓</span> {f}
              </div>
            ))}
          </div>
        </div>

        {/* Pro plan */}
        <div style={{
          border: "2px solid var(--marigold)",
          borderRadius: "var(--r)", overflow: "hidden",
          boxShadow: "0 4px 20px rgba(245,158,11,.15)",
        }}>
          <div style={{
            padding: "14px 18px",
            background: "var(--marigold)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: "#fff" }}>Pro</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,.8)" }}>
                Career OS — fully unlocked
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: "#fff" }}>₹199</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.75)" }}>/month</div>
            </div>
          </div>
          <div style={{ padding: "14px 18px" }}>
            {PRO.map(f => (
              <div key={f} style={{ display: "flex", gap: 10, padding: "5px 0",
                fontSize: 13.5, color: "var(--ink)" }}>
                <span style={{ color: "var(--marigold)", flexShrink: 0, fontWeight: 700 }}>✓</span> {f}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <button className="primary" onClick={handleUpgrade} disabled={busy}
        style={{ fontSize: 16, padding: "15px 20px" }}>
        {busy ? "Opening payment…" : "Upgrade to Pro — ₹199/month"}
      </button>

      <p style={{ textAlign: "center", fontSize: 12, color: "var(--ink-faint)", marginTop: 12, lineHeight: 1.6 }}>
        Secure payment via Razorpay · Cancel anytime<br />
        Built for students &amp; builders in India
      </p>

      {onBack && (
        <button className="btn sm" onClick={onBack}
          style={{ display: "block", margin: "20px auto 0", width: "fit-content" }}>
          ← Back
        </button>
      )}
    </div>
  );
}
