import { createTTSManager } from "./tts.js";
import { createSpeechRecognitionManager } from "./speechRecognition.js";

export function createInterviewController({
  targetRole = "",
  company = "",
  jobDescription = "",
  candidateProfile = "",
  interviewRound = "Technical Deep-Dive",
  difficulty = "Medium",
  aiStartInterview,
  aiAnswerInterview,
  aiEvaluateInterview,
  ttsInstance = null,
  sttInstance = null,
  ui = {},
} = {}) {
  const tts = ttsInstance || createTTSManager({ rate: 0.93, pitch: 1.0, volume: 1.0, preferredLang: "en-US" });
  const stt = sttInstance || createSpeechRecognitionManager({
    lang: "en-US",
    maxSilenceMs: 2500,
    isTTSActive: () => tts.isSpeaking(),
  });

  // Ensure STT is linked to TTS activity
  if (typeof stt.setTTSActiveCheck === "function") {
    stt.setTTSActiveCheck(() => tts.isSpeaking());
  }

  let running = false;

  const state = {
    session: null,
    round: interviewRound,
    turnIndex: 0,
    status: "idle", // "idle" | "speaking" | "listening" | "thinking" | "completed"
    currentQuestion: "",
    latestAnswer: "",
    previousQuestions: [],
    previousAnswers: [],
  };

  function setStatus(s) {
    state.status = s;
    ui.onStatusChange?.(s);
  }

  function stopAll() {
    running = false;
    tts.stop();
    stt.stopListening();
    setStatus("idle");
  }

  async function start() {
    stopAll();
    running = true;

    try {
      await tts.ensureVoicesLoaded();
    } catch (e) {}

    setStatus("thinking");

    let sess;
    try {
      sess = await aiStartInterview({
        target_role: targetRole,
        target_company: company,
        job_description: jobDescription,
        resume_text: candidateProfile,
        round_type: state.round,
        difficulty: difficulty,
      });
    } catch (error) {
      console.error("aiStartInterview error:", error);
      ui.onError?.(error);
      setStatus("idle");
      running = false;
      return;
    }

    state.session = sess;
    const turns = sess?.turns || [];
    const openingTurn = turns[turns.length - 1];
    const openingQuestion = openingTurn?.q || "Tell me about a project on your resume that best demonstrates your readiness for this role.";

    await handleQuestionTurn(openingQuestion);
  }

  async function handleQuestionTurn(questionText) {
    if (!running) return;

    const q = String(questionText || "").trim();
    if (!q) return;

    state.currentQuestion = q;
    state.previousQuestions.push(q);
    state.turnIndex += 1;

    // Stop candidate recording while interviewer speaks to avoid audio feedback
    stt.stopListening();

    setStatus("speaking");
    ui.onInterviewerSpeaking?.(q);

    try {
      await tts.speakAdaptive(q, {
        onStart: () => ui.onTTSStart?.(q),
        onEnd: () => ui.onTTSEnd?.(q),
        onError: (err) => ui.onTTSError?.(err),
      });
    } catch (e) {
      ui.onTTSError?.(e);
    }

    if (!running) return;

    // Echo dissipation cooldown before opening candidate mic
    await new Promise((resolve) => setTimeout(resolve, 400));

    if (!running) return;

    // After interviewer finishes speaking, open candidate listening window
    setStatus("listening");
    ui.onCandidateListening?.();
  }

  async function submitAnswer(answerText) {
    if (!running || !state.session) return;

    const ans = String(answerText || "").trim();
    if (!ans) return;

    // Stop listening during processing
    stt.stopListening();
    state.latestAnswer = ans;
    state.previousAnswers.push({ question: state.currentQuestion, answer: ans });

    ui.onCandidateTranscribed?.(ans);
    setStatus("thinking");

    let updatedSess;
    try {
      updatedSess = await aiAnswerInterview(state.session.id, ans);
    } catch (error) {
      console.error("aiAnswerInterview error:", error);
      ui.onError?.(error);
      setStatus("listening");
      return;
    }

    state.session = updatedSess;

    if (updatedSess.status === "completed") {
      setStatus("completed");
      ui.onInterviewCompleted?.(updatedSess);
      running = false;
      return;
    }

    const turns = updatedSess.turns || [];
    const latestTurn = turns[turns.length - 1];
    const nextQ = latestTurn?.q || "What was the most challenging technical decision you had to make in that situation?";

    await handleQuestionTurn(nextQ);
  }

  async function conclude() {
    if (!state.session) return;
    stopAll();
    setStatus("thinking");

    try {
      const evaluated = await aiEvaluateInterview(state.session.id);
      state.session = evaluated;
      setStatus("completed");
      ui.onInterviewCompleted?.(evaluated);
    } catch (error) {
      console.error("conclude error:", error);
      ui.onError?.(error);
      setStatus("idle");
    }
  }

  return {
    start,
    submitAnswer,
    conclude,
    stopAll,
    tts: {
      pause: () => tts.pause(),
      resume: () => tts.resume(),
      replay: () => tts.replay(),
      stop: () => tts.stop(),
      isSpeaking: () => tts.isSpeaking(),
    },
    stt: {
      startListening: (opts) => stt.startListening(opts),
      stopListening: () => stt.stopListening(),
      reset: () => stt.reset(),
      isSupported: stt.isSupported,
    },
    isSpeechSupported: typeof window !== "undefined" && "speechSynthesis" in window,
    isRecognitionSupported: stt.isSupported,
    getState: () => ({ ...state }),
  };
}
