import test from "node:test";
import assert from "node:assert/strict";

// Mock minimal browser environment
globalThis.localStorage = {
  store: { spark_token: "tasks-jwt-token" },
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = v; },
  removeItem(k) { delete this.store[k]; }
};

let createdUrls = [];
let revokedUrls = [];

globalThis.URL.createObjectURL = (blob) => {
  const u = `blob:http://localhost/task-${Math.random().toString(36).substring(7)}`;
  createdUrls.push(u);
  return u;
};

globalThis.URL.revokeObjectURL = (u) => {
  revokedUrls.push(u);
};

// Import api client
const { api, setToken, hasToken } = await import("./src/api.js");

test("Tasks authenticated media fetching attaches Bearer token to /api/uploads/ requests", async () => {
  setToken("student-bearer-token");
  let capturedHeaders = null;
  let requestedPath = null;

  globalThis.fetch = async (url, options) => {
    requestedPath = url;
    capturedHeaders = options.headers;
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "image/png" }),
      blob: async () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" })
    };
  };

  const blobUrl = await api.fetchMediaBlob("/api/uploads/task_problem_123.png");
  assert.ok(blobUrl.startsWith("blob:"), "Should create and return blob URL for task image");
  assert.equal(requestedPath, "/api/uploads/task_problem_123.png");
  assert.equal(capturedHeaders.Authorization, "Bearer student-bearer-token", "Must send Bearer token for task attachment");
});

test("Tasks media Blob URLs are cleanly revoked during lifecycle cleanup", async () => {
  createdUrls = [];
  revokedUrls = [];

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "image/jpeg" }),
    blob: async () => new Blob([new Uint8Array([255, 216, 255])], { type: "image/jpeg" })
  });

  const blobUrl = await api.fetchMediaBlob("/api/uploads/task_geometry_456.jpg");
  assert.equal(createdUrls.length, 1);

  // Trigger component unmount cleanup
  URL.revokeObjectURL(blobUrl);
  assert.equal(revokedUrls.length, 1);
  assert.equal(revokedUrls[0], blobUrl, "Revoked URL must match created URL");
});

test("Task image 401/403/404 errors reject safely without destroying student session token", async () => {
  setToken("active-student-session");

  globalThis.fetch = async () => ({
    ok: false,
    status: 401,
    statusText: "Unauthorized"
  });

  await assert.rejects(
    async () => {
      await api.fetchMediaBlob("/api/uploads/unauthorized_task_image.png");
    },
    /Failed to load media \(401\)/
  );

  // Verify auth session was preserved
  assert.equal(localStorage.getItem("spark_token"), "active-student-session", "Session token in localStorage must remain intact");
  assert.equal(hasToken(), true, "Token state must remain active");
});
