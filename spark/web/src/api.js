// Thin API client. Token lives in memory + localStorage; every call attaches it.
const BASE = "/api";
let token = localStorage.getItem("spark_token") || "";

export function setToken(t) {
  token = t || "";
  if (t) localStorage.setItem("spark_token", t);
  else localStorage.removeItem("spark_token");
}
export function hasToken() { return !!token; }

async function req(path, { method = "GET", body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = form; // FormData; let the browser set the boundary
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, { method, headers, body: payload });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    if (res.status === 401) {
      setToken("");
      window.dispatchEvent(new Event("spark:unauthorized"));
    }
    const err = new Error(data.detail || res.statusText);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  signup: (email, password, name) => req("/auth/signup", { method: "POST", body: { email, password, name } }),
  login: (email, password) => req("/auth/login", { method: "POST", body: { email, password } }),
  me: () => req("/me"),
  cards: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return req("/cards" + (qs ? `?${qs}` : ""));
  },
  addCard: (kind, raw) => req("/cards", { method: "POST", body: { kind, raw } }),
  addVoice: (file, lang_hint = "auto") => {
    const f = new FormData();
    f.append("file", file);
    f.append("lang_hint", lang_hint);
    return req("/cards/voice", { method: "POST", form: f });
  },
  addFile: (file) => {
    const f = new FormData();
    f.append("file", file);
    return req("/cards/file", { method: "POST", form: f });
  },
  deleteCard: (id) => req(`/cards/${id}`, { method: "DELETE" }),
  tags: () => req("/tags"),
  due: (limit = 3) => req(`/review/due?limit=${limit}`),
  grade: (id, grade) => req(`/review/${id}/grade`, { method: "POST", body: { grade } }),
  connect: (q, mode = "ask") => req("/connect", { method: "POST", body: { q, mode } }),
  checkout: () => req("/billing/checkout", { method: "POST" }),
  verify: (order_id) => req("/billing/verify", { method: "POST", body: { order_id } }),
};
