import test from "node:test";
import assert from "node:assert/strict";

// Mock minimal browser environment
globalThis.localStorage = {
  store: { spark_token: "test-avatar-session-token" },
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = v; },
  removeItem(k) { delete this.store[k]; }
};

let createdUrls = [];
let revokedUrls = [];

globalThis.URL = globalThis.URL || {};
globalThis.URL.createObjectURL = (blob) => {
  const u = `blob:http://localhost/${Math.random().toString(36).substring(7)}`;
  createdUrls.push(u);
  return u;
};
globalThis.URL.revokeObjectURL = (u) => {
  revokedUrls.push(u);
};

// Import api client and avatar utilities
const { api, setToken, hasToken } = await import("./src/api.js");
const { getPreset, isImageAvatarUrl, AVATAR_PRESETS } = await import("./src/utils/avatar.js");

test("uploadAvatar sends POST to /api/me/avatar with FormData file", async () => {
  setToken("owner-token-123");
  let capturedUrl = "";
  let capturedOptions = null;

  globalThis.fetch = async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify({
        id: 42,
        name: "Test User",
        avatar_url: "/api/uploads/avatar_42_xyz123.png"
      })
    };
  };

  const fakeFile = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
  fakeFile.name = "profile.png";

  const res = await api.uploadAvatar(fakeFile);
  assert.equal(capturedUrl, "/api/me/avatar");
  assert.equal(capturedOptions.method, "POST");
  assert.equal(capturedOptions.headers.Authorization, "Bearer owner-token-123");
  assert.ok(capturedOptions.body instanceof FormData, "Must send FormData payload");
  assert.ok(res.avatar_url.startsWith("/api/uploads/avatar_"));
});

test("deleteAvatar sends DELETE to /api/me/avatar with auth", async () => {
  setToken("owner-token-123");
  let capturedUrl = "";
  let capturedOptions = null;

  globalThis.fetch = async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify({
        id: 42,
        name: "Test User",
        avatar_url: ""
      })
    };
  };

  const res = await api.deleteAvatar();
  assert.equal(capturedUrl, "/api/me/avatar");
  assert.equal(capturedOptions.method, "DELETE");
  assert.equal(capturedOptions.headers.Authorization, "Bearer owner-token-123");
  assert.equal(res.avatar_url, "");
});

test("updateAvatarPreset sends POST to /api/me/avatar with JSON body", async () => {
  setToken("owner-token-123");
  let capturedUrl = "";
  let capturedOptions = null;

  globalThis.fetch = async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify({
        id: 42,
        name: "Test User",
        avatar_url: "preset-3"
      })
    };
  };

  const res = await api.updateAvatarPreset("preset-3");
  assert.equal(capturedUrl, "/api/me/avatar");
  assert.equal(capturedOptions.method, "POST");
  assert.equal(capturedOptions.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(capturedOptions.body), { avatar_url: "preset-3" });
  assert.equal(res.avatar_url, "preset-3");
});

test("isImageAvatarUrl correctly distinguishes uploaded image URLs from presets and falsy values", () => {
  assert.equal(isImageAvatarUrl("/api/uploads/avatar_42_abc.png"), true);
  assert.equal(isImageAvatarUrl("https://example.com/avatar.jpg"), true);
  assert.equal(isImageAvatarUrl("blob:http://localhost/abc-123"), true);
  assert.equal(isImageAvatarUrl("data:image/png;base64,iVBORw0KGgo="), true);

  assert.equal(isImageAvatarUrl("preset-1"), false);
  assert.equal(isImageAvatarUrl("preset-10"), false);
  assert.equal(isImageAvatarUrl(""), false);
  assert.equal(isImageAvatarUrl(null), false);
  assert.equal(isImageAvatarUrl(undefined), false);
});

test("getPreset resolves defined presets and hashes user names for deterministic fallback", () => {
  const p1 = getPreset("preset-1", "Kunal");
  assert.equal(p1.id, "preset-1");
  assert.equal(p1.name, "Cosmic Spark");
  assert.ok(p1.bg);
  assert.ok(p1.icon);

  // When given empty or image URL, falls back to deterministic preset based on name hash
  const fallback = getPreset("/api/uploads/avatar_42.png", "Kunal");
  assert.ok(fallback.id.startsWith("preset-"));
  assert.ok(AVATAR_PRESETS.some((p) => p.id === fallback.id));
});

test("Profile picture preview Blob URL is created and revoked cleanly on lifecycle", () => {
  createdUrls = [];
  revokedUrls = [];

  const file = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
  const previewUrl = globalThis.URL.createObjectURL(file);

  assert.equal(createdUrls.length, 1);
  assert.equal(createdUrls[0], previewUrl);

  // Simulate cleanup / replacement / cancel
  globalThis.URL.revokeObjectURL(previewUrl);
  assert.equal(revokedUrls.length, 1);
  assert.equal(revokedUrls[0], previewUrl);
});

test("Avatar upload failure preserves the existing authentication session token", async () => {
  setToken("persisted-auth-token-999");

  globalThis.fetch = async () => ({
    ok: false,
    status: 400,
    headers: new Headers({ "content-type": "application/json" }),
    text: async () => JSON.stringify({ detail: "Image file size exceeds 5MB limit." })
  });

  const fakeFile = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });

  await assert.rejects(
    async () => {
      await api.uploadAvatar(fakeFile);
    },
    (err) => {
      assert.ok(err.message.includes("5MB"));
      return true;
    }
  );

  // Ensure session token is NOT destroyed or wiped
  assert.equal(hasToken(), true);
  assert.equal(globalThis.localStorage.getItem("spark_token"), "persisted-auth-token-999");
});
