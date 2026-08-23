import { useState, useEffect, useCallback } from "react";

const API_BASE = "http://localhost:8000/api/study";

// ─── Types ─────────────────────────────────────────────────────────────

export interface StudyLog {
    id: number;
    subject: string;
    duration: number; // minutes
    date: string;     // ISO date
    notes?: string;
}

export interface Goal {
    id: number;
    title: string;
    subject: string;
    target: number;   // target minutes
    current: number;  // completed minutes
    deadline?: string;
}

export interface FeedPost {
    id: number;
    user: string;
    avatar?: string;
    content: string;
    likes: number;
    liked?: boolean;
    timestamp: string;
    type: "note" | "achievement" | "goal" | "milestone";
    subject?: string;
}

export interface TodayStats {
    totalMinutes: number;
    sessions: number;
    subjects: string[];
}

export interface WeeklyDataPoint {
    day: string;
    minutes: number;
}

export interface SubjectBreakdown {
    subject: string;
    minutes: number;
    percentage: number;
}

export interface WeakSpot {
    subject: string;
    daysAgo: number;
    lastDate: string;
}

export interface StudyDataState {
    logs: StudyLog[];
    goals: Goal[];
    feed: FeedPost[];
    todayStats: TodayStats | null;
    weeklyData: WeeklyDataPoint[];
    subjectBreakdown: SubjectBreakdown[];
    weakSpots: WeakSpot[];
    loading: boolean;
    error: string | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
    const res = await fetch(url, {
        headers: { "Content-Type": "application/json" },
        ...options,
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "Unknown error");
        throw new Error(`HTTP ${res.status}: ${text}`);
    }
    if (res.status === 204) return undefined as unknown as T;
    return res.json() as Promise<T>;
}

// ─── Hook ──────────────────────────────────────────────────────────────

export function useStudyData() {
    const [state, setState] = useState<StudyDataState>({
        logs: [],
        goals: [],
        feed: [],
        todayStats: null,
        weeklyData: [],
        subjectBreakdown: [],
        weakSpots: [],
        loading: true,
        error: null,
    });

    const setPartial = useCallback(
        (partial: Partial<StudyDataState>) =>
            setState((prev) => ({ ...prev, ...partial })),
        []
    );

    const refreshAll = useCallback(async () => {
        setPartial({ loading: true, error: null });
        try {
            const [
                logs,
                goals,
                feed,
                todayStats,
                weeklyData,
                subjectBreakdown,
                weakSpots,
            ] = await Promise.all([
                apiFetch<StudyLog[]>(`${API_BASE}/logs`),
                apiFetch<Goal[]>(`${API_BASE}/goals`),
                apiFetch<FeedPost[]>(`${API_BASE}/feed`),
                apiFetch<TodayStats>(`${API_BASE}/logs/today`),
                apiFetch<WeeklyDataPoint[]>(`${API_BASE}/logs/weekly`),
                apiFetch<SubjectBreakdown[]>(`${API_BASE}/analytics/subjects`),
                apiFetch<WeakSpot[]>(`${API_BASE}/analytics/weakspots`),
            ]);

            setPartial({
                logs,
                goals,
                feed,
                todayStats,
                weeklyData,
                subjectBreakdown,
                weakSpots,
                loading: false,
                error: null,
            });
        } catch (err: any) {
            setPartial({
                loading: false,
                error: err?.message || "Failed to fetch study data",
            });
        }
    }, [setPartial]);

    useEffect(() => {
        refreshAll();
    }, [refreshAll]);

    const refreshLogs = useCallback(async () => {
        try {
            const logs = await apiFetch<StudyLog[]>(`${API_BASE}/logs`);
            const todayStats = await apiFetch<TodayStats>(`${API_BASE}/logs/today`);
            const weeklyData = await apiFetch<WeeklyDataPoint[]>(`${API_BASE}/logs/weekly`);
            const subjectBreakdown = await apiFetch<SubjectBreakdown[]>(`${API_BASE}/analytics/subjects`);
            const weakSpots = await apiFetch<WeakSpot[]>(`${API_BASE}/analytics/weakspots`);
            setPartial({ logs, todayStats, weeklyData, subjectBreakdown, weakSpots });
        } catch (err: any) {
            setPartial({ error: err?.message || "Failed to refresh logs" });
        }
    }, [setPartial]);

    const refreshGoals = useCallback(async () => {
        try {
            const goals = await apiFetch<Goal[]>(`${API_BASE}/goals`);
            setPartial({ goals });
        } catch (err: any) {
            setPartial({ error: err?.message || "Failed to refresh goals" });
        }
    }, [setPartial]);

    const refreshFeed = useCallback(async () => {
        try {
            const feed = await apiFetch<FeedPost[]>(`${API_BASE}/feed`);
            setPartial({ feed });
        } catch (err: any) {
            setPartial({ error: err?.message || "Failed to refresh feed" });
        }
    }, [setPartial]);

    const createLog = useCallback(
        async (log: Omit<StudyLog, "id">) => {
            await apiFetch<StudyLog>(`${API_BASE}/logs`, {
                method: "POST",
                body: JSON.stringify(log),
            });
            await refreshLogs();
        },
        [refreshLogs]
    );

    const createGoal = useCallback(
        async (goal: Omit<Goal, "id" | "current">) => {
            await apiFetch<Goal>(`${API_BASE}/goals`, {
                method: "POST",
                body: JSON.stringify({ ...goal, current: 0 }),
            });
            await refreshGoals();
        },
        [refreshGoals]
    );

    const likePost = useCallback(
        async (postId: number) => {
            await apiFetch<void>(`${API_BASE}/feed/${postId}/like`, {
                method: "POST",
            });
            await refreshFeed();
        },
        [refreshFeed]
    );

    const updateGoalProgress = useCallback(
        async (goalId: number, current: number) => {
            await apiFetch<Goal>(`${API_BASE}/goals/${goalId}`, {
                method: "PATCH",
                body: JSON.stringify({ current }),
            });
            await refreshGoals();
        },
        [refreshGoals]
    );

    return {
        ...state,
        refreshAll,
        refreshLogs,
        refreshGoals,
        refreshFeed,
        createLog,
        createGoal,
        likePost,
        updateGoalProgress,
    };
}