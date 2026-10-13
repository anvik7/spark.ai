// Thin API client. Token lives in memory + localStorage; every call attaches it.
const RAW_API_URL =
  typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_URL
    ? String(import.meta.env.VITE_API_URL).trim()
    : "";
export const API_ORIGIN = RAW_API_URL.replace(/\/+$/, "").replace(/\/api$/, "");
const BASE = `${API_ORIGIN}/api`;

export function resolveApiUrl(pathOrUrl) {
  if (!pathOrUrl || typeof pathOrUrl !== "string") return pathOrUrl;
  const s = pathOrUrl.trim();
  if (
    s.startsWith("http://") ||
    s.startsWith("https://") ||
    s.startsWith("blob:") ||
    s.startsWith("data:")
  ) {
    return s;
  }
  const normalized = s.startsWith("/api")
    ? s
    : s.startsWith("/")
      ? `/api${s}`
      : `/api/${s}`;
  return `${API_ORIGIN}${normalized}`;
}

let token = (typeof localStorage !== "undefined" && localStorage.getItem("spark_token")) || "";

export function setToken(t) {
  token = t || "";
  if (typeof localStorage !== "undefined") {
    if (t) localStorage.setItem("spark_token", t);
    else localStorage.removeItem("spark_token");
  }
}

export function hasToken() {
  return !!token;
}

async function req(path, { method = "GET", body, form, timeoutMs = 60000, signal } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = timeoutMs > 0 ? setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs) : null;

  if (signal) {
    signal.addEventListener("abort", () => controller.abort());
  }

  let res;
  try {
    res = await fetch(BASE + path, { method, headers, body: payload, signal: controller.signal });
  } catch (err) {
    if (timedOut) {
      const timeoutErr = new Error("Request timed out. Please try again.");
      timeoutErr.status = 408;
      timeoutErr.code = "REQUEST_TIMEOUT";
      throw timeoutErr;
    }
    if (err.name === "AbortError") {
      const abortErr = new Error("Request cancelled.");
      abortErr.status = 0;
      abortErr.code = "ABORTED";
      throw abortErr;
    }
    const netErr = new Error(err.message || "Network connection failed. Please check your internet connection.");
    netErr.status = 0;
    netErr.code = "NETWORK_ERROR";
    throw netErr;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

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
    let errMsg = data.error?.message || data.message || (Array.isArray(data.detail) ? data.detail.map(d => d.msg || d.message || JSON.stringify(d)).join(", ") : data.detail) || (typeof data === "string" ? data : "");
    if (res.status === 400 && !errMsg) {
      errMsg = "Invalid request. Please check your question or file.";
    } else if ((res.status === 401 || res.status === 403) && !errMsg) {
      errMsg = "Session expired. Please log in again.";
    } else if (res.status === 429) {
      errMsg = data.error?.message || errMsg || "You're sending tasks too quickly. Please wait a moment.";
    } else if (res.status >= 500 && !errMsg) {
      errMsg = "SparkDhi encountered an issue processing your task. Please try again.";
    } else if (!errMsg) {
      errMsg = `Request failed (${res.status})`;
    }
    const err = new Error(errMsg);
    err.status = res.status;
    err.code = data.error?.code || (res.status === 429 ? "RATE_LIMITED" : "API_ERROR");
    throw err;
  }

  return data;
}

