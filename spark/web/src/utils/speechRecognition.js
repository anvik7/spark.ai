// Web Speech Recognition (STT) Manager
export function createSpeechRecognitionManager({
  lang = "en-US",
  interimResults = true,
  maxSilenceMs = 2500,
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
    lastHeardTs: 0,
    onResult: null,
    onFinal: null,
    onError: null,
    onEnd: null,
    silenceTimer: null,
  };

  function startListening({ onResult, onFinal, onError, onEnd } = {}) {
    state.onResult = onResult;
    state.onFinal = onFinal;
    state.onError = onError;
    state.onEnd = onEnd;

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
      state.listening = true;

      state.recognition.onresult = (event) => {
        let interimText = "";
        let finalText = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const txt = res[0]?.transcript || "";
          if (res.isFinal) finalText += txt;
          else interimText += txt;
        }

        const now = Date.now();
        if (finalText || interimText) state.lastHeardTs = now;

        if (interimText) {
          state.interim = interimText.trim();
          state.onResult?.({ interim: state.interim, final: state.transcript.trim() });
        }

        if (finalText) {
          state.transcript = (state.transcript + " " + finalText).trim();
          state.onFinal?.(state.transcript);
        }
      };

      state.recognition.onerror = (event) => {
        state.listening = false;
        // Ignore non-fatal 'no-speech' or 'aborted' errors cleanly
        if (event?.error !== "no-speech" && event?.error !== "aborted") {
          state.onError?.(event?.error ? new Error(`Speech error: ${event.error}`) : new Error("Speech recognition error."));
        }
      };

      state.recognition.onend = () => {
        state.listening = false;
        if (state.silenceTimer) clearInterval(state.silenceTimer);
        state.onEnd?.(state.transcript.trim());
      };

      // Soft silence timer automatically stops listening after candidate pauses
      state.silenceTimer = setInterval(() => {
        if (!state.listening) return;
        const silenceFor = Date.now() - state.lastHeardTs;
        if (state.lastHeardTs > 0 && silenceFor > maxSilenceMs) {
          try {
            state.listening = false;
            state.recognition.stop();
          } catch (e) {}
        }
      }, 400);

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
        if (state.silenceTimer) clearInterval(state.silenceTimer);
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
        state.recognition.stop();
        state.recognition = null;
      }
    } catch (e) {}
  }

  return {
    isSupported: state.isSupported,
    startListening,
    stopListening,
    getState: () => ({ ...state }),
  };
}
