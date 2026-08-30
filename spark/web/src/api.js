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

  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { detail: text };
    }
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      setToken("");
      window.dispatchEvent(new Event("spark:unauthorized"));
    }
    const err = new Error(data.detail || res.statusText || `Request failed with status ${res.status}`);
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
  cards: () => Promise.resolve([]),
  addCard: (kind, raw) => Promise.resolve({ id: "task-1", kind, raw }),
  addVoice: () => Promise.resolve({ id: "task-voice", kind: "voice" }),
  addFile: () => Promise.resolve({ id: "task-file", kind: "file" }),
  deleteCard: () => Promise.resolve({ ok: true }),
  updateCard: (id, body) => Promise.resolve({ id, ...body }),
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
  solveTask: (prompt, subject_hint = "") => req("/tasks/solve", { method: "POST", body: { prompt, subject_hint } }),

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