import React, { useState } from "react";
import { api } from "./api.js";

const FREE = [
  "Capture notes, links, PDFs, voice",
  "AI auto-tagging + summarization",
  "Spaced repetition review",
  "Semantic search (Connect)",
  "Full second-brain storage",
];

const PRO = [
  "Everything in Free",
  "Unlimited AI captures & voice notes",
  "AI career readiness score",
  "Live job market analysis",
  "AI resume audit",
  "Personalised 90-day learning plan",
  "Voice interview simulator (all rounds)",
  "Priority AI responses",
];

const ULTRA = [
  "Everything in Pro",
  "Unlimited everything",
  "Priority support (24 h response)",
  "Early access to new features",
  "Dedicated onboarding session",
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
  const [busy, setBusy]   = useState(false);
  const [err,  setErr]    = useState("");
  const [done, setDone]   = useState(false);
  const [target, setTarget] = useState("pro"); // "pro" | "ultra"
  const [deckBusy, setDeckBusy] = useState(false);

  const handleDownloadDeck = async () => {
    setDeckBusy(true);
    try {
      const { generateDeck } = await import("./deck.js");
      await generateDeck();
    } catch (e) {
      console.error("Deck generation failed:", e);
    } finally {
      setDeckBusy(false);
    }
  };

  const currentPlan = user?.plan ?? "free";
  const isPro   = currentPlan === "pro";
  const isUltra = currentPlan === "ultra";

  const handleUpgrade = async (planTarget) => {
    setTarget(planTarget);
    setBusy(true); setErr("");
    try {
      await loadRazorpay();
      const token = localStorage.getItem("spark_token") || "";

      const res = await fetch(`/api/subscribe/order?plan=${planTarget}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const order = await res.json();
      if (!res.ok) throw new Error(order.detail || "Could not create order");

      const priceLabel = planTarget === "ultra" ? "₹599/month" : "₹299/month";
      const planLabel  = planTarget === "ultra" ? "Ultra" : "Pro";

      await new Promise((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: order.key_id,
          amount: order.amount,
          currency: "INR",
          name: "Spark",
          description: `${planLabel} Plan — ${priceLabel}`,
          order_id: order.order_id,
          image: "",
          handler: async (response) => {
            try {
              await api.verify(order.order_id);
              setDone(true);
              onUpgraded?.();
              resolve();
            } catch (e) { reject(e); }
          },
          prefill: {
            name: user?.email?.split("@")[0] || "",
            email: user?.email || "",
          },
          theme: { color: planTarget === "ultra" ? "#7C3AED" : "#F59E0B" },
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

  // ── Already on highest plan or just upgraded ──────────────────────────────
  if (isUltra || done) return (
    <div className="screen" style={{ textAlign: "center", paddingTop: 40 }}>
      <div style={{ fontSize: 48, marginBottom: 14 }}>🚀</div>
      <h1 className="title">You're on Ultra</h1>
      <p className="sub">Unlimited everything. Priority support. You're unstoppable.</p>
      <div style={{
        background: "linear-gradient(135deg,#EDE9FE,#F5F3FF)",
        border: "1.5px solid #7C3AED",
        borderRadius: "var(--r)", padding: "16px 18px",
        marginBottom: 20, textAlign: "left",
      }}>
        {ULTRA.map(f => (
          <div key={f} style={{ display: "flex", gap: 10, padding: "5px 0",
            fontSize: 14, color: "var(--ink)" }}>
            <span style={{ color: "#7C3AED", flexShrink: 0 }}>✓</span> {f}
          </div>
        ))}
      </div>
      {onBack && (
        <button className="btn sm" onClick={onBack}>← Back</button>
      )}
    </div>
  );

  if (isPro) return (
    <div className="screen" style={{ textAlign: "center", paddingTop: 40 }}>
      <div style={{ fontSize: 48, marginBottom: 14 }}>⚡</div>
      <h1 className="title">You're on Pro</h1>
      <p className="sub">All Pro features unlocked. Want even more? Upgrade to Ultra.</p>
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
      {err && <div className="err">{err}</div>}
      <button className="primary" onClick={() => handleUpgrade("ultra")} disabled={busy}
        style={{ fontSize: 15, padding: "14px 20px",
          background: "linear-gradient(135deg,#7C3AED,#9333EA)" }}>
        {busy && target === "ultra" ? "Opening payment…" : "Upgrade to Ultra — ₹599/month"}
      </button>
      {onBack && (
        <button className="btn sm" onClick={onBack}
          style={{ display: "block", margin: "16px auto 0", width: "fit-content" }}>
          ← Back
        </button>
      )}
    </div>
  );

  // ── Pricing page (free user) ──────────────────────────────────────────────
  return (
    <div className="screen">
      <div className="eyebrow">Upgrade</div>
      <h1 className="title">Unlock your full potential</h1>
      <p className="sub">
        Free gets you started. Pro gets you hired. Ultra keeps you ahead.
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
              <div style={{ fontSize: 26, fontWeight: 800, color: "#fff" }}>₹299</div>
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

        {/* Ultra plan card */}
        <div style={{
          background: "linear-gradient(135deg, #7C3AED, #A78BFA)",
          borderRadius: "16px",
          padding: "24px",
          color: "#F3E8FF",
        }}>
          <h3 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 12px", color: "#F3E8FF" }}>Ultra</h3>
          <div style={{ fontSize: 44, fontWeight: 700, margin: "0 0 20px" }}>₹599 / month</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            <li style={{ fontSize: 14, margin: "0 0 10px", display: "flex", alignItems: "center", gap: 8 }}>
              <span>✓</span> Everything in Pro, plus:
            </li>
            <li style={{ fontSize: 14, margin: "0 0 10px", display: "flex", alignItems: "center", gap: 8 }}>
              <span>✓</span> 2x faster AI responses
            </li>
            <li style={{ fontSize: 14, margin: "0 0 10px", display: "flex", alignItems: "center", gap: 8 }}>
              <span>✓</span> Priority support (24h)
            </li>
            <li style={{ fontSize: 14, margin: "0 0 10px", display: "flex", alignItems: "center", gap: 8 }}>
              <span>✓</span> Advanced export formats
            </li>
          </ul>
          <button className="primary" onClick={() => handleUpgrade("ultra")}
            style={{ marginTop: 16, width: "100%", background: "rgba(255,255,255,0.2)" }}>
            Upgrade to Ultra →
          </button>
        </div>
      </div>

      {/* CTAs */}
      <div style={{ display: "grid", gap: 10 }}>
        <button className="primary" onClick={() => handleUpgrade("pro")} disabled={busy}
          style={{ fontSize: 16, padding: "15px 20px" }}>
          {busy && target === "pro" ? "Opening payment…" : "Upgrade to Pro — ₹299/month"}
        </button>
        <button onClick={() => handleUpgrade("ultra")} disabled={busy}
          style={{
            fontSize: 15, padding: "14px 20px", borderRadius: "var(--r)",
            border: "2px solid #7C3AED", color: "#7C3AED", background: "transparent",
            fontWeight: 700, cursor: "pointer", transition: "all .18s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background="#7C3AED"; e.currentTarget.style.color="#fff"; }}
          onMouseLeave={e => { e.currentTarget.style.background="transparent"; e.currentTarget.style.color="#7C3AED"; }}
        >
          {busy && target === "ultra" ? "Opening payment…" : "Upgrade to Ultra — ₹599/month"}
        </button>
      </div>

      <p style={{ textAlign: "center", fontSize: 12, color: "var(--ink-faint)", marginTop: 12, lineHeight: 1.6 }}>
        Secure payment via Razorpay · Cancel anytime<br />
        Built for students &amp; builders in India
      </p>

      {/* Pitch deck download */}
      <div style={{ marginTop: 20, textAlign: "center" }}>
        <button
          onClick={handleDownloadDeck}
          disabled={deckBusy}
          style={{
            fontSize: 12, padding: "9px 18px", borderRadius: "var(--r)",
            border: "1px solid var(--line)", background: "var(--surface-2)",
            color: "var(--ink-soft)", cursor: "pointer",
            display: "inline-flex", alignItems: "center", gap: 7,
            transition: "all .18s",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--ink-faint)"; e.currentTarget.style.color = "var(--ink)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--line)"; e.currentTarget.style.color = "var(--ink-soft)"; }}
        >
          {deckBusy
            ? <><span className="spin" style={{ width: 12, height: 12 }} /> Generating deck…</>
            : <>📊 Download Pitch Deck (.pptx)</>}
        </button>
      </div>

      {onBack && (
        <button className="btn sm" onClick={onBack}
          style={{ display: "block", margin: "20px auto 0", width: "fit-content" }}>
          ← Back
        </button>
      )}
    </div>
  );
}
