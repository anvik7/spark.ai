import { useState, useEffect, useCallback } from "react";

const API_BASE = "/api/study";

// ─── Public types (what studytracker.tsx consumes) ─────────────────────

export interface StudyLog {
  id: number;
  subject: string;
  duration: number; // minutes
  date: string;      // ISO datetime
  notes?: string;    // client-side only — backend does not persist notes
}

export interface Goal {
  id: number;
  title: string;
  emoji: string;
  targetDate: string; // YYYY-MM-DD
  daysLeft: number;
  progress: number;   // 0-100
  color: string;
}

export interface FeedPost {
  id: number;
  user: string;
  content: string;
  likes: number;
  liked?: boolean;   // always false — backend has no per-user like state yet
  timestamp: string; // ISO — requires the study.py patch below
  type: "note";       // backend has no type field yet; always "note" until added
  group?: string;
}

export interface TodayStats {
  totalMinutes: number;
  sessions: number;
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

interface StudyDataState {
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

// ─── Raw backend shapes (never exported) ────────────────────────────────

interface ApiLog { id: number; subject: string; bookTitle: string; minutes: number; pagesRead: number; date: string; timestamp: number; }
interface ApiGoal { id: number; title: string; emoji: string; targetDate: string; daysLeft: number; progress: number; color: string; }
interface ApiFeedPost { id: number; author: string; initials: string; color: string; content: string; group: string; timeAgo: string; likes: number; comments: number; timestamp?: string; }
interface ApiTodayStats { totalMinutes: number; totalHours: number; totalPages: number; sessions: number; dailyGoalMinutes: number; progressPct: number; }
interface ApiWeeklyPoint { date: string; minutes: number; }
interface ApiSubjectBreakdown { subject: string; minutes: number; pages: number; pct: number; }

// ─── Mappers ─────────────────────────────────────────────────────────────

const shortDay = (dateStr: string) =>
  new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" });

const fromApiLog = (l: ApiLog): StudyLog => ({
  id: l.id, subject: l.subject, duration: l.minutes,
  date: new Date(l.timestamp).toISOString(),
});

const fromApiGoal = (g: ApiGoal): Goal => ({
  id: g.id, title: g.title, emoji: g.emoji, targetDate: g.targetDate,
  daysLeft: g.daysLeft, progress: g.progress, color: g.color,
});

const fromApiFeedPost = (p: ApiFeedPost): FeedPost => ({
  id: p.id, user: p.author, content: p.content, likes: p.likes,
  liked: false, group: p.group, type: "note",
  timestamp: p.timestamp ?? new Date().toISOString(), // falls back until backend patch below ships
});

const fromApiTodayStats = (t: ApiTodayStats): TodayStats => ({
  totalMinutes: t.totalMinutes, sessions: t.sessions,
});

const fromApiWeekly = (w: ApiWeeklyPoint): WeeklyDataPoint => ({
  day: shortDay(w.date), minutes: w.minutes,
});

const fromApiSubject = (s: ApiSubjectBreakdown): SubjectBreakdown => ({
  subject: s.subject, minutes: s.minutes, percentage: s.pct,
});

// ─── Fetch helper ────────────────────────────────────────────────────────

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("spark_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(options?.headers || {}),
    },
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
    logs: [], goals: [], feed: [], todayStats: null,
    weeklyData: [], subjectBreakdown: [], weakSpots: [],
    loading: true, error: null,
  });

  const setPartial = useCallback(
    (partial: Partial<StudyDataState>) => setState((prev) => ({ ...prev, ...partial })),
    []
  );

  const refreshAll = useCallback(async () => {
    setPartial({ loading: true, error: null });
    try {
      const [logs, goals, feed, todayStats, weeklyData, subjectBreakdown, weakSpots] =
        await Promise.all([
          apiFetch<ApiLog[]>(`${API_BASE}/logs`),
          apiFetch<ApiGoal[]>(`${API_BASE}/goals`),
          apiFetch<ApiFeedPost[]>(`${API_BASE}/feed`),
          apiFetch<ApiTodayStats>(`${API_BASE}/logs/today`),
          apiFetch<ApiWeeklyPoint[]>(`${API_BASE}/logs/weekly`),
          apiFetch<ApiSubjectBreakdown[]>(`${API_BASE}/analytics/subjects`),
          apiFetch<WeakSpot[]>(`${API_BASE}/analytics/weakspots`),
        ]);
      setPartial({
        logs: logs.map(fromApiLog),
        goals: goals.map(fromApiGoal),
        feed: feed.map(fromApiFeedPost),
        todayStats: fromApiTodayStats(todayStats),
        weeklyData: weeklyData.map(fromApiWeekly),
        subjectBreakdown: subjectBreakdown.map(fromApiSubject),
        weakSpots,
        loading: false, error: null,
      });
    } catch (err: any) {
      setPartial({ loading: false, error: err?.message || "Failed to fetch study data" });
    }
  }, [setPartial]);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  const refreshLogs = useCallback(async () => {
    try {
      const [logs, todayStats, weeklyData, subjectBreakdown, weakSpots] = await Promise.all([
        apiFetch<ApiLog[]>(`${API_BASE}/logs`),
        apiFetch<ApiTodayStats>(`${API_BASE}/logs/today`),
        apiFetch<ApiWeeklyPoint[]>(`${API_BASE}/logs/weekly`),
        apiFetch<ApiSubjectBreakdown[]>(`${API_BASE}/analytics/subjects`),
        apiFetch<WeakSpot[]>(`${API_BASE}/analytics/weakspots`),
      ]);
      setPartial({
        logs: logs.map(fromApiLog), todayStats: fromApiTodayStats(todayStats),
        weeklyData: weeklyData.map(fromApiWeekly),
        subjectBreakdown: subjectBreakdown.map(fromApiSubject), weakSpots,
      });
    } catch (err: any) {
      setPartial({ error: err?.message || "Failed to refresh logs" });
    }
  }, [setPartial]);

  const refreshGoals = useCallback(async () => {
    try {
      const goals = await apiFetch<ApiGoal[]>(`${API_BASE}/goals`);
      setPartial({ goals: goals.map(fromApiGoal) });
    } catch (err: any) {
      setPartial({ error: err?.message || "Failed to refresh goals" });
    }
  }, [setPartial]);

  const refreshFeed = useCallback(async () => {
    try {
      const feed = await apiFetch<ApiFeedPost[]>(`${API_BASE}/feed`);
      setPartial({ feed: feed.map(fromApiFeedPost) });
    } catch (err: any) {
      setPartial({ error: err?.message || "Failed to refresh feed" });
    }
  }, [setPartial]);

  const createLog = useCallback(
    async (log: Omit<StudyLog, "id">) => {
      await apiFetch<ApiLog>(`${API_BASE}/logs`, {
        method: "POST",
        body: JSON.stringify({
          subject: log.subject,
          minutes: log.duration,
          date: log.date.slice(0, 10), // backend compares plain YYYY-MM-DD strings
        }),
      });
      await refreshLogs();
    },
    [refreshLogs]
  );

  const createGoal = useCallback(
    async (goal: { title: string; emoji?: string; targetDate: string; progress?: number }) => {
      await apiFetch<ApiGoal>(`${API_BASE}/goals`, {
        method: "POST",
        body: JSON.stringify({
          title: goal.title,
          emoji: goal.emoji ?? "🎯",
          targetDate: goal.targetDate,
          progress: goal.progress ?? 0,
        }),
      });
      await refreshGoals();
    },
    [refreshGoals]
  );

  const updateGoalProgress = useCallback(
    async (goalId: number, progress: number) => {
      // backend reads `progress` as a query param, not a JSON body
      await apiFetch<ApiGoal>(
        `${API_BASE}/goals/${goalId}?progress=${Math.round(Math.min(100, Math.max(0, progress)))}`,
        { method: "PATCH" }
      );
      await refreshGoals();
    },
    [refreshGoals]
  );

  const createPost = useCallback(
    async (content: string, author = "You", initials = "Y", group = "") => {
      await apiFetch<ApiFeedPost>(`${API_BASE}/feed`, {
        method: "POST",
        body: JSON.stringify({ author, initials, content, group }),
      });
      await refreshFeed();
    },
    [refreshFeed]
  );

  const likePost = useCallback(
    async (postId: number) => {
      await apiFetch<void>(`${API_BASE}/feed/${postId}/like`, { method: "POST" });
      await refreshFeed();
    },
    [refreshFeed]
  );

  return {
    ...state, refreshAll, refreshLogs, refreshGoals, refreshFeed,
    createLog, createGoal, updateGoalProgress, createPost, likePost,
  };
}