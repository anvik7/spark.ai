import test from "node:test";
import assert from "node:assert/strict";

// Setup browser globals before importing modules that reference localStorage or window
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

class MockUtterance {
  constructor(text) {
    this.text = text;
    this.lang = "en-US";
    this.rate = 1;
    this.pitch = 1;
    this.volume = 1;
  }
}

globalThis.SpeechSynthesisUtterance = MockUtterance;

globalThis.window = {
  speechSynthesis: {
    speaking: false,
    paused: false,
    getVoices: () => [{ name: "Samantha", lang: "en-US", localService: true }],
    cancel: () => {},
    pause: () => {},
    resume: () => {},
    speak: (utter) => {
      utter.onstart?.();
      setTimeout(() => utter.onend?.(), 20);
    },
  },
  SpeechSynthesisUtterance: MockUtterance,
};

globalThis.Audio = class MockAudio {
  constructor(src) {
    this.src = src;
    this.currentTime = 0;
  }
  setAttribute() {}
  pause() {}
  play() {
    setTimeout(() => this.onended?.(), 20);
    return Promise.resolve();
  }
};

globalThis.URL = {
  createObjectURL: () => "blob:http://localhost/mock-audio",
  revokeObjectURL: () => {},
};

const { createInterviewController } = await import("./src/utils/interviewController.js");
const { createTTSManager } = await import("./src/utils/tts.js");

function configureMocks({ audioPlayHang = false, audioPlayReject = false, speechHang = false } = {}) {
  globalThis.window.speechSynthesis.speak = (utter) => {
    if (speechHang) return; // Emulate silent failure
    utter.onstart?.();
    setTimeout(() => utter.onend?.(), 20);
  };

  globalThis.Audio.prototype.play = function() {
    if (audioPlayReject) {
      return Promise.reject(new Error("NotAllowedError: Audio playback blocked"));
    }
    if (audioPlayHang) {
      return Promise.resolve();
    }
    setTimeout(() => this.onended?.(), 20);
    return Promise.resolve();
  };
}

test("1. Evaluation succeeds even when TTS rejects", async () => {
  configureMocks();
  let renderedQuestion = null;
  let currentStatus = null;

  const mockTTS = {
    speakAdaptive: () => Promise.reject(new Error("NotAllowedError: Autoplay restricted")),
    stop: () => {},
    pause: () => {},
    resume: () => {},
    replay: () => {},
    isSpeaking: () => false,
  };

  const mockSTT = {
    startListening: () => {},
    stopListening: () => {},
  };

  const ctrl = createInterviewController({
    targetRole: "Full Stack Engineer",
    company: "Google",
    aiStartInterview: async () => ({
      id: 1,
      status: "active",
      turns: [{ q: "Tell me about yourself", a: "" }],
    }),
    aiAnswerInterview: async (sessId, text) => ({
      id: sessId,
      status: "active",
      turns: [
        { q: "Tell me about yourself", a: text, feedback: "Good answer" },
        { q: "Walk me through a challenging bug you fixed.", a: "" },
      ],
    }),
    ttsInstance: mockTTS,
    sttInstance: mockSTT,
    ui: {
      onStatusChange: (s) => { currentStatus = s; },
      onInterviewerSpeaking: (q) => { renderedQuestion = q; },
    },
  });

  await ctrl.start();
  assert.equal(renderedQuestion, "Tell me about yourself");

  // Submit candidate answer with rejecting TTS
  await ctrl.submitAnswer("I am an experienced engineer with 5 years in distributed systems.");

  assert.equal(renderedQuestion, "Walk me through a challenging bug you fixed.");
  assert.equal(currentStatus, "listening");
  assert.equal(ctrl.getState().session.turns.length, 2);
});

test("2. Evaluation succeeds when TTS hangs indefinitely", async () => {
  configureMocks();
  let renderedQuestion = null;
  let candidateListeningCalled = false;

  // TTS that returns a promise that never settles
  const hangingTTS = {
    speakAdaptive: () => new Promise(() => {}),
    stop: () => {},
    pause: () => {},
    resume: () => {},
    replay: () => {},
    isSpeaking: () => true,
  };

  const mockSTT = {
    startListening: () => {},
    stopListening: () => {},
  };

  const ctrl = createInterviewController({
    targetRole: "Backend Engineer",
    company: "Stripe",
    aiStartInterview: async () => ({
      id: 2,
      status: "active",
      turns: [{ q: "Q1", a: "" }],
    }),
    aiAnswerInterview: async (sessId, text) => ({
      id: sessId,
      status: "active",
      turns: [
        { q: "Q1", a: text },
        { q: "Q2: Next question after hanging TTS", a: "" },
      ],
    }),
    ttsInstance: hangingTTS,
    sttInstance: mockSTT,
    ui: {
      onInterviewerSpeaking: (q) => { renderedQuestion = q; },
      onCandidateListening: () => { candidateListeningCalled = true; },
    },
  });

  await ctrl.start();

  // Submit answer should resolve immediately after evaluation, NOT waiting on TTS!
  const submitPromise = ctrl.submitAnswer("My detailed technical answer");

  const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("submitAnswer blocked by TTS hang!")), 1000));
  await Promise.race([submitPromise, timeoutPromise]);

  assert.equal(renderedQuestion, "Q2: Next question after hanging TTS");
  assert.equal(candidateListeningCalled, true);
  assert.equal(ctrl.getState().status, "listening");
});

test("3. TTS timeout in speakAdaptive resolves within 6 seconds when audio hangs", async () => {
  configureMocks({ audioPlayHang: true, speechHang: true });

  const tts = createTTSManager();
  let endCalled = false;

  const t0 = Date.now();
  await tts.speakAdaptive("Testing adaptive timeout safety", {
    onEnd: () => { endCalled = true; },
  });
  const elapsed = Date.now() - t0;

  // Should have triggered the safety timeout (6000ms limit, allowing small timer slack)
  assert.ok(elapsed <= 6500, `Elapsed ${elapsed}ms exceeded maximum allowed timeout`);
  assert.equal(endCalled, true);
  assert.equal(tts.getState().isSpeaking, false);
});

test("4. Browser speech timeout in speakBrowserSpeech resolves within 3 seconds when SpeechSynthesis hangs", async () => {
  configureMocks({ speechHang: true });

  const tts = createTTSManager();
  let endFired = false;

  const t0 = Date.now();
  await tts.speakAdaptive("Sentence that triggers SpeechSynthesis timeout", {
    onEnd: () => { endFired = true; },
  });
  const elapsed = Date.now() - t0;

  assert.ok(elapsed <= 4000, `Speech synthesis timeout took ${elapsed}ms`);
  assert.equal(endFired, true);
  assert.equal(tts.getState().isSpeaking, false);
});

test("5. Next interview question renders even when audio fails", async () => {
  configureMocks();
  let displayedQuestion = "";

  const failingTTS = {
    speakAdaptive: () => Promise.reject(new Error("Audio hardware error")),
    stop: () => {},
    pause: () => {},
    resume: () => {},
    replay: () => {},
    isSpeaking: () => false,
  };

  const ctrl = createInterviewController({
    targetRole: "Systems Engineer",
    aiStartInterview: async () => ({ id: 5, turns: [{ q: "Initial Question", a: "" }] }),
    aiAnswerInterview: async () => ({
      id: 5,
      turns: [
        { q: "Initial Question", a: "Ans" },
        { q: "Rendered Next Question Successfully", a: "" },
      ],
    }),
    ttsInstance: failingTTS,
    sttInstance: { startListening: () => {}, stopListening: () => {} },
    ui: {
      onInterviewerSpeaking: (q) => { displayedQuestion = q; },
    },
  });

  await ctrl.start();
  await ctrl.submitAnswer("Ans");

  assert.equal(displayedQuestion, "Rendered Next Question Successfully");
});

test("6. Controller reaches listening state after TTS failure", async () => {
  configureMocks();
  let statusList = [];

  const failingTTS = {
    speakAdaptive: () => Promise.reject(new Error("Audio playback failed")),
    stop: () => {},
    pause: () => {},
    resume: () => {},
    replay: () => {},
    isSpeaking: () => false,
  };

  const ctrl = createInterviewController({
    aiStartInterview: async () => ({ id: 6, turns: [{ q: "Q1", a: "" }] }),
    aiAnswerInterview: async () => ({
      id: 6,
      turns: [{ q: "Q1", a: "Ans" }, { q: "Q2", a: "" }],
    }),
    ttsInstance: failingTTS,
    sttInstance: { startListening: () => {}, stopListening: () => {} },
    ui: {
      onStatusChange: (s) => statusList.push(s),
    },
  });

  await ctrl.start();
  statusList = []; // Reset after start

  await ctrl.submitAnswer("Ans");

  assert.equal(ctrl.getState().status, "listening");
  assert.ok(statusList.includes("listening"));
});

test("7. Replay still works", async () => {
  configureMocks();
  const tts = createTTSManager();

  await tts.speakAdaptive("Original question for replay", {
    turnId: 1,
    onStart: () => {},
  });

  // Replay should re-speak the lastSpokenText
  tts.replay();
  assert.equal(tts.getState().lastSpokenText, "Original question for replay");
});

test("8. Pause, resume, and stop work correctly", async () => {
  configureMocks();
  const tts = createTTSManager();

  await tts.speakAdaptive("Test pause resume stop controls");

  tts.pause();
  assert.equal(tts.getState().isPaused, true);

  tts.resume();
  assert.equal(tts.getState().isPaused, false);

  tts.stop();
  assert.equal(tts.getState().isSpeaking, false);
  assert.equal(tts.getState().isPaused, false);
});

test("9. No duplicate TTS for the same turn", async () => {
  configureMocks();
  const tts = createTTSManager();

  let startCount = 0;
  // Trigger speech with turnId: 99
  const p1 = tts.speakAdaptive("Duplicate check text", {
    turnId: 99,
    onStart: () => { startCount++; },
  });

  // Calling speakAdaptive with identical turnId while active should return early
  await tts.speakAdaptive("Duplicate check text", {
    turnId: 99,
    onStart: () => { startCount++; },
  });

  await p1;
  assert.equal(startCount, 1);
});
