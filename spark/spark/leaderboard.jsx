// Leaderboard.jsx
import React, { useEffect, useState } from "react";

export default function Leaderboard() {
    const [data, setData] = useState(null);
    const [period, setPeriod] = useState("weekly");

    useEffect(() => {
        fetch(`/api/leaderboard?period=${period}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        })
            .then(r => r.json())
            .then(setData)
            .catch(() => setData(null));
    }, [period]);

    if (!data) return <div style={{ padding: 20, fontSize: 13, color: "#9CA3AF" }}>Loading…</div>;

    return (
        <div style={{ padding: 16 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                {["weekly", "alltime"].map(p => (
                    <button key={p} onClick={() => setPeriod(p)}
                        style={{
                            padding: "6px 14px", borderRadius: 8, fontSize: 12.5,
                            border: `1px solid ${period === p ? "#F59E0B" : "#E5E7EB"}`,
                            background: period === p ? "#FEF9EC" : "#F8F9FA",
                            color: period === p ? "#D97706" : "#4B5563",
                            fontWeight: period === p ? 600 : 400, cursor: "pointer",
                        }}>
                        {p === "weekly" ? "This week" : "All time"}
                    </button>
                ))}
            </div>

            {data.your_rank && (
                <div style={{
                    background: "#FEF9EC", border: "1px solid #F59E0B", borderRadius: 10,
                    padding: 12, marginBottom: 14, fontSize: 13, fontWeight: 600, color: "#D97706",
                }}>
                    You're #{data.your_rank.rank} — {data.your_rank.hours}h {period === "weekly" ? "this week" : "total"}
                </div>
            )}

            {data.entries.map(e => (
                <div key={e.user_id} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 4px", borderBottom: "1px solid #F1F3F5",
                    background: e.is_you ? "#FEF9EC" : "transparent",
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#9CA3AF", width: 24 }}>
                            #{e.rank}
                        </span>
                        <span style={{ fontSize: 14, fontWeight: e.is_you ? 700 : 500, color: "#111827" }}>
                            {e.name}{e.is_you && " (you)"}
                        </span>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#D97706" }}>{e.hours}h</span>
                </div>
            ))}
        </div>
    );
}