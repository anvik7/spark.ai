import { api } from "../api.js";

// Natural Voice TTS Manager (Server-Side Audio + Web Speech Fallback)
export function createTTSManager({
  preferredLang = "en-US",
  rate = 0.93,
  pitch = 1.0,
  volume = 1.0,
  voiceScoring = true,
} = {}) {
  let voices = [];
  let voiceReady = false;

  const state = {
    currentUtterance: null,
    currentAudio: null,
    isSpeaking: false,
    isPaused: false,
    lastSpokenText: "",
  };

  const preferredLangLower = preferredLang.toLowerCase();

  function cleanForSpeech(text) {
    if (!text) return "";
    let t = String(text);

    // Remove markdown, code blocks, JSON, and internal system labels
    t = t
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`+/g, " ")
      .replace(/^\s*#+\s*/gm, "")
      .replace(/[*_]{1,3}/g, "")
      .replace(/\{\s*[\s\S]*?\s*\}/g, "")
      .replace(/\[.*?\]\s*:/g, "")
      .replace(/\b(system|developer|assistant|tool|json)\b/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/^\s*(AI|Assistant|Interviewer|Recruiter)\s*:\s*/i, "");

    // Collapse whitespace
    return t.replace(/\s+/g, " ").trim();
  }

  function splitIntoSentences(text) {
    if (!text) return [];
    const cleaned = cleanForSpeech(text);

    // Split on sentence-ending punctuation followed by whitespace
    const parts = cleaned.split(/(?<=[.!?])\s+/g).map((s) => s.trim()).filter(Boolean);

    if (parts.length <= 1 && cleaned.length > 180) {
      const chunks = [];
      for (let i = 0; i < cleaned.length; i += 160) {
        chunks.push(cleaned.slice(i, i + 160).trim());
      }
      return chunks;
    }

    const final = [];
    for (const p of parts) {
      if (p.length <= 220) {
        final.push(p);
      } else {
        const sub = p.split(/(?<=[,;:])\s+/g).map((x) => x.trim()).filter(Boolean);
        if (sub.length > 1) final.push(...sub);
        else final.push(p);
      }
    }
    return final;
  }

  function scoreVoice(v) {
    const name = (v.name || "").toLowerCase();
    const lang = (v.lang || "").toLowerCase();
    const localService = v.localService === true;

    let score = 0;

    if (lang === preferredLangLower) score += 120;
    if (lang.startsWith("en-us")) score += 90;
    if (lang.startsWith("en")) score += 60;
    if (localService) score += 10;

    if (name.includes("neural")) score += 25;
    if (name.includes("natural")) score += 20;
    if (name.includes("siri")) score += 12;
    if (name.includes("google")) score += 10;
    if (name.includes("microsoft")) score += 8;

    if (lang && !lang.startsWith("en")) score -= 20;

    return score;
  }

  function pickBestVoice() {
    if (!voices || voices.length === 0) return null;

    if (!voiceScoring) {
      return (
        voices.find((v) => (v.lang || "").toLowerCase() === preferredLangLower) ||
        voices.find((v) => (v.lang || "").toLowerCase().startsWith("en")) ||
        voices[0]
      );
    }

    let best = null;
    let bestScore = -Infinity;
    for (const v of voices) {
      const s = scoreVoice(v);
      if (s > bestScore) {
        bestScore = s;
        best = v;
      }
    }
    return best || voices[0];
  }

  function ensureVoicesLoaded() {
    return new Promise((resolve) => {
      if (typeof window === "undefined" || !window.speechSynthesis) {
        resolve(false);
        return;
      }

      voices = window.speechSynthesis.getVoices() || [];
      if (voices.length > 0) {
        voiceReady = true;
        resolve(true);
        return;
      }

      let done = false;
      const timeout = setTimeout(() => {
        if (done) return;
        done = true;
        voiceReady = voices.length > 0;
        resolve(voiceReady);
      }, 1500);

      const handler = () => {
        voices = window.speechSynthesis.getVoices() || [];
        if (voices.length > 0 && !done) {
          done = true;
          voiceReady = true;
          clearTimeout(timeout);
          window.speechSynthesis.onvoiceschanged = null;
          resolve(true);
        }
      };

      window.speechSynthesis.onvoiceschanged = handler;
    });
  }

  async function speakBrowserSpeech(cleaned, { onStart, onEnd, onError }) {
    if (typeof window === "undefined" || !window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      onError?.(new Error("SpeechSynthesis not supported in this browser."));
      return;
    }

    try {
      window.speechSynthesis.cancel();
    } catch (e) {}

    await ensureVoicesLoaded();
    const voice = pickBestVoice();

    const chunks = splitIntoSentences(cleaned);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk || !state.isSpeaking) break;

      const utter = new SpeechSynthesisUtterance(chunk);
      state.currentUtterance = utter;

      if (voice) utter.voice = voice;
      utter.lang = utter.voice?.lang || preferredLang;

      utter.rate = rate;
      utter.pitch = pitch;
      utter.volume = volume;

      const chunkDone = await new Promise((resolveChunk) => {
        utter.onend = () => resolveChunk(true);
        utter.onerror = () => resolveChunk(false);
        try {
          window.speechSynthesis.speak(utter);
        } catch (err) {
          resolveChunk(false);
        }
      });

      if (!chunkDone) {
        await new Promise((r) => setTimeout(r, 120));
      } else {
        const isLast = i === chunks.length - 1;
        if (!isLast) await new Promise((r) => setTimeout(r, 260));
      }
    }

    state.isSpeaking = false;
    state.currentUtterance = null;
    onEnd?.();
  }

  async function speakAdaptive(text, { onStart, onEnd, onError } = {}) {
    const t = String(text || "");
    const cleaned = cleanForSpeech(t);
    if (!cleaned) return;

    stop();

    state.lastSpokenText = cleaned;
    state.isPaused = false;
    state.isSpeaking = true;

    // Try primary server-side TTS (100% reliable cross-platform MP3 playback for iOS / Android)
    try {
      const audioUrl = await api.generateTTS(cleaned).catch(() => null);
      if (audioUrl && state.isSpeaking) {
        onStart?.();
        const audio = new Audio(audioUrl);
        state.currentAudio = audio;
        audio.onended = () => {
          state.isSpeaking = false;
          state.currentAudio = null;
          URL.revokeObjectURL(audioUrl);
          onEnd?.();
        };
        audio.onerror = () => {
          state.currentAudio = null;
          URL.revokeObjectURL(audioUrl);
          speakBrowserSpeech(cleaned, { onStart, onEnd, onError });
        };
        await audio.play();
        return;
      }
    } catch (e) {
      console.warn("Server TTS playback error, falling back to Web Speech:", e);
    }

    // Fallback: Browser SpeechSynthesis
    onStart?.();
    speakBrowserSpeech(cleaned, { onStart, onEnd, onError });
  }

  function stop() {
    state.isSpeaking = false;
    state.isPaused = false;
    if (state.currentAudio) {
      try {
        state.currentAudio.pause();
        state.currentAudio.currentTime = 0;
      } catch (e) {}
      state.currentAudio = null;
    }
    try {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    } catch (e) {}
  }

  function pause() {
    state.isPaused = true;
    try {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.pause();
      }
    } catch (e) {}
  }

  function resume() {
    state.isPaused = false;
    try {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.resume();
      }
    } catch (e) {}
  }

  function replay(options = {}) {
    if (state.lastSpokenText) {
      stop();
      return speakAdaptive(state.lastSpokenText, options);
    }
    return Promise.resolve();
  }

  return {
    speakAdaptive,
    stop,
    pause,
    resume,
    replay,
    ensureVoicesLoaded,
    getVoices: () => (typeof window !== "undefined" ? window.speechSynthesis?.getVoices?.() || [] : []),
    getState: () => ({ ...state }),
  };
}
