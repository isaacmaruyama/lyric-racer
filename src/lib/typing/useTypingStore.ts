import { create } from "zustand";
import { LyricStanza } from "../lyrics/stanzaParser";
import {
  CharStatus,
  compareTypingProgress,
} from "./normalizer";

export type GamePhase =
  | "lobby"
  | "playing_audio"
  | "paused_for_stanza"
  | "stanza_resolved"
  | "game_over";

export interface StanzaHistoryEntry {
  stanzaIndex: number;
  outcome: "completed" | "timeout" | "opponent_won";
  wpm: number;
  accuracy: number;
  pointsEarned: number;
  winnerName?: string;
  rawLineText?: string;
}

export interface TypingGameState {
  phase: GamePhase;
  trackTitle: string;
  artistName: string;
  albumArtUrl: string;
  spotifyUri: string;
  previewAudioUrl: string;
  durationMs: number;
  playbackTimeMs: number;

  stanzas: LyricStanza[];
  /** The index of the line the player is currently typing (can be ahead of the audio!) */
  activeStanzaIndex: number;
  /** The index of the line the audio playback is currently singing or waiting at */
  audioStanzaIndex: number;
  resolvedStanzaIndices: number[];

  // Lyric memory challenge state for activeStanzaIndex
  userInput: string;
  targetNormalized: string;
  charStatuses: CharStatus[];
  cursorIndex: number;
  progressPercent: number;
  accuracyPercent: number;
  currentWpm: number;
  hintsUsedInCurrentLine: number;
  challengeStartedAtMs: number | null;
  countdownRemainingSec: number;
  lastStanzaWinner: string | null;
  lastUnlockedLineText: string | null;

  // Player cumulative stats
  score: number;
  streak: number;
  averageWpm: number;
  history: StanzaHistoryEntry[];

  // Actions
  loadTrack: (params: {
    trackTitle: string;
    artistName: string;
    albumArtUrl?: string;
    spotifyUri?: string;
    previewAudioUrl?: string;
    durationMs: number;
    stanzas: LyricStanza[];
  }) => void;
  startMatch: () => void;
  setPlaybackTimeMs: (timeMs: number) => {
    shouldPauseAudio: boolean;
    triggeredStanzaIndex: number | null;
  };
  triggerStanzaChallenge: (stanzaIndex: number) => void;
  updateUserInput: (input: string) => {
    justCompleted: boolean;
    shouldResumeAudio: boolean;
    completedStanzaIndex: number | null;
    progressPercent: number;
    wpm: number;
  };
  revealNextWordHint: () => {
    justCompleted: boolean;
    shouldResumeAudio: boolean;
    completedStanzaIndex: number | null;
    progressPercent: number;
    wpm: number;
  };
  giveUpCurrentLine: () => { shouldResumeAudio: boolean };
  tickCountdown: () => { timedOut: boolean; shouldResumeAudio: boolean };
  resolveStanza: (
    outcome: "completed" | "timeout" | "opponent_won",
    winnerName?: string
  ) => { shouldResumeAudio: boolean };
  continuePlaybackAfterResolve: () => void;
  resetGame: () => void;
}

function createInitialLineState(stanzas: LyricStanza[], index: number) {
  const stanza = stanzas[index];
  if (!stanza) {
    return {
      userInput: "",
      targetNormalized: "",
      charStatuses: [] as CharStatus[],
      cursorIndex: 0,
      progressPercent: 0,
      accuracyPercent: 100,
      currentWpm: 0,
      hintsUsedInCurrentLine: 0,
      challengeStartedAtMs: Date.now(),
      countdownRemainingSec: 15,
    };
  }
  const comparison = compareTypingProgress(stanza.combinedNormalizedText, "");
  return {
    userInput: "",
    targetNormalized: comparison.targetNormalized,
    charStatuses: comparison.charStatuses,
    cursorIndex: 0,
    progressPercent: 0,
    accuracyPercent: 100,
    currentWpm: 0,
    hintsUsedInCurrentLine: 0,
    challengeStartedAtMs: Date.now(),
    countdownRemainingSec: stanza.countdownSeconds,
  };
}

