// Web Speech Recognition (STT) Manager
export function createSpeechRecognitionManager({
  lang = "en-US",
  interimResults = true,
  maxSilenceMs = 2500,
  isTTSActive = () => false,
} = {}) {
  const SpeechRecognition =
    typeof window !== "undefined"
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : null;

  const state = {
    isSupported: !!SpeechRecognition,
    recognition: null,
    listening: false,
    transcript: "",
    interim: "",
    lastEmittedFinal: "",
    lastHeardTs: 0,
    isTTSActive,
    onResult: null,
    onFinal: null,
    onError: null,
    onEnd: null,
    silenceTimer: null,
  };

  function reset() {
    stopListening();
    state.transcript = "";
    state.interim = "";
    state.lastEmittedFinal = "";
    state.lastHeardTs = 0;
  }

  function startListening({ onResult, onFinal, onError, onEnd, checkTTSActive } = {}) {
    state.onResult = onResult;
    state.onFinal = onFinal;
    state.onError = onError;
    state.onEnd = onEnd;
    if (typeof checkTTSActive === "function") {
      state.isTTSActive = checkTTSActive;
    }

    if (!state.isSupported) {
      const err = new Error("SpeechRecognition is not supported in this browser.");
      onError?.(err);
      onEnd?.("");
      return Promise.resolve("");
    }

    // Stop any previously existing recognition instance
    stopListening();

    try {
      state.recognition = new SpeechRecognition();
      state.recognition.lang = lang;
      state.recognition.interimResults = interimResults;
      state.recognition.continuous = true;

      state.transcript = "";
      state.interim = "";
      state.lastEmittedFinal = "";
      state.listening = true;

      state.recognition.onresult = (event) => {
        // PREVENT FEEDBACK LOOP: If interviewer TTS is currently speaking or just finished, discard
        if (state.isTTSActive?.()) {
          return;
        }

        let fullFinal = "";
        let currentInterim = "";

        for (let i = 0; i < event.results.length; i++) {
          const res = event.results[i];
          const txt = res[0]?.transcript || "";
          if (res.isFinal) {
            fullFinal += (fullFinal ? " " : "") + txt.trim();
          } else {
            currentInterim += (currentInterim ? " " : "") + txt.trim();
          }
        }

        const now = Date.now();
        if (fullFinal || currentInterim) {
          state.lastHeardTs = now;
        }

        state.interim = currentInterim;
        state.transcript = fullFinal;

        // Emit clean, separated interim and canonical final
        state.onResult?.({
          interim: state.interim,
          final: state.transcript,
        });

        // Emit onFinal only when new final content is committed
        if (fullFinal && fullFinal !== state.lastEmittedFinal) {
          state.lastEmittedFinal = fullFinal;
          state.onFinal?.(fullFinal);
        }
      };

      state.recognition.onerror = (event) => {
        // Non-fatal errors like 'no-speech' or 'aborted' are normal lifecycle events
        if (event?.error !== "no-speech" && event?.error !== "aborted") {
          state.listening = false;
          state.onError?.(
            event?.error ? new Error(`Speech error: ${event.error}`) : new Error("Speech recognition error.")
          );
        }
      };

      state.recognition.onend = () => {
        state.listening = false;
        if (state.silenceTimer) {
          clearInterval(state.silenceTimer);
          state.silenceTimer = null;
        }
        state.onEnd?.(state.transcript.trim());
      };

      // Soft silence timer automatically stops listening after candidate pauses
      state.silenceTimer = setInterval(() => {
        if (!state.listening) return;
        // Don't timeout if TTS is speaking
        if (state.isTTSActive?.()) return;

        const silenceFor = Date.now() - state.lastHeardTs;
        if (state.lastHeardTs > 0 && silenceFor > maxSilenceMs) {
          try {
            state.listening = false;
            state.recognition?.stop();
          } catch (e) {}
        }
      }, 350);

      state.lastHeardTs = Date.now();
      state.recognition.start();
    } catch (e) {
      state.listening = false;
      state.onError?.(e);
      return Promise.resolve("");
    }

    return new Promise((resolve) => {
      const prevOnEnd = state.onEnd;
      state.onEnd = (finalText) => {
        prevOnEnd?.(finalText);
        if (state.silenceTimer) {
          clearInterval(state.silenceTimer);
          state.silenceTimer = null;
        }
        resolve(finalText || "");
      };
    });
  }

  function stopListening() {
    state.listening = false;
    if (state.silenceTimer) {
      clearInterval(state.silenceTimer);
      state.silenceTimer = null;
    }
    try {
      if (state.recognition) {
        state.recognition.onresult = null;
        state.recognition.onerror = null;
        state.recognition.onend = null;
        state.recognition.stop();
        state.recognition = null;
      }
    } catch (e) {}
  }

  return {
    isSupported: state.isSupported,
    startListening,
    stopListening,
    reset,
    setTTSActiveCheck: (fn) => {
      state.isTTSActive = fn;
    },
    getState: () => ({ ...state }),
  };
}
