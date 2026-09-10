import React, { useState } from "react";
import { api } from "./api.js";
import { Chakra } from "./Chakra.jsx";

function loadRazorpay() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = resolve;
    s.onerror = () => reject(new Error("Could not load payment checkout — check your internet connection."));
    document.head.appendChild(s);
  });
}

export default function Upgrade({ user, onUpgraded, onBack }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [interval, setInterval] = useState("monthly"); // "monthly" | "yearly"
  const [currency, setCurrency] = useState(user?.billing_currency || "INR"); // "INR" | "USD"
  const [cancelling, setCancelling] = useState(false);

  const entitlements = user?.entitlements || {};
  const currentPlan = user?.plan || "trial";
  const subStatus = user?.subscription_status || (entitlements?.trial?.active ? "trial" : "expired");
  const isTrial = entitlements?.trial?.active || subStatus === "trial";
  const trialDaysRemaining = entitlements?.trial?.days_remaining ?? (isTrial ? 14 : 0);
  const isPaidActive = entitlements?.is_active_paid || (currentPlan in { plus: 1, pro: 1 } && subStatus === "active");
  const isCancelled = subStatus === "cancelled";

  // Catalog pricing definition matching backend PRICING_CATALOG
  const PRICING = {
    INR: {
      symbol: "₹",
      name: "India (INR)",
      plus: {
        monthly: { display: "₹599", period: "/ month", total: "₹599 billed monthly" },
        yearly: { display: "₹5,990", period: "/ year", note: "₹599/mo value · 10 months pay", badge: "SAVE 2 MONTHS" },
      },
      pro: {
        monthly: { display: "₹999", period: "/ month", total: "₹999 billed monthly" },
        yearly: { display: "₹9,990", period: "/ year", note: "₹999/mo value · 10 months pay", badge: "SAVE 2 MONTHS" },
      },
    },
    USD: {
      symbol: "$",
      name: "Global (USD)",
      plus: {
        monthly: { display: "$10", period: "/ month", total: "$10 billed monthly" },
        yearly: { display: "$100", period: "/ year", note: "$10/mo value · 10 months pay", badge: "SAVE 2 MONTHS" },
      },
      pro: {
        monthly: { display: "$13", period: "/ month", total: "$13 billed monthly" },
        yearly: { display: "$130", period: "/ year", note: "$13/mo value · 10 months pay", badge: "SAVE 2 MONTHS" },
      },
    },
  };

  const currData = PRICING[currency] || PRICING.INR;
  const plusPricing = currData.plus[interval];
  const proPricing = currData.pro[interval];

  const handleUpgrade = async (planTarget) => {
    setBusy(true);
    setErr("");
    setSuccessMsg("");
    try {
      const order = await api.checkout(planTarget, interval, currency);

      // Dev mock flow if live Razorpay credentials are not configured
      if (order.mock) {
        await api.verify(order.order_id, "mock_payment", "", planTarget, interval, currency);
        setSuccessMsg(`Welcome to SparkDhi ${planTarget.toUpperCase()}! Your subscription is now active.`);
        onUpgraded?.();
        return;
      }

      await loadRazorpay();
      await new Promise((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: order.key_id,
          amount: order.amount,
          currency: order.currency,
          name: "SparkDhi.ai",
          description: `${planTarget === "pro" ? "PRO" : "PLUS"} Plan (${interval})`,
          order_id: order.order_id,
          handler: async (response) => {
            try {
              await api.verify(
                order.order_id,
                response.razorpay_payment_id,
                response.razorpay_signature,
                planTarget,
                interval,
                currency
              );
              setSuccessMsg(`Payment confirmed! You are now subscribed to SparkDhi ${planTarget.toUpperCase()}.`);
              onUpgraded?.();
              resolve();
            } catch (e) {
              reject(e);
            }
          },
          prefill: {
            name: user?.name || user?.email?.split("@")[0] || "",
            email: user?.email || "",
          },
          theme: { color: planTarget === "pro" ? "#1E293B" : "#F59E0B" },
          modal: {
            ondismiss: () => reject(new Error("Payment cancelled")),
          },
        });
        rzp.on("payment.failed", (r) => {
          reject(new Error(r.error?.description || "Payment failed"));
        });
        rzp.open();
      });
    } catch (e) {
      if (!e.message?.includes("cancelled")) {
        setErr(e.message || "Something went wrong during checkout.");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!window.confirm("Are you sure you want to cancel your subscription? You will keep full access until the end of your billing cycle, and none of your data will ever be deleted.")) {
      return;
    }
    setCancelling(true);
    setErr("");
    try {
      await api.cancelSubscription();
      setSuccessMsg("Your subscription has been cancelled and will not renew. Your data remains fully safe.");
      onUpgraded?.();
    } catch (e) {
      setErr(e.message || "Could not cancel subscription.");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="screen" style={{ maxWidth: 980, margin: "0 auto", padding: "0 16px 64px" }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 28, paddingTop: 8 }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: ".08em",
            color: "var(--marigold-dark)",
            background: "var(--marigold-light)",
            padding: "4px 14px",
            borderRadius: 16,
            marginBottom: 12,
          }}
        >
          <Chakra size={18} />
          <span>SparkDhi.ai Workspaces</span>
        </div>
        <h1 className="title" style={{ fontSize: "clamp(26px, 4vw, 36px)", fontWeight: 800, margin: "0 0 10px", color: "var(--ink)" }}>
          Try SparkDhi free for 14 days.
        </h1>
        <p className="sub" style={{ fontSize: "clamp(14px, 2vw, 16px)", color: "var(--ink-soft)", margin: "0 auto", maxWidth: 580, lineHeight: 1.5 }}>
          Experience the complete SparkDhi workspace before choosing a plan.
        </p>
      </div>

      {/* ── Separate 14-Day Full Access Trial Card ── */}
      <div
        style={{
          background: "var(--surface)",
          border: "1.5px solid var(--marigold)",
          borderRadius: 18,
          padding: "20px 26px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 28,
          boxShadow: "0 2px 12px rgba(184, 135, 42, 0.08)",
        }}
      >
        <div style={{ flex: "1 1 280px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 11.5,
                fontWeight: 800,
                color: "var(--marigold-dark)",
                textTransform: "uppercase",
                letterSpacing: ".06em",
                background: "var(--marigold-light)",
                padding: "2px 8px",
                borderRadius: 8,
              }}
            >
              14-DAY FULL ACCESS
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>
              {currency === "INR" ? "₹0" : "$0"} / 14 days
            </span>
          </div>
          <div style={{ fontSize: 13.5, color: "var(--ink-soft)", lineHeight: 1.4 }}>
            Experience the complete SparkDhi workspace before choosing a plan.
          </div>
          {isTrial && (
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--marigold-dark)", marginTop: 4 }}>
              🎁 Currently on 14-Day Full Access Trial: <strong>{trialDaysRemaining} {trialDaysRemaining === 1 ? "day" : "days"} remaining</strong>.
            </div>
          )}
          {!isTrial && !isPaidActive && (
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "#EF4444", marginTop: 4 }}>
              ⚠️ Your 14-day trial has concluded. Select Plus or Pro below to continue your workspace.
            </div>
          )}
        </div>
        <div>
          {isTrial ? (
            <button
              disabled
              style={{
                padding: "9px 20px",
                borderRadius: 8,
                border: "1.5px solid var(--line)",
                background: "var(--surface-2)",
                color: "var(--ink)",
                fontSize: 13,
                fontWeight: 700,
                cursor: "default",
              }}
            >
              ✓ Trial Active
            </button>
          ) : isPaidActive ? (
            <span style={{ fontSize: 13, fontWeight: 700, color: "#10B981" }}>
              ✓ Subscribed ({currentPlan.toUpperCase()})
            </span>
          ) : (
            <button
              onClick={onBack}
              style={{
                padding: "9px 20px",
                borderRadius: 8,
                border: "none",
                background: "var(--marigold-dark)",
                color: "#FFFFFF",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Start 14-Day Trial
            </button>
          )}
        </div>
      </div>

      {isPaidActive && (
        <div
          style={{
            display: "inline-flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            marginTop: 18,
            padding: "10px 20px",
            borderRadius: 12,
            background: isCancelled ? "var(--surface-2)" : "rgba(16, 185, 129, 0.08)",
            border: `1.5px solid ${isCancelled ? "var(--line)" : "rgba(16, 185, 129, 0.3)"}`,
            fontSize: 13.5,
            color: "var(--ink)",
          }}
        >
          <span>
            {isCancelled ? "⏳" : "✓"} Currently on <strong>SparkDhi {currentPlan.toUpperCase()}</strong>
            {isCancelled ? " (Cancels at period end)" : " (Active)"}
          </span>
          {!isCancelled && (
            <button
              onClick={handleCancelSubscription}
              disabled={cancelling}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--ink-soft)",
                textDecoration: "underline",
                fontSize: 12.5,
                cursor: "pointer",
                padding: 0,
              }}
            >
              {cancelling ? "Cancelling…" : "Cancel Subscription"}
            </button>
          )}
        </div>
      )}

      {err && (
        <div
          className="err"
          style={{
            maxWidth: 600,
            margin: "0 auto 20px",
            padding: "12px 16px",
            borderRadius: 10,
            textAlign: "center",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          ⚠️ {err}
        </div>
      )}

      {successMsg && (
        <div
          style={{
            maxWidth: 600,
            margin: "0 auto 20px",
            padding: "12px 16px",
            background: "rgba(16, 185, 129, 0.12)",
            border: "1.5px solid #10B981",
            borderRadius: 10,
            color: "#047857",
            fontSize: 14,
            fontWeight: 700,
            textAlign: "center",
          }}
        >
          ✓ {successMsg}
        </div>
      )}

      {/* ── Control Bar: Billing Interval & Currency Selectors ── */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          marginBottom: 32,
        }}
      >
        {/* Interval Selector */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            background: "var(--surface-2)",
            padding: 4,
            borderRadius: 12,
            border: "1.5px solid var(--line)",
          }}
        >
          <button
            onClick={() => setInterval("monthly")}
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              border: "none",
              fontSize: 13.5,
              fontWeight: interval === "monthly" ? 700 : 500,
              background: interval === "monthly" ? "var(--surface)" : "transparent",
              color: interval === "monthly" ? "var(--ink)" : "var(--ink-soft)",
              boxShadow: interval === "monthly" ? "var(--sh-sm)" : "none",
              cursor: "pointer",
              transition: "all .15s ease",
            }}
          >
            Monthly
          </button>
          <button
            onClick={() => setInterval("yearly")}
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              border: "none",
              fontSize: 13.5,
              fontWeight: interval === "yearly" ? 700 : 500,
              background: interval === "yearly" ? "var(--surface)" : "transparent",
              color: interval === "yearly" ? "var(--ink)" : "var(--ink-soft)",
              boxShadow: interval === "yearly" ? "var(--sh-sm)" : "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              transition: "all .15s ease",
            }}
          >
            <span>Yearly</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                background: "var(--marigold-dark)",
                color: "#FFFFFF",
                padding: "2px 8px",
                borderRadius: 10,
                letterSpacing: ".02em",
              }}
            >
              SAVE 2 MONTHS
            </span>
          </button>
        </div>

        {/* Currency Selector */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            background: "var(--surface-2)",
            padding: 4,
            borderRadius: 12,
            border: "1.5px solid var(--line)",
          }}
        >
          <button
            onClick={() => setCurrency("INR")}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "none",
              fontSize: 13,
              fontWeight: currency === "INR" ? 700 : 500,
              background: currency === "INR" ? "var(--surface)" : "transparent",
              color: currency === "INR" ? "var(--ink)" : "var(--ink-soft)",
              boxShadow: currency === "INR" ? "var(--sh-sm)" : "none",
              cursor: "pointer",
              transition: "all .15s ease",
            }}
          >
            🇮🇳 India (INR)
          </button>
          <button
            onClick={() => setCurrency("USD")}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "none",
              fontSize: 13,
              fontWeight: currency === "USD" ? 700 : 500,
              background: currency === "USD" ? "var(--surface)" : "transparent",
              color: currency === "USD" ? "var(--ink)" : "var(--ink-soft)",
              boxShadow: currency === "USD" ? "var(--sh-sm)" : "none",
              cursor: "pointer",
              transition: "all .15s ease",
            }}
          >
            🌐 Global (USD)
          </button>
        </div>
      </div>

      {/* ── 2 Plan Cards: PLUS & PRO ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 24,
          marginBottom: 44,
          alignItems: "stretch",
        }}
      >
        {/* PLUS Plan Card */}
        <div
          style={{
            background: "var(--surface)",
            border: "1.5px solid var(--line)",
            borderRadius: 18,
            padding: 30,
            display: "flex",
            flexDirection: "column",
            boxShadow: "var(--sh)",
            position: "relative",
          }}
        >
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--marigold-dark)", textTransform: "uppercase", letterSpacing: ".06em" }}>
              PLUS
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", marginTop: 2 }}>
              Your everyday SparkDhi workspace.
            </div>
            <div style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 4, minHeight: 40, lineHeight: 1.4 }}>
              For everyday thinking, learning and getting things done.
            </div>
          </div>

          {/* Pricing Block */}
          <div style={{ margin: "16px 0 22px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: "clamp(32px, 5vw, 42px)", fontWeight: 800, color: "var(--ink)", letterSpacing: "-.02em" }}>
                {plusPricing.display}
              </span>
              <span style={{ fontSize: 15, fontWeight: 500, color: "var(--ink-soft)" }}>
                {plusPricing.period}
              </span>
            </div>
            {interval === "yearly" && (
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--marigold-dark)", marginTop: 4 }}>
                {plusPricing.note}
              </div>
            )}
          </div>

          <button
            onClick={() => handleUpgrade("plus")}
            disabled={busy || (currentPlan === "plus" && isPaidActive)}
            style={{
              padding: "13px 20px",
              borderRadius: 10,
              border: "1.5px solid var(--line)",
              background: currentPlan === "plus" && isPaidActive ? "var(--surface-2)" : "var(--surface-3)",
              color: "var(--ink)",
              fontSize: 14.5,
              fontWeight: 700,
              cursor: busy || (currentPlan === "plus" && isPaidActive) ? "not-allowed" : "pointer",
              marginBottom: 24,
              transition: "transform .1s ease",
            }}
          >
            {currentPlan === "plus" && isPaidActive ? "Current Plan" : "Choose Plus"}
          </button>

          {/* Features List */}
          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 20, fontSize: 13.5, display: "flex", flexDirection: "column", gap: 11, color: "var(--ink)", flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", color: "var(--ink-soft)", letterSpacing: ".04em" }}>
              What's included in Plus:
            </div>
            <div>✓ <strong>100 AI calls per day</strong></div>
            <div>✓ Up to 25 file uploads (1 GB storage)</div>
            <div>✓ 25 downloads per month</div>
            <div>✓ Priority AI processing</div>
            <div>✓ Tasks AI problem solving & code answers</div>
            <div>✓ Active Recall & spaced review</div>
            <div>✓ Spark Circles public communities</div>
            <div>✓ Career Intelligence & resume audit</div>
          </div>
        </div>

        {/* PRO Plan Card (BEST VALUE) */}
        <div
          style={{
            background: "var(--surface)",
            border: "2.5px solid var(--marigold)",
            borderRadius: 18,
            padding: 30,
            display: "flex",
            flexDirection: "column",
            boxShadow: "var(--sh-lg)",
            position: "relative",
          }}
        >
          {/* Best Value Badge */}
          <div
            style={{
              position: "absolute",
              top: -14,
              right: 24,
              background: "linear-gradient(135deg, var(--marigold), var(--marigold-dark))",
              color: "#FFFFFF",
              padding: "4px 14px",
              borderRadius: 16,
              fontSize: 11.5,
              fontWeight: 800,
              letterSpacing: ".08em",
              boxShadow: "0 2px 8px var(--marigold-glow)",
            }}
          >
            ★ BEST VALUE
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--marigold-dark)", textTransform: "uppercase", letterSpacing: ".06em" }}>
              PRO
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", marginTop: 2 }}>
              Your full-power SparkDhi workspace.
            </div>
            <div style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 4, minHeight: 40, lineHeight: 1.4 }}>
              For people who rely on SparkDhi heavily and want more AI capacity and advanced capabilities.
            </div>
          </div>

          {/* Pricing Block */}
          <div style={{ margin: "16px 0 22px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: "clamp(32px, 5vw, 42px)", fontWeight: 800, color: "var(--ink)", letterSpacing: "-.02em" }}>
                {proPricing.display}
              </span>
              <span style={{ fontSize: 15, fontWeight: 500, color: "var(--ink-soft)" }}>
                {proPricing.period}
              </span>
            </div>
            {interval === "yearly" && (
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--marigold-dark)", marginTop: 4 }}>
                {proPricing.note}
              </div>
            )}
          </div>

          <button
            onClick={() => handleUpgrade("pro")}
            disabled={busy || (currentPlan === "pro" && isPaidActive)}
            style={{
              padding: "13px 20px",
              borderRadius: 10,
              border: "none",
              background: currentPlan === "pro" && isPaidActive ? "var(--surface-2)" : "var(--p-gradient)",
              color: currentPlan === "pro" && isPaidActive ? "var(--ink-soft)" : "#FFFFFF",
              fontSize: 14.5,
              fontWeight: 700,
              cursor: busy || (currentPlan === "pro" && isPaidActive) ? "not-allowed" : "pointer",
              marginBottom: 24,
              boxShadow: currentPlan === "pro" && isPaidActive ? "none" : "0 4px 14px var(--marigold-glow)",
              transition: "transform .1s ease",
            }}
          >
            {currentPlan === "pro" && isPaidActive ? "Current Plan" : "Choose Pro"}
          </button>

          {/* Features List */}
          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 20, fontSize: 13.5, display: "flex", flexDirection: "column", gap: 11, color: "var(--ink)", flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 12, textTransform: "uppercase", color: "var(--marigold-dark)", letterSpacing: ".04em" }}>
              Everything in Plus, and also:
            </div>
            <div>✓ <strong>1,000 AI calls/day</strong> (Fair Use capacity)</div>
            <div>✓ <strong>10 GB high-capacity storage</strong> (100 files)</div>
            <div>✓ <strong>1,000 downloads per month</strong></div>
            <div>✓ <strong>Highest priority AI processing</strong> (Zero queue wait)</div>
            <div>✓ <strong>Advanced performance & study analytics</strong></div>
            <div>✓ <strong>Voice Interview AI simulator</strong> & coaching</div>
            <div>✓ <strong>Private 1-to-1 direct messaging</strong> in Circles</div>
            <div>✓ <strong>Early access</strong> to next-gen AI capabilities</div>
          </div>
        </div>
      </div>

      {/* ── Feature Comparison Matrix ── */}
      <div
        style={{
          background: "var(--surface)",
          border: "1.5px solid var(--line)",
          borderRadius: 18,
          padding: 24,
          boxShadow: "var(--sh-sm)",
          marginBottom: 32,
        }}
      >
        <div style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 6px", color: "var(--ink)" }}>
            Complete Capability Comparison
          </h2>
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: 0 }}>
            Transparent view of limits and features across your 14-day trial and paid plans.
          </p>
        </div>

        {/* Scrollable Container on Mobile */}
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", width: "100%" }}>
          <table style={{ width: "100%", minWidth: 540, borderCollapse: "collapse", fontSize: 13.5, color: "var(--ink)" }}>
            <thead>
              <tr style={{ borderBottom: "1.5px solid var(--line)", textAlign: "left" }}>
                <th style={{ padding: "12px 14px", fontWeight: 700 }}>Capability</th>
                <th style={{ padding: "12px 14px", fontWeight: 700, color: "var(--ink-soft)" }}>14-Day Trial</th>
                <th style={{ padding: "12px 14px", fontWeight: 700, color: "var(--marigold-dark)" }}>PLUS</th>
                <th style={{ padding: "12px 14px", fontWeight: 800, color: "var(--ink)" }}>PRO (Best Value)</th>
              </tr>
            </thead>
            <tbody>
              {[
                {
                  section: "CORE WORKSPACE",
                  rows: [
                    ["Tasks Workspace", "Full Access", "Full Access", "Full Priority Access"],
                    ["Capture & Quick Notes", "Included", "Included", "Included"],
                    ["Active Study & Decks", "Spaced Repetition", "Spaced Repetition", "Spaced Repetition + Deck Export"],
                    ["Chat Assistant", "Included", "Included", "Included"],
                    ["Career Readiness OS", "Included", "Included", "Included"],
                    ["AI Coach & Guidance", "Included", "Included", "Included"],
                  ],
                },
                {
                  section: "AI POWER",
                  rows: [
                    ["Tasks AI (Problem Solver)", "Full Solutions", "Full Solutions", "Full Solutions + Step-by-Step"],
                    ["Coding Answers & Exact Code", "Included", "Included", "Included + Multi-file context"],
                    ["AI Capture Insights & Synthesis", "Included", "Included", "Included"],
                    ["Study Intelligence & Summaries", "Included", "Included", "Included"],
                    ["Active Recall & AI Quizzes", "Included", "Included", "Included"],
                    ["Mastery Tracking & Analytics", "Preview", "Standard", "Advanced Mastery Reports"],
                    ["Career Intelligence & Resume Audit", "Included", "Included", "Included"],
                    ["AI Cover Letters & Optimization", "Included", "Included", "Included"],
                    ["AI Coaching & Mentorship", "Included", "Included", "Included"],
                    ["Interactive Voice Interview Simulator", "Preview", "—", "Full Interactive Voice Simulation"],
                  ],
                },
                {
                  section: "COMMUNICATION",
                  rows: [
                    ["Public Communities (Circles)", "Public Channels", "Public Channels", "Public Channels"],
                    ["Private 1-to-1 Direct Chat", "—", "—", "Direct Messaging Unlocked"],
                    ["Private Study Groups", "Public Only", "Public Only", "Private Cohorts"],
                    ["Image & File Attachment Sharing", "Up to 25 MB", "Up to 50 MB", "Up to 200 MB"],
                  ],
                },
                {
                  section: "CAPACITY",
                  rows: [
                    ["Daily AI Limit", "100 calls/day", "100 calls/day", "1,000 calls/day (Fair Use)"],
                    ["File Upload Limits", "Up to 25 files", "Up to 25 files", "Up to 100 files"],
                    ["Cloud Storage Quota", "1 GB", "1 GB", "10 GB High-Capacity"],
                    ["AI Processing Queue Priority", "Standard Priority", "Priority Queue", "Highest Priority (Zero Wait)"],
                  ],
                },
                {
                  section: "ADVANCED",
                  rows: [
                    ["Advanced Voice & Analytics Capabilities", "Preview", "—", "Full Capability Suite"],
                    ["Early Access to Next-Gen AI Features", "—", "—", "First Access"],
                    ["User Data Safety", "Always Preserved", "Always Preserved", "Always Preserved"],
                  ],
                },
              ].map(({ section, rows }) => (
                <React.Fragment key={section}>
                  <tr style={{ background: "var(--surface-2)" }}>
                    <td
                      colSpan={4}
                      style={{
                        padding: "8px 14px",
                        fontSize: 11.5,
                        fontWeight: 800,
                        color: "var(--marigold-dark)",
                        letterSpacing: ".08em",
                        textTransform: "uppercase",
                      }}
                    >
                      {section}
                    </td>
                  </tr>
                  {rows.map(([feat, tr, pl, pr]) => (
                    <tr key={feat} style={{ borderBottom: "1px solid var(--line)" }}>
                      <td style={{ padding: "10px 14px", fontWeight: 600 }}>{feat}</td>
                      <td style={{ padding: "10px 14px", color: "var(--ink-soft)" }}>{tr}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 600, color: "var(--marigold-dark)" }}>{pl}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 700 }}>{pr}</td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Data Preservation Guarantee ── */}
      <div
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--line)",
          borderRadius: 14,
          padding: "16px 22px",
          display: "flex",
          alignItems: "flex-start",
          gap: 14,
          fontSize: 13,
          color: "var(--ink-soft)",
          lineHeight: 1.5,
          marginBottom: 28,
        }}
      >
        <span style={{ fontSize: 20 }}>🔒</span>
        <div>
          <strong style={{ color: "var(--ink)" }}>SparkDhi Data Safety Guarantee:</strong> We never delete your tasks, captures, study sessions, chat history, or career records even if your subscription expires or is cancelled. Your knowledge always belongs to you.
        </div>
      </div>

      {onBack && (
        <div style={{ textAlign: "center" }}>
          <button
            className="btn sm"
            onClick={onBack}
            style={{
              padding: "10px 24px",
              borderRadius: 8,
              border: "1.5px solid var(--line)",
              background: "var(--surface)",
              color: "var(--ink)",
              fontSize: 13.5,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            ← Back to Workspace
          </button>
        </div>
      )}
    </div>
  );
}
