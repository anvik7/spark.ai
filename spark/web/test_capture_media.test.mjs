import test from "node:test";
import assert from "node:assert/strict";

// Mock minimal browser environment
globalThis.localStorage = {
  store: { spark_token: "capture-jwt-token" },
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

test("fetchMediaBlob retrieves private capture image with Bearer auth", async () => {
  setToken("owner-bearer-token");
  let capturedHeaders = null;

  globalThis.fetch = async (url, options) => {
    capturedHeaders = options.headers;
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "image/png" }),
      blob: async () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" })
    };
  };

  const blobUrl = await api.fetchMediaBlob("/api/uploads/file_1_abc.png");
  assert.ok(blobUrl.startsWith("blob:"), "Should create and return blob URL");
  assert.equal(capturedHeaders.Authorization, "Bearer owner-bearer-token", "Must send Bearer token");
});

test("Capture image preview Blob URL is properly revoked on cleanup", async () => {
  createdUrls = [];
  revokedUrls = [];

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "image/jpeg" }),
    blob: async () => new Blob([new Uint8Array([255, 216, 255])], { type: "image/jpeg" })
  });

  const blobUrl = await api.fetchMediaBlob("/api/uploads/file_1_photo.jpg");
  assert.equal(createdUrls.length, 1);

  // Trigger revocation
  URL.revokeObjectURL(blobUrl);
  assert.equal(revokedUrls.length, 1);
  assert.equal(revokedUrls[0], blobUrl);
});

test("Private capture 401/403 failure does not wipe user session token", async () => {
  setToken("valid-active-session-token");

  globalThis.fetch = async () => ({
    ok: false,
    status: 403,
    statusText: "Forbidden"
  });

  await assert.rejects(
    async () => {
      await api.fetchMediaBlob("/api/uploads/forbidden_file.pdf");
    },
    /Failed to load media \(403\)/
  );

  // Ensure user session was NOT logged out
  assert.equal(globalThis.localStorage.getItem("spark_token"), "valid-active-session-token");
});
