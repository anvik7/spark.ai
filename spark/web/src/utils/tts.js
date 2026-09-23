import { api } from "../api.js";

// Silent 48-byte WAV for iOS Safari media unlocking
const SILENT_WAV =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

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
    audioContext: null,
    unlockAudioEl: null,
    isSpeaking: false,
    isPaused: false,
    lastSpokenText: "",
  };

  const preferredLangLower = preferredLang.toLowerCase();

  function unlockAudio() {
    if (typeof window === "undefined") return;

    // 1. Resume Web Audio AudioContext if available/suspended
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        if (!state.audioContext) {
          state.audioContext = new AudioCtx();
        }
        if (state.audioContext.state === "suspended") {
          state.audioContext.resume().catch(() => {});
        }
      }
    } catch (e) {}

    // 2. Play silent audio element to unlock HTML5 media on iOS Safari
    try {
      if (!state.unlockAudioEl) {
        const el = new Audio();
        el.setAttribute("playsinline", "true");
        el.setAttribute("webkit-playsinline", "true");
        el.preload = "auto";
        state.unlockAudioEl = el;
      }
      state.unlockAudioEl.src = SILENT_WAV;
      const playPromise = state.unlockAudioEl.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {});
      }
    } catch (e) {}
  }

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

  async function speakBrowserSpeech(cleaned, { onStart, onEnd, onError } = {}) {
    if (typeof window === "undefined" || !window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      state.isSpeaking = false;
      onError?.(new Error("SpeechSynthesis not supported in this browser."));
      onEnd?.();
      return;
    }

    try {
      window.speechSynthesis.cancel();
    } catch (e) {}

    let speechStarted = false;
    try {
      await ensureVoicesLoaded();
      const voice = pickBestVoice();
      const chunks = splitIntoSentences(cleaned);

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (!chunk || !state.isSpeaking) break;

        const UtterClass = (typeof window !== "undefined" && window.SpeechSynthesisUtterance) ? window.SpeechSynthesisUtterance : SpeechSynthesisUtterance;
        const utter = new UtterClass(chunk);
        state.currentUtterance = utter;

        if (voice) utter.voice = voice;
        utter.lang = utter.voice?.lang || preferredLang;

        utter.rate = rate;
        utter.pitch = pitch;
        utter.volume = volume;

        utter.onstart = () => {
          if (!speechStarted && state.isSpeaking) {
            speechStarted = true;
            onStart?.();
          }
        };

        const chunkDone = await new Promise((resolveChunk) => {
          let settled = false;
          let chunkTimer = null;

          const done = (val) => {
            if (!settled) {
              settled = true;
              if (chunkTimer) clearTimeout(chunkTimer);
              resolveChunk(val);
            }
          };

          // Hard timeout of 3000ms per utterance chunk
          chunkTimer = setTimeout(() => {
            console.warn("[TTS] Browser SpeechSynthesis utterance timed out (3000ms limit)");
            try {
              window.speechSynthesis.cancel();
            } catch (e) {}
            done(false);
          }, 3000);

          utter.onend = () => done(true);
          utter.onerror = (e) => {
            console.warn("[TTS] SpeechSynthesisUtterance error:", e);
            done(false);
          };

          try {
            window.speechSynthesis.speak(utter);
          } catch (err) {
            console.warn("[TTS] window.speechSynthesis.speak exception:", err);
            done(false);
          }
        });

        if (!chunkDone) {
          await new Promise((r) => setTimeout(r, 120));
        } else {
          const isLast = i === chunks.length - 1;
          if (!isLast) await new Promise((r) => setTimeout(r, 260));
        }
      }
    } catch (err) {
      console.warn("[TTS] speakBrowserSpeech failure:", err?.message || err);
      onError?.(err);
    } finally {
      state.isSpeaking = false;
      state.lastSpeechEndedTs = Date.now();
      state.currentUtterance = null;
      onEnd?.();
    }
  }

  async function speakAdaptive(text, { onStart, onEnd, onError, emotion = "neutral", delivery = null, turnId = null } = {}) {
    const t = String(text || "");
    const cleaned = cleanForSpeech(t);
    if (!cleaned) {
      onEnd?.();
      return;
    }

    // Deduplication check: prevent duplicate synthesis if identical turn/text is active
    if (state.isSpeaking && (turnId && state.lastTurnId === turnId)) {
      return;
    }

    stop();

    state.lastSpokenText = cleaned;
    state.lastTurnId = turnId;
    state.isPaused = false;
    state.isSpeaking = true;

    let hasStarted = false;
    const notifyStart = () => {
      if (!hasStarted && state.isSpeaking) {
        hasStarted = true;
        onStart?.();
      }
    };

    // Overall hard timeout safety (6000ms max wait) guaranteeing resolution
    return await new Promise((resolveOverall) => {
      let overallSettled = false;
      let overallTimer = null;

      const finishOverall = (success) => {
        if (!overallSettled) {
          overallSettled = true;
          if (overallTimer) clearTimeout(overallTimer);
          state.isSpeaking = false;
          state.lastSpeechEndedTs = Date.now();
          state.currentAudio = null;
          onEnd?.();
          resolveOverall(success);
        }
      };

      overallTimer = setTimeout(() => {
        console.warn("[TTS] speakAdaptive hard timeout exceeded (6000ms limit)");
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
        finishOverall(false);
      }, 6000);

      (async () => {
        try {
          // 1. Try primary server-side TTS (Chatterbox /api/tts - MP3/WAV audio)
          let audioUrl = null;
          try {
            audioUrl = await Promise.race([
              api.generateTTS(cleaned, { emotion, delivery }),
              new Promise((resolve) => setTimeout(() => resolve(null), 4500)),
            ]).catch((err) => {
              console.warn("[TTS] api.generateTTS failed:", err?.message || err);
              return null;
            });
          } catch (fetchErr) {
            console.warn("[TTS] api.generateTTS network error:", fetchErr);
            audioUrl = null;
          }

          if (audioUrl && state.isSpeaking && !overallSettled) {
            const audio = new Audio(audioUrl);
            audio.setAttribute("playsinline", "true");
            audio.setAttribute("webkit-playsinline", "true");
            audio.preload = "auto";
            state.currentAudio = audio;

            audio.onplay = () => {
              notifyStart();
            };

            audio.onended = () => {
              try {
                URL.revokeObjectURL(audioUrl);
              } catch (e) {}
              finishOverall(true);
            };

            audio.onerror = (e) => {
              console.warn("[TTS] HTMLAudioElement error, falling back to Web Speech:", e);
              state.currentAudio = null;
              try {
                URL.revokeObjectURL(audioUrl);
              } catch (err) {}
              if (state.isSpeaking && !overallSettled) {
                speakBrowserSpeech(cleaned, {
                  onStart: notifyStart,
                  onEnd: () => finishOverall(true),
                  onError: (err) => {
                    onError?.(err);
                    finishOverall(false);
                  },
                }).catch(() => finishOverall(false));
              } else {
                finishOverall(false);
              }
            };

            const playPromise = audio.play();
            if (playPromise !== undefined) {
              playPromise
                .then(() => {
                  notifyStart();
                })
                .catch((playErr) => {
                  console.warn("[TTS] HTMLAudioElement play rejected, falling back to Web Speech:", playErr?.message || playErr);
                  state.currentAudio = null;
                  try {
                    URL.revokeObjectURL(audioUrl);
                  } catch (err) {}
                  if (state.isSpeaking && !overallSettled) {
                    speakBrowserSpeech(cleaned, {
                      onStart: notifyStart,
                      onEnd: () => finishOverall(true),
                      onError: (err) => {
                        onError?.(err);
                        finishOverall(false);
                      },
                    }).catch(() => finishOverall(false));
                  } else {
                    finishOverall(false);
                  }
                });
            }
            return;
          }

          // 2. Fallback: Browser SpeechSynthesis
          if (state.isSpeaking && !overallSettled) {
            await speakBrowserSpeech(cleaned, {
              onStart: notifyStart,
              onEnd: () => finishOverall(true),
              onError: (err) => {
                console.warn("[TTS] Browser speech fallback notice:", err?.message || err);
                onError?.(err);
                finishOverall(false);
              },
            });
          } else {
            finishOverall(false);
          }
        } catch (e) {
          console.warn("[TTS] speakAdaptive execution error:", e?.message || e);
          onError?.(e);
          finishOverall(false);
        }
      })();
    });
  }

  function stop() {
    state.isSpeaking = false;
    state.lastSpeechEndedTs = Date.now();
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
    unlockAudio,
    isSpeaking: () => state.isSpeaking || (Date.now() - (state.lastSpeechEndedTs || 0) < 500),
    ensureVoicesLoaded,
    getVoices: () => (typeof window !== "undefined" ? window.speechSynthesis?.getVoices?.() || [] : []),
    getState: () => ({ ...state }),
  };
}