export const useTypingStore = create<TypingGameState>((set, get) => ({
  phase: "lobby",
  trackTitle: "",
  artistName: "",
  albumArtUrl: "",
  spotifyUri: "",
  previewAudioUrl: "",
  durationMs: 180000,
  playbackTimeMs: 0,

  stanzas: [],
  activeStanzaIndex: 0,
  audioStanzaIndex: 0,
  resolvedStanzaIndices: [],

  userInput: "",
  targetNormalized: "",
  charStatuses: [],
  cursorIndex: 0,
  progressPercent: 0,
  accuracyPercent: 100,
  currentWpm: 0,
  hintsUsedInCurrentLine: 0,
  challengeStartedAtMs: null,
  countdownRemainingSec: 15,
  lastStanzaWinner: null,
  lastUnlockedLineText: null,

  score: 0,
  streak: 0,
  averageWpm: 0,
  history: [],

  loadTrack: ({
    trackTitle,
    artistName,
    albumArtUrl = "",
    spotifyUri = "",
    previewAudioUrl = "",
    durationMs,
    stanzas,
  }) => {
    const firstLineState = createInitialLineState(stanzas, 0);
    set({
      phase: "lobby",
      trackTitle,
      artistName,
      albumArtUrl,
      spotifyUri,
      previewAudioUrl,
      durationMs,
      playbackTimeMs: 0,
      stanzas,
      activeStanzaIndex: 0,
      audioStanzaIndex: 0,
      resolvedStanzaIndices: [],
      ...firstLineState,
      lastStanzaWinner: null,
      lastUnlockedLineText: null,
      score: 0,
      streak: 0,
      averageWpm: 0,
      history: [],
    });
  },

  startMatch: () => {
    const state = get();
    const firstLineState = createInitialLineState(state.stanzas, 0);
    set({
      phase: "playing_audio",
      playbackTimeMs: 0,
      activeStanzaIndex: 0,
      audioStanzaIndex: 0,
      resolvedStanzaIndices: [],
      ...firstLineState,
      lastStanzaWinner: null,
      lastUnlockedLineText: null,
      score: 0,
      streak: 0,
      history: [],
    });
  },

  setPlaybackTimeMs: (timeMs: number) => {
    const state = get();
    if (state.phase !== "playing_audio") {
      set({ playbackTimeMs: timeMs });
      return { shouldPauseAudio: false, triggeredStanzaIndex: null };
    }

    // Check if the audio clock has reached any line that the player has NOT unlocked yet!
    const nextUnresolvedStanza = state.stanzas.find(
      (s) =>
        s.isChallenge &&
        !state.resolvedStanzaIndices.includes(s.index) &&
        timeMs >= s.pauseTriggerMs
    );

    if (nextUnresolvedStanza) {
      get().triggerStanzaChallenge(nextUnresolvedStanza.index);
      return {
        shouldPauseAudio: true,
        triggeredStanzaIndex: nextUnresolvedStanza.index,
      };
    }

    // Check if all lines are unlocked and song reached the end
    const allChallengesDone =
      state.stanzas.length > 0 &&
      state.stanzas
        .filter((s) => s.isChallenge)
        .every((s) => state.resolvedStanzaIndices.includes(s.index));

    const lastEndMs =
      state.stanzas[state.stanzas.length - 1]?.endTimeMs ?? state.durationMs;

    if (timeMs >= state.durationMs || (allChallengesDone && timeMs > lastEndMs)) {
      set({ playbackTimeMs: timeMs, phase: "game_over" });
      return { shouldPauseAudio: true, triggeredStanzaIndex: null };
    }

    // Update which line the singer is currently singing based on audio clock
    const currentAudioIdx = state.stanzas.reduce((acc, s) => {
      if (timeMs >= s.startTimeMs) return s.index;
      return acc;
    }, 0);

    set({
      playbackTimeMs: timeMs,
      audioStanzaIndex: currentAudioIdx,
    });

    return { shouldPauseAudio: false, triggeredStanzaIndex: null };
  },

  triggerStanzaChallenge: (stanzaIndex: number) => {
    const state = get();
    const stanza = state.stanzas[stanzaIndex];
    if (!stanza) return;

    // If the player was ALREADY mid-way through typing this exact line while audio was playing,
    // preserve their typed characters so we don't wipe out their progress!
    const isAlreadyTypingThisLine =
      state.activeStanzaIndex === stanzaIndex && state.targetNormalized.length > 0;

    if (isAlreadyTypingThisLine) {
      set({
        phase: "paused_for_stanza",
        audioStanzaIndex: stanzaIndex,
        playbackTimeMs: stanza.pauseTriggerMs,
        countdownRemainingSec: stanza.countdownSeconds,
      });
      return;
    }

    const lineState = createInitialLineState(state.stanzas, stanzaIndex);
    set({
      phase: "paused_for_stanza",
      activeStanzaIndex: stanzaIndex,
      audioStanzaIndex: stanzaIndex,
      playbackTimeMs: stanza.pauseTriggerMs,
      ...lineState,
      lastStanzaWinner: null,
    });
  },

  updateUserInput: (input: string) => {
    const state = get();
    if (state.phase !== "playing_audio" && state.phase !== "paused_for_stanza") {
      return {
        justCompleted: false,
        shouldResumeAudio: false,
        completedStanzaIndex: null,
        progressPercent: state.progressPercent,
        wpm: state.currentWpm,
      };
    }

    const stanza = state.stanzas[state.activeStanzaIndex];
    if (!stanza) {
      return {
        justCompleted: false,
        shouldResumeAudio: false,
        completedStanzaIndex: null,
        progressPercent: 0,
        wpm: 0,
      };
    }

    const comparison = compareTypingProgress(stanza.combinedNormalizedText, input);
    const elapsedMinutes = Math.max(
      0.02,
      (Date.now() - (state.challengeStartedAtMs || Date.now())) / 60000
    );
    const wordsTyped = comparison.correctChars / 5;
    const wpm = Math.round(wordsTyped / elapsedMinutes);

    set({
      userInput: input,
      charStatuses: comparison.charStatuses,
      cursorIndex: comparison.cursorIndex,
      progressPercent: comparison.progressPercent,
      accuracyPercent: comparison.accuracyPercent,
      currentWpm: wpm,
    });

    if (comparison.isComplete) {
      const completedIdx = state.activeStanzaIndex;
      const { shouldResumeAudio } = get().resolveStanza("completed", "You");
      return {
        justCompleted: true,
        shouldResumeAudio,
        completedStanzaIndex: completedIdx,
        progressPercent: 100,
        wpm,
      };
    }

    return {
      justCompleted: false,
      shouldResumeAudio: false,
      completedStanzaIndex: null,
      progressPercent: comparison.progressPercent,
      wpm,
    };
  },

  revealNextWordHint: () => {
    const state = get();
    if (state.phase !== "playing_audio" && state.phase !== "paused_for_stanza") {
      return {
        justCompleted: false,
        shouldResumeAudio: false,
        completedStanzaIndex: null,
        progressPercent: state.progressPercent,
        wpm: state.currentWpm,
      };
    }

    const target = state.targetNormalized;
    let validPrefixLen = 0;
    for (let i = 0; i < state.charStatuses.length; i++) {
      if (state.charStatuses[i] === "correct") {
        validPrefixLen = i + 1;
      } else {
        break;
      }
    }

    let nextSpaceIdx = target.indexOf(" ", validPrefixLen);
    if (nextSpaceIdx === -1) {
      nextSpaceIdx = target.length;
    } else {
      nextSpaceIdx += 1;
    }

    const revealedSubstring = target.slice(0, nextSpaceIdx);
    set({ hintsUsedInCurrentLine: state.hintsUsedInCurrentLine + 1 });
    return get().updateUserInput(revealedSubstring);
  },

  giveUpCurrentLine: () => {
    const state = get();
    if (state.phase !== "playing_audio" && state.phase !== "paused_for_stanza") {
      return { shouldResumeAudio: false };
    }
    return get().resolveStanza("timeout", "Line Skipped");
  },

  tickCountdown: () => {
    const state = get();
    if (state.phase !== "paused_for_stanza") {
      return { timedOut: false, shouldResumeAudio: false };
    }

    const nextSec = state.countdownRemainingSec - 1;
    if (nextSec <= 0) {
      set({ countdownRemainingSec: 0 });
      const { shouldResumeAudio } = get().resolveStanza("timeout", "Time Expired");
      return { timedOut: true, shouldResumeAudio };
    }

    set({ countdownRemainingSec: nextSec });
    return { timedOut: false, shouldResumeAudio: false };
  },

  resolveStanza: (outcome, winnerName) => {
    const state = get();
    const stanzaIdx = state.activeStanzaIndex;
    const currentStanza = state.stanzas[stanzaIdx];
    const wasPaused = state.phase === "paused_for_stanza";

    if (state.resolvedStanzaIndices.includes(stanzaIdx)) {
      return { shouldResumeAudio: false };
    }

    const timeBonus = state.countdownRemainingSec * 15;
    const hintPenalty = state.hintsUsedInCurrentLine * 60;
    // Bonus for typing ahead while music is still playing seamlessly!
    const seamlessLeadBonus = !wasPaused && outcome === "completed" ? 100 : 0;

    const basePoints =
      outcome === "completed"
        ? Math.max(50, 250 + timeBonus + seamlessLeadBonus - hintPenalty)
        : outcome === "opponent_won"
          ? Math.round(state.progressPercent * 1.5)
          : 0;

    const newStreak = outcome === "completed" ? state.streak + 1 : 0;
    const streakMultiplier = 1 + Math.min(newStreak - 1, 4) * 0.15;
    const pointsEarned =
      outcome === "completed"
        ? Math.round(basePoints * streakMultiplier)
        : basePoints;

    const rawLineText = currentStanza
      ? currentStanza.rawDisplayLines.join(" ")
      : "";

    const newHistory: StanzaHistoryEntry[] = [
      ...state.history,
      {
        stanzaIndex: stanzaIdx,
        outcome,
        wpm: state.currentWpm,
        accuracy: state.accuracyPercent,
        pointsEarned,
        winnerName,
        rawLineText,
      },
    ];

    const avgWpm =
      newHistory.length > 0
        ? Math.round(
            newHistory.reduce((sum, h) => sum + h.wpm, 0) / newHistory.length
          )
        : 0;

    const updatedResolved = [...state.resolvedStanzaIndices, stanzaIdx];
    const nextTypingIdx = stanzaIdx + 1;
    const hasMoreLines = nextTypingIdx < state.stanzas.length;

    // If audio was paused at this line, advance playbackTimeMs slightly past pauseTriggerMs
    // so playback continues seamlessly into the line just unlocked!
    const nextPlaybackTimeMs =
      wasPaused && currentStanza
        ? Math.max(state.playbackTimeMs, currentStanza.pauseTriggerMs + 50)
        : state.playbackTimeMs;

    if (!hasMoreLines) {
      set({
        phase: "playing_audio",
        resolvedStanzaIndices: updatedResolved,
        playbackTimeMs: nextPlaybackTimeMs,
        score: state.score + pointsEarned,
        streak: newStreak,
        averageWpm: avgWpm,
        history: newHistory,
        lastStanzaWinner: winnerName || "You",
        lastUnlockedLineText: rawLineText,
        userInput: "",
        progressPercent: 100,
      });
      return { shouldResumeAudio: wasPaused };
    }

    // Immediately prepare the next line so the player can keep typing without resetting!
    const nextLineState = createInitialLineState(state.stanzas, nextTypingIdx);

    set({
      phase: "playing_audio",
      activeStanzaIndex: nextTypingIdx,
      resolvedStanzaIndices: updatedResolved,
      playbackTimeMs: nextPlaybackTimeMs,
      ...nextLineState,
      score: state.score + pointsEarned,
      streak: newStreak,
      averageWpm: avgWpm,
      history: newHistory,
      lastStanzaWinner: winnerName || "You",
      lastUnlockedLineText: rawLineText,
    });

    return { shouldResumeAudio: wasPaused };
  },

  continuePlaybackAfterResolve: () => {
    const state = get();
    if (state.phase === "paused_for_stanza") {
      set({ phase: "playing_audio" });
    }
  },

  resetGame: () => {
    const state = get();
    const firstLineState = createInitialLineState(state.stanzas, 0);
    set({
      phase: "lobby",
      playbackTimeMs: 0,
      activeStanzaIndex: 0,
      audioStanzaIndex: 0,
      resolvedStanzaIndices: [],
      ...firstLineState,
      lastStanzaWinner: null,
      lastUnlockedLineText: null,
      score: 0,
      streak: 0,
      history: [],
    });
  },
}));
