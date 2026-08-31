// Thin API client. Token lives in memory + localStorage; every call attaches it.
const BASE = "/api";
let token = localStorage.getItem("spark_token") || "";

export function setToken(t) {
  token = t || "";
  if (t) localStorage.setItem("spark_token", t);
  else localStorage.removeItem("spark_token");
}

export function hasToken() {
  return !!token;
}

async function req(path, { method = "GET", body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const res = await fetch(BASE + path, { method, headers, body: payload });
  const text = await res.text();
  const contentType = res.headers.get("content-type") || "";

  let data = {};
  if (text) {
    if (contentType.includes("application/json")) {
      try {
        data = JSON.parse(text);
      } catch (e) {
        data = { detail: "Invalid JSON response from server." };
      }
    } else {
      const cleanMessage = text.startsWith("<!DOCTYPE") || text.includes("<html")
        ? `Server error (${res.status} ${res.statusText}). Please try again.`
        : text;
      data = { detail: cleanMessage };
    }
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      setToken("");
      window.dispatchEvent(new Event("spark:unauthorized"));
    }
    const err = new Error(data.message || data.detail || res.statusText || `Request failed with status ${res.status}`);
    err.status = res.status;
    throw err;
  }

  return data;
}

export const api = {
  signup: (email, password, name) =>
    req("/auth/signup", { method: "POST", body: { email, password, name } }),
  login: (email, password) =>
    req("/auth/login", { method: "POST", body: { email, password } }),
  me: () => req("/me"),
  uploadAvatar: (file) => {
    const f = new FormData();
    f.append("file", file);
    return req("/me/avatar", { method: "POST", form: f });
  },
  deleteAvatar: () => req("/me/avatar", { method: "DELETE" }),
  cards: () => req("/captures"),
  getCaptures: () => req("/captures"),
  createCapture: (kind, raw, source_url = "") =>
    req("/captures", { method: "POST", body: { kind, raw, source_url } }),
  uploadCaptureFile: (file) => {
    const f = new FormData();
    f.append("file", file);
    return req("/captures/file", { method: "POST", form: f });
  },
  uploadCaptureVoice: (blob) => {
    const f = new FormData();
    f.append("file", blob, "voice.webm");
    return req("/captures/voice", { method: "POST", form: f });
  },
  deleteCapture: (id) => req(`/captures/${id}`, { method: "DELETE" }),
  addCard: (kind, raw) => req("/captures", { method: "POST", body: { kind, raw } }),
  deleteCard: (id) => req(`/captures/${id}`, { method: "DELETE" }),
  tags: () => req("/tags"),
  due: (limit = 3) => req(`/review/due?limit=${limit}`),
  grade: (id, grade) =>
    req(`/review/${id}/grade`, { method: "POST", body: { grade } }),
  connect: (q, mode = "ask") =>
    req("/connect", { method: "POST", body: { q, mode } }),
  digest: () => req("/digest"),
  weeklyDigest: () => req("/digest/weekly"),
  checkout: (tier) =>
    req(`/subscribe/order${tier ? `?plan=${tier}` : ""}`, { method: "POST" }),
  verify: (order_id) =>
    req("/billing/verify", { method: "POST", body: { order_id } }),
  getGoal: () => req("/goals"),
  setGoal: (goalData) => req("/goals", { method: "POST", body: goalData }),
  updateAvatarPreset: (presetId) => req("/me/avatar", { method: "POST", body: { avatar_url: presetId } }),

  // Study API
  getStudySessions: () => req("/study/sessions"),
  getStudyLogs: () => req("/study/logs"),
  createStudySession: (subject, material = "", minutes = 0, seconds = 0, date = null) =>
    req("/study/sessions", { method: "POST", body: { subject, material, minutes, seconds, date } }),
  getTodayStudyStats: () => req("/study/logs/today"),
  getWeeklyGoal: () => req("/study/weekly-goal"),
  getStudyGoals: () => req("/study/goals"),
  setWeeklyGoal: (targetHours) => req("/study/weekly-goal", { method: "POST", body: { target_hours: Number(targetHours) } }),
  getStudyFeed: () => req("/study/feed"),
  getStudyAnalyticsSummary: () => req("/study/analytics/summary"),
  getStudySubjectBreakdown: () => req("/study/analytics/subjects"),
  getStudyWeakspots: () => req("/study/analytics/weakspots"),
  getTasks: () => req("/tasks"),
  solveTask: (prompt, subject_hint = "") => req("/tasks/solve", { method: "POST", body: { prompt, subject_hint } }),
  uploadTaskFile: (file, prompt = "", subject_hint = "") => {
    const f = new FormData();
    f.append("file", file);
    if (prompt) f.append("prompt", prompt);
    if (subject_hint) f.append("subject_hint", subject_hint);
    return req("/tasks/upload-solve", { method: "POST", form: f });
  },
  postTaskFollowup: (taskId, followupText) => req(`/tasks/${taskId}/followup`, { method: "POST", body: { followup_text: followupText } }),
  regenerateTask: (taskId) => req(`/tasks/${taskId}/regenerate`, { method: "POST" }),
  deleteTask: (taskId) => req(`/tasks/${taskId}`, { method: "DELETE" }),
  getCareerProfile: () => req("/career/profile"),
  auditCareer: (data) => req("/career/audit", { method: "POST", body: data }),
  uploadResume: (file, target_role = "", job_description = "") => {
    const f = new FormData();
    f.append("file", file);
    if (target_role) f.append("target_role", target_role);
    if (job_description) f.append("job_description", job_description);
    return req("/career/upload-resume", { method: "POST", form: f });
  },
  getInterviewSession: () => req("/interview/session"),
  startInterview: (data) => req("/interview/start", { method: "POST", body: data }),
  answerInterview: (sessionId, answerText) =>
    req("/interview/answer", { method: "POST", body: { session_id: sessionId, answer_text: answerText } }),
  evaluateInterview: (sessionId) =>
    req("/interview/evaluate", { method: "POST", body: { session_id: sessionId } }),
  getInterviewHistory: () => req("/interview/history"),

  // Papers
  listPapers: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return req("/papers" + (qs ? `?${qs}` : ""));
  },
  uploadPaper: (file, title, examTag = "", subject = "", year = null) => {
    const f = new FormData();
    f.append("file", file);
    f.append("title", title);
    if (examTag) f.append("exam_tag", examTag);
    if (subject) f.append("subject", subject);
    if (year) f.append("year", String(year));
    return req("/papers", { method: "POST", form: f });
  },
  getPaper: (id) => req(`/papers/${id}`),
  downloadPaperUrl: (id) => `${BASE}/papers/${id}/download`,
  deletePaper: (id) => req(`/papers/${id}`, { method: "DELETE" }),

  // Circles
  myCircles: () => req("/circles"),
  discoverCircles: (examTag) => {
    const qs = examTag ? `?exam_tag=${encodeURIComponent(examTag)}` : "";
    return req("/circles/discover" + qs);
  },
  createCircle: (name, description = "", examTag = "") =>
    req("/circles", { method: "POST", body: { name, description, exam_tag: examTag } }),
  getCircle: (id) => req(`/circles/${id}`),
  circleMembers: (id) => req(`/circles/${id}/members`),
  joinCircle: (inviteCode) =>
    req("/circles/join", { method: "POST", body: { invite_code: inviteCode } }),
  joinCircleById: (id) =>
    req(`/circles/${id}/join`, { method: "POST" }),
  leaveCircle: (id) => req(`/circles/${id}/leave`, { method: "POST" }),
  deleteCircle: (id) => req(`/circles/${id}`, { method: "DELETE" }),

  // Circle Chat / Messages
  getCircleMessages: (circleId, limit = 50, offset = 0) =>
    req(`/circles/${circleId}/messages?limit=${limit}&offset=${offset}`),
  sendMessage: (circleId, content, replyToId = null) =>
    req(`/circles/${circleId}/messages`, { method: "POST", body: { content, reply_to_id: replyToId } }),
  editMessage: (circleId, msgId, content) =>
    req(`/circles/${circleId}/messages/${msgId}`, { method: "PUT", body: { content } }),
  deleteMessage: (circleId, msgId) =>
    req(`/circles/${circleId}/messages/${msgId}`, { method: "DELETE" }),
};