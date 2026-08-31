import React, { useState } from "react";
import { api } from "./api.js";

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
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  const entitlements = user?.entitlements || {};
  const currentPlan = user?.plan || "free";
  const effectivePlan = user?.effective_plan || currentPlan;
  const isTrial = entitlements?.trial?.active;

  const handleUpgrade = async (planTarget) => {
    setBusy(true);
    setErr("");
    try {
      await loadRazorpay();
      const token = localStorage.getItem("spark_token") || "";

      const res = await fetch(`/api/subscribe/order?plan=${planTarget}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const order = await res.json();
      if (!res.ok) throw new Error(order.detail || "Could not create order");

      const priceLabel = planTarget === "pro" ? "₹799/month" : "₹499/month";
      const planLabel = planTarget === "pro" ? "Pro" : "Plus";

      // If mock flow (dev mode without Razorpay API keys)
      if (order.mock) {
        await api.verify(order.order_id);
        setDone(true);
        onUpgraded?.();
        return;
      }

      await new Promise((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: order.key_id,
          amount: order.amount,
          currency: "INR",
          name: "Spark",
          description: `${planLabel} Plan — ${priceLabel}`,
          order_id: order.order_id,
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
          theme: { color: planTarget === "pro" ? "#1E293B" : "#F59E0B" },
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
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen" style={{ maxWidth: 960, margin: "0 auto", paddingBottom: 60 }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <h1 className="title" style={{ fontSize: 28, fontWeight: 800, margin: "0 0 6px", color: "var(--ink)" }}>
          Choose your Spark plan
        </h1>
        <p className="sub" style={{ fontSize: 15, color: "var(--ink-soft)", margin: 0 }}>
          Study smarter. Practice better. Make Spark your personal learning system.
        </p>

        {isTrial && (
          <div style={{ display: "inline-block", marginTop: 14, padding: "6px 16px", borderRadius: 20, background: "var(--marigold-light)", border: "1px solid var(--marigold)", color: "var(--marigold-dark)", fontSize: 13, fontWeight: 700 }}>
            🎁 14-Day Free Trial Active — Experiencing Plus features (2 downloads/mo limit)
          </div>
        )}
      </div>

      {err && <div className="err" style={{ marginBottom: 20, textAlign: "center" }}>⚠️ {err}</div>}
      {done && (
        <div style={{ padding: 16, background: "#ECFDF5", border: "1px solid #10B981", borderRadius: 10, color: "#047857", fontSize: 14, fontWeight: 700, marginBottom: 24, textAlign: "center" }}>
          ✓ Plan updated successfully! Welcome to Spark {currentPlan.toUpperCase()}.
        </div>
      )}

      {/* 3 Pricing Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20, marginBottom: 40 }}>
        {/* Free Tier */}
        <div
          style={{
            background: "var(--surface)",
            border: "1.5px solid var(--line)",
            borderRadius: 14,
            padding: 24,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-soft)", textTransform: "uppercase", marginBottom: 6 }}>
            Free
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: "var(--ink)", marginBottom: 4 }}>
            ₹0 <span style={{ fontSize: 14, fontWeight: 500, color: "var(--ink-soft)" }}>/ month</span>
          </div>
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginBottom: 20, minHeight: 40 }}>
            Explore Spark with essential AI study tools.
          </p>

          <button
            disabled={true}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: "1px solid var(--line)",
              background: currentPlan === "free" && !isTrial ? "var(--surface-2)" : "transparent",
              color: "var(--ink-soft)",
              fontSize: 13.5,
              fontWeight: 700,
              cursor: "default",
              marginBottom: 20,
            }}
          >
            {currentPlan === "free" && !isTrial ? "Current Plan" : "Basic Tier"}
          </button>

          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16, fontSize: 13, display: "flex", flexDirection: "column", gap: 8 }}>
            <div>✓ Core Spark workspace</div>
            <div>✓ 10 AI calls per day</div>
            <div>✓ Up to 3 file uploads (50MB)</div>
            <div>✓ 2 downloads per month</div>
          </div>
        </div>

        {/* Plus Tier (Most Popular) */}
        <div
          style={{
            background: "var(--surface)",
            border: "2px solid var(--marigold)",
            borderRadius: 14,
            padding: 24,
            display: "flex",
            flexDirection: "column",
            position: "relative",
            boxShadow: "var(--sh)",
          }}
        >
          <div style={{ position: "absolute", top: -12, right: 20, background: "var(--marigold-dark)", color: "#ffffff", padding: "2px 10px", borderRadius: 12, fontSize: 11, fontWeight: 800, letterSpacing: ".05em" }}>
            ⭐ MOST POPULAR
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--marigold-dark)", textTransform: "uppercase", marginBottom: 6 }}>
            Plus
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: "var(--ink)", marginBottom: 4 }}>
            ₹499 <span style={{ fontSize: 14, fontWeight: 500, color: "var(--ink-soft)" }}>/ month</span>
          </div>
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginBottom: 20, minHeight: 40 }}>
            Study smarter with advanced AI tools.
          </p>

          <button
            onClick={() => handleUpgrade("plus")}
            disabled={busy || currentPlan === "plus"}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: "none",
              background: "var(--p-gradient)",
              color: "#ffffff",
              fontSize: 13.5,
              fontWeight: 700,
              cursor: busy || currentPlan === "plus" ? "not-allowed" : "pointer",
              marginBottom: 20,
            }}
          >
            {currentPlan === "plus" ? "Current Plan" : "Start Plus →"}
          </button>

          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16, fontSize: 13, display: "flex", flexDirection: "column", gap: 8 }}>
            <div>✓ <strong>Everything in Free</strong></div>
            <div>✓ 100 AI calls per day</div>
            <div>✓ Up to 25 file uploads (1GB)</div>
            <div>✓ 25 downloads per month</div>
            <div>✓ Priority AI processing</div>
            <div>✓ Advanced study capabilities</div>
          </div>
        </div>

        {/* Pro Tier */}
        <div
          style={{
            background: "var(--surface)",
            border: "1.5px solid var(--line)",
            borderRadius: 14,
            padding: 24,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-soft)", textTransform: "uppercase", marginBottom: 6 }}>
            Pro 🚀
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: "var(--ink)", marginBottom: 4 }}>
            ₹799 <span style={{ fontSize: 14, fontWeight: 500, color: "var(--ink-soft)" }}>/ month</span>
          </div>
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginBottom: 20, minHeight: 40 }}>
            Your complete AI-powered study workspace.
          </p>

          <button
            onClick={() => handleUpgrade("pro")}
            disabled={busy || currentPlan === "pro"}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              border: "1px solid var(--ink)",
              background: "var(--ink)",
              color: "#ffffff",
              fontSize: 13.5,
              fontWeight: 700,
              cursor: busy || currentPlan === "pro" ? "not-allowed" : "pointer",
              marginBottom: 20,
            }}
          >
            {currentPlan === "pro" ? "Current Plan" : "Start Pro →"}
          </button>

          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16, fontSize: 13, display: "flex", flexDirection: "column", gap: 8 }}>
            <div>✓ <strong>Everything in Plus</strong></div>
            <div>✓ Highest AI usage (Fair Use)</div>
            <div>✓ 10GB storage & unlimited uploads</div>
            <div>✓ Highest download allowance</div>
            <div>✓ Advanced performance analytics</div>
            <div>✓ Highest priority AI processing</div>
          </div>
        </div>
      </div>

      {/* Clean Comparison Table */}
      <div
        style={{
          background: "var(--surface)",
          border: "1.5px solid var(--line)",
          borderRadius: 14,
          padding: 20,
          boxShadow: "var(--sh-sm)",
        }}
      >
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px", color: "var(--ink)" }}>
          Plan Comparison
        </h3>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, color: "var(--ink)" }}>
          <thead>
            <tr style={{ borderBottom: "1.5px solid var(--line)", textAlign: "left" }}>
              <th style={{ padding: "10px 12px", fontWeight: 700 }}>Feature</th>
              <th style={{ padding: "10px 12px", fontWeight: 700 }}>Free</th>
              <th style={{ padding: "10px 12px", fontWeight: 700, color: "var(--marigold-dark)" }}>Plus (₹499)</th>
              <th style={{ padding: "10px 12px", fontWeight: 700 }}>Pro (₹799)</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["Spark Workspace", "✓", "✓", "✓"],
              ["Study Tracker", "✓", "✓", "✓"],
              ["Practice & Solver", "✓", "✓", "✓"],
              ["AI Usage", "Limited (10/day)", "Higher (100/day)", "Highest"],
              ["Uploads", "3 files (50MB)", "25 files (1GB)", "10GB Storage"],
              ["Downloads", "2 / month", "25 / month", "Highest"],
              ["Advanced AI", "—", "✓", "✓"],
              ["Advanced Analytics", "—", "—", "✓"],
              ["Priority Processing", "—", "✓", "✓"],
            ].map(([feat, f, p, pr], idx) => (
              <tr key={feat} style={{ borderBottom: idx < 8 ? "1px solid var(--line)" : "none" }}>
                <td style={{ padding: "10px 12px", fontWeight: 600 }}>{feat}</td>
                <td style={{ padding: "10px 12px", color: "var(--ink-soft)" }}>{f}</td>
                <td style={{ padding: "10px 12px", fontWeight: 700, color: "var(--marigold-dark)" }}>{p}</td>
                <td style={{ padding: "10px 12px", fontWeight: 700 }}>{pr}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {onBack && (
        <div style={{ marginTop: 24, textAlign: "center" }}>
          <button className="btn sm" onClick={onBack}>← Back to Workspace</button>
        </div>
      )}
    </div>
  );
}
