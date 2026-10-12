import test from "node:test";
import assert from "node:assert/strict";

// Mock minimal browser environment
globalThis.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = v; },
  removeItem(k) { delete this.store[k]; }
};

if (!globalThis.window) {
  globalThis.window = {
    dispatchEvent: () => {}
  };
}

const { api } = await import("./src/api.js");

test("forgotPassword sends POST to /api/auth/forgot-password with JSON email body", async () => {
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
        ok: true,
        message: "If an account exists for this email, we've sent password reset instructions."
      })
    };
  };

  const res = await api.forgotPassword("student@sparkdhi.ai");
  assert.equal(capturedUrl, "/api/auth/forgot-password");
  assert.equal(capturedOptions.method, "POST");
  assert.equal(capturedOptions.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(capturedOptions.body), { email: "student@sparkdhi.ai" });
  assert.equal(res.ok, true);
  assert.ok(res.message.includes("sent password reset instructions"));
});

test("forgotPassword preserves server rate limit message on 429", async () => {
  globalThis.fetch = async () => ({
    ok: false,
    status: 429,
    headers: new Headers({ "content-type": "application/json" }),
    text: async () => JSON.stringify({
      detail: "Too many password reset requests. Please wait 15 minutes before trying again."
    })
  });

  await assert.rejects(
    async () => {
      await api.forgotPassword("spammer@sparkdhi.ai");
    },
    (err) => {
      assert.equal(err.status, 429);
      assert.equal(err.code, "RATE_LIMITED");
      assert.equal(err.message, "Too many password reset requests. Please wait 15 minutes before trying again.");
      return true;
    }
  );
});

test("verifyResetToken sends POST to /api/auth/verify-reset-token with token payload", async () => {
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
        ok: true,
        valid: true,
        masked_email: "st***@sparkdhi.ai"
      })
    };
  };

  const sampleToken = "secure-reset-token-abc-123";
  const res = await api.verifyResetToken(sampleToken);
  assert.equal(capturedUrl, "/api/auth/verify-reset-token");
  assert.equal(capturedOptions.method, "POST");
  assert.deepEqual(JSON.parse(capturedOptions.body), { token: sampleToken });
  assert.equal(res.ok, true);
  assert.equal(res.valid, true);
  assert.equal(res.masked_email, "st***@sparkdhi.ai");
});

test("verifyResetToken surfaces invalid/expired error on 400", async () => {
  globalThis.fetch = async () => ({
    ok: false,
    status: 400,
    headers: new Headers({ "content-type": "application/json" }),
    text: async () => JSON.stringify({
      detail: "This password reset link is invalid or has expired. Please request a new one."
    })
  });

  await assert.rejects(
    async () => {
      await api.verifyResetToken("expired-token-xyz");
    },
    (err) => {
      assert.equal(err.status, 400);
      assert.equal(err.message, "This password reset link is invalid or has expired. Please request a new one.");
      return true;
    }
  );
});

test("resetPassword sends POST to /api/auth/reset-password with token and new_password", async () => {
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
        ok: true,
        message: "Password has been successfully updated. You can now log in with your new password."
      })
    };
  };

  const testToken = "valid-token-777";
  const newPass = "NewSecurePassword2026!";
  const res = await api.resetPassword(testToken, newPass);

  assert.equal(capturedUrl, "/api/auth/reset-password");
  assert.equal(capturedOptions.method, "POST");
  assert.deepEqual(JSON.parse(capturedOptions.body), {
    token: testToken,
    new_password: newPass
  });
  assert.equal(res.ok, true);
  assert.ok(res.message.includes("successfully updated"));
});

test("resetPassword supports object payload { token, new_password }", async () => {
  let capturedOptions = null;

  globalThis.fetch = async (url, options) => {
    capturedOptions = options;
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify({ ok: true, message: "Updated" })
    };
  };

  await api.resetPassword({ token: "obj-token-123", new_password: "AnotherPassword123!" });
  assert.deepEqual(JSON.parse(capturedOptions.body), {
    token: "obj-token-123",
    new_password: "AnotherPassword123!"
  });
});

test("resetPassword handles 400 validation error without leaking sensitive credentials", async () => {
  const logged = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.log = (...args) => logged.push(args.join(" "));
  console.warn = (...args) => logged.push(args.join(" "));
  console.error = (...args) => logged.push(args.join(" "));

  try {
    globalThis.fetch = async () => ({
      ok: false,
      status: 400,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify({
        detail: "Password must be at least 8 characters long."
      })
    });

    const secretPassword = "short";
    const secretToken = "secret-token-do-not-log";

    await assert.rejects(
      async () => {
        await api.resetPassword(secretToken, secretPassword);
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.message, "Password must be at least 8 characters long.");
        return true;
      }
    );

    // Assert that neither secretToken nor secretPassword was logged
    for (const logLine of logged) {
      assert.ok(!logLine.includes(secretToken), "Reset token must never be logged");
      assert.ok(!logLine.includes(secretPassword), "Password must never be logged");
    }
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }
});
