import test from "node:test";
import assert from "node:assert/strict";

// Mock minimal browser environment
globalThis.localStorage = {
  store: { spark_token: "test-auth-jwt-token" },
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = v; },
  removeItem(k) { delete this.store[k]; }
};

let createdUrls = [];
let revokedUrls = [];

globalThis.URL.createObjectURL = (blob) => {
  const u = `blob:http://localhost/${Math.random().toString(36).substring(7)}`;
  createdUrls.push(u);
  return u;
};

globalThis.URL.revokeObjectURL = (u) => {
  revokedUrls.push(u);
};

// Import api client
const { api, setToken } = await import("./src/api.js");

test("fetchMediaBlob attaches Bearer authorization header", async () => {
  setToken("valid-user-bearer-token");
  let capturedHeaders = null;

  globalThis.fetch = async (url, options) => {
    capturedHeaders = options.headers;
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "image/png" }),
      blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" })
    };
  };

  const blobUrl = await api.fetchMediaBlob("/api/circles/media/chat_12_abc.png");
  assert.ok(blobUrl.startsWith("blob:"), "Should return a blob URL");
  assert.equal(capturedHeaders.Authorization, "Bearer valid-user-bearer-token", "Must send Bearer token");
});

test("fetchMediaBlob handles 401/403/404 failures without wiping auth token", async () => {
  setToken("preserved-session-token");

  globalThis.fetch = async () => ({
    ok: false,
    status: 403,
    statusText: "Forbidden"
  });

  await assert.rejects(
    async () => {
      await api.fetchMediaBlob("/api/circles/media/forbidden.png");
    },
    /Failed to load media \(403\)/
  );

  // Assert user token is preserved
  assert.equal(globalThis.localStorage.getItem("spark_token"), "preserved-session-token");
});

test("Blob URL revocation cleans up created URLs", async () => {
  createdUrls = [];
  revokedUrls = [];

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "image/jpeg" }),
    blob: async () => new Blob([new Uint8Array([9, 9, 9])], { type: "image/jpeg" })
  });

  const blobUrl = await api.fetchMediaBlob("/api/circles/media/chat_99_revokeme.jpg");
  assert.equal(createdUrls.length, 1);
  assert.equal(createdUrls[0], blobUrl);

  // Simulate component unmount / image change cleanup
  URL.revokeObjectURL(blobUrl);
  assert.equal(revokedUrls.length, 1);
  assert.equal(revokedUrls[0], blobUrl);
});