export const api = {
  signup: (email, password, name) =>
    req("/auth/signup", { method: "POST", body: { email, password, name } }),
  login: (email, password) =>
    req("/auth/login", { method: "POST", body: { email, password } }),
  forgotPassword: (email) =>
    req("/auth/forgot-password", { method: "POST", body: { email } }),
  verifyResetToken: (token) =>
    req("/auth/verify-reset-token", { method: "POST", body: { token } }),
  resetPassword: (token, newPassword) => {
    const payload = typeof token === "object" && token !== null
      ? { token: token.token, new_password: token.new_password || token.newPassword || token.password }
      : { token, new_password: newPassword };
    return req("/auth/reset-password", { method: "POST", body: payload });
  },
  me: () => req("/me"),
  uploadAvatar: (file) => {
    const f = new FormData();
    f.append("file", file);
    return req("/me/avatar", { method: "POST", form: f });
  },
  deleteAvatar: () => req("/me/avatar", { method: "DELETE" }),
  cards: () => req("/captures").then(res => res.items || res),
  getCards: () => req("/captures").then(res => res.items || res),
  getCaptures: () => req("/captures").then(res => res.items || res),
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
  shareCapture: (id) => req(`/captures/${id}/share`, { method: "POST" }),
  unshareCapture: (id) => req(`/captures/${id}/unshare`, { method: "POST" }),
  getPublicCapture: (shareToken) => req(`/public/captures/${shareToken}`),
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
  getBillingPlans: () => req("/billing/plans"),
  checkout: (plan = "plus", interval = "monthly", currency = "INR") =>
    req(`/billing/checkout?plan=${encodeURIComponent(plan)}&interval=${encodeURIComponent(interval)}&currency=${encodeURIComponent(currency)}`, { method: "POST" }),
  verify: (order_id, payment_id = "mock_payment", signature = "", plan = "plus", interval = "monthly", currency = "INR") =>
    req("/billing/verify", {
      method: "POST",
      body: { order_id, payment_id, signature, plan, interval, currency },
    }),
  cancelSubscription: () => req("/billing/cancel", { method: "POST" }),

  updateAvatarPreset: (presetId) => req("/me/avatar", { method: "POST", body: { avatar_url: presetId } }),


  getTasks: () => req("/tasks").then(res => res.items || res),
  solveTask: (prompt, subject_hint = "", options = {}) => req("/tasks/solve", { method: "POST", body: { prompt, subject_hint }, ...options }),
  uploadTaskFile: (file, prompt = "", subject_hint = "", options = {}) => {
    const f = new FormData();
    f.append("file", file);
    if (prompt) f.append("prompt", prompt);
    if (subject_hint) f.append("subject_hint", subject_hint);
    return req("/tasks/upload-solve", { method: "POST", form: f, ...options });
  },
  postTaskFollowup: (taskId, followupText) => req(`/tasks/${taskId}/followup`, { method: "POST", body: { followup_text: followupText } }),
  regenerateTask: (taskId) => req(`/tasks/${taskId}/regenerate`, { method: "POST" }),
  deleteTask: (taskId) => req(`/tasks/${taskId}`, { method: "DELETE" }),
  getCareerProfile: () => req("/career/profile"),
  auditCareer: (data) => req("/career/audit", { method: "POST", body: data }),
  uploadResume: (file, target_role = "", job_description = "", target_company = "") => {
    const f = new FormData();
    f.append("file", file);
    if (target_role) f.append("target_role", target_role);
    if (target_company) f.append("target_company", target_company);
    if (job_description) f.append("job_description", job_description);
    return req("/career/upload-resume", { method: "POST", form: f });
  },
  clearResume: () => req("/career/resume", { method: "DELETE" }),
  draftCoverLetter: (data) => req("/career/cover-letter", { method: "POST", body: data }),
  getInterviewSession: (sessionId = null) =>
    req("/interview/session" + (sessionId ? `?session_id=${sessionId}` : "")),
  startInterview: (data) => req("/interview/start", { method: "POST", body: data }),
  answerInterview: (sessionId, answerText) =>
    req("/interview/answer", { method: "POST", body: { session_id: sessionId, answer_text: answerText } }),
  evaluateInterview: (sessionId) =>
    req("/interview/evaluate", { method: "POST", body: { session_id: sessionId } }),
  getInterviewHistory: () => req("/interview/history"),

  // TTS Voice Synthesis
  generateTTS: async (text, options = {}) => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    headers["Content-Type"] = "application/json";
    const body = { text };
    if (options && typeof options === "object") {
      if (options.emotion) body.emotion = options.emotion;
      if (options.delivery) body.delivery = options.delivery;
      if (options.voice_id) body.voice_id = options.voice_id;
    }
    try {
      const res = await fetch(BASE + "/tts", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        console.warn(`[generateTTS] Non-OK HTTP response: ${res.status}`);
        return null;
      }
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("audio/")) {
        const blob = await res.blob();
        return URL.createObjectURL(blob);
      }
      console.warn("[generateTTS] Response content-type is not audio:", contentType);
      return null;
    } catch (err) {
      console.error("[generateTTS] Network fetch failed:", err?.message || err);
      return null;
    }
  },

  // Authenticated Media Fetch
  fetchMediaBlob: async (mediaUrl) => {
    if (!mediaUrl) return null;
    const path = resolveApiUrl(mediaUrl);
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(path, { headers });
    if (!res.ok) {
      const err = new Error(`Failed to load media (${res.status})`);
      err.status = res.status;
      throw err;
    }
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },

  // Circles & Chat
  myCircles: () => req("/circles"),
  discoverCircles: (category) => {
    const qs = category ? `?category=${encodeURIComponent(category)}` : "";
    return req("/circles/discover" + qs);
  },
  searchUsers: (q) => req(`/circles/users/search?q=${encodeURIComponent(q)}`),
  getUserPublicProfile: (userId) => req(`/circles/users/${userId}/profile`),
  createCircle: (data) =>
    req("/circles", { method: "POST", body: typeof data === "object" ? data : { name: data } }),
  getCircle: (id) => req(`/circles/${id}`),
  circleMembers: (id) => req(`/circles/${id}/members`),
  joinCircle: (inviteCode) =>
    req("/circles/join", { method: "POST", body: { invite_code: inviteCode } }),
  joinCircleById: (id) =>
    req(`/circles/${id}/join`, { method: "POST" }),
  leaveCircle: (id) => req(`/circles/${id}/leave`, { method: "POST" }),
  deleteCircle: (id) => req(`/circles/${id}`, { method: "DELETE" }),

  // Circle Chat / Messages
  getCircleMessages: (circleId, limit = 50, offset = 0, since = null) =>
    req(`/circles/${circleId}/messages?limit=${limit}&offset=${offset}${since ? `&since=${since}` : ""}`),
  sendMessage: (circleId, payload, replyToId = null) => {
    const bodyData = typeof payload === "string" ? { content: payload } : { ...payload };
    if (replyToId) bodyData.reply_to_id = replyToId;
    return req(`/circles/${circleId}/messages`, { method: "POST", body: bodyData });
  },
  editMessage: (circleId, msgId, content) =>
    req(`/circles/${circleId}/messages/${msgId}`, { method: "PUT", body: { content } }),
  deleteMessage: (circleId, msgId) =>
    req(`/circles/${circleId}/messages/${msgId}`, { method: "DELETE" }),
  uploadChatImage: (file) => {
    const f = new FormData();
    f.append("file", file);
    return req("/circles/upload-image", { method: "POST", form: f });
  },
  blockUser: (userId) => req(`/circles/users/${userId}/block`, { method: "POST" }),
  unblockUser: (userId) => req(`/circles/users/${userId}/block`, { method: "DELETE" }),
  reportMessage: (msgId, reason = "inappropriate", details = "") =>
    req(`/circles/messages/${msgId}/report`, { method: "POST", body: { reason, details } }),
  muteCircle: (circleId) => req(`/circles/${circleId}/mute`, { method: "POST" }),
  unmuteCircle: (circleId) => req(`/circles/${circleId}/mute`, { method: "DELETE" }),
  toggleMessageReaction: (circleId, msgId, emoji) =>
    req(`/circles/${circleId}/messages/${msgId}/reactions`, { method: "POST", body: { emoji } }),
  removeMessageReaction: (circleId, msgId) =>
    req(`/circles/${circleId}/messages/${msgId}/reactions`, { method: "DELETE" }),
};
