import { describe, it, expect, beforeEach } from "vitest";
import {
  normalizeLyricText,
  compareTypingProgress,
} from "../typing/normalizer";
import {
  parseLrcLyrics,
  groupLinesIntoStanzas,
} from "../lyrics/stanzaParser";
import { useTypingStore } from "../typing/useTypingStore";

describe("Lyric Normalizer & Lenient Input Matcher", () => {
  it("strips punctuation, curly quotes, apostrophes, and normalizes casing/accents", () => {
    expect(normalizeLyricText("Don't stop, believin'!")).toBe("dont stop believin");
    expect(normalizeLyricText("“Is this the real life? Is this just fantasy?”")).toBe(
      "is this the real life is this just fantasy"
    );
    expect(normalizeLyricText("Café   au   lait—now!")).toBe("cafe au laitnow");
  });

  it("strips pure metadata tags like [Chorus] or (Instrumental)", () => {
    expect(normalizeLyricText("[Chorus] Never gonna give you up")).toBe(
      "never gonna give you up"
    );
    expect(normalizeLyricText("(Instrumental)")).toBe("");
  });

  it("compares character-by-character typing progress accurately", () => {
    const target = "Never gonna give you up!";
    const partial = compareTypingProgress(target, "never gonna");

    expect(partial.targetNormalized).toBe("never gonna give you up");
    expect(partial.correctChars).toBe(11);
    expect(partial.incorrectChars).toBe(0);
    expect(partial.isComplete).toBe(false);
    expect(partial.accuracyPercent).toBe(100);

    const withTypo = compareTypingProgress(target, "never gonnx");
    expect(withTypo.correctChars).toBe(10);
    expect(withTypo.incorrectChars).toBe(1);
    expect(withTypo.charStatuses[10]).toBe("incorrect");
    expect(withTypo.isComplete).toBe(false);

    const completed = compareTypingProgress(target, "never gonna give you up");
    expect(completed.isComplete).toBe(true);
    expect(completed.progressPercent).toBe(100);
  });
});

describe("LRC Parser & Line-by-Line Pause Grouping", () => {
  const sampleLrc = `
[00:18.80] We're no strangers to love
[00:22.60] You know the rules and so do I
[00:27.00] A full commitment's what I'm thinking of
[00:31.10] You wouldn't get this from any other guy
[00:43.20] Never gonna give you up
[00:45.30] Never gonna let you down
`;

  it("parses LRC timestamps into sorted millisecond LyricLine objects", () => {
    const lines = parseLrcLyrics(sampleLrc);
    expect(lines).toHaveLength(6);
    expect(lines[0].timeMs).toBe(18800);
    expect(lines[0].normalizedText).toBe("were no strangers to love");
    expect(lines[4].timeMs).toBe(43200);
  });

  it("defaults to pausing before every individual line (maxLinesPerStanza = 1)", () => {
    const lines = parseLrcLyrics(sampleLrc);
    const stanzas = groupLinesIntoStanzas(lines, 213000);

    expect(stanzas.length).toBe(6);
    expect(stanzas[0].lines).toHaveLength(1);
    expect(stanzas[0].isChallenge).toBe(true);
    expect(stanzas[0].combinedNormalizedText).toBe("were no strangers to love");
    expect(stanzas[1].pauseTriggerMs).toBe(22600);
  });
});

describe("Zustand Continuous Multi-Line Memory Store", () => {
  beforeEach(() => {
    useTypingStore.getState().resetGame();
  });

  it("allows typing future lines ahead of the music for seamless playback without pausing", () => {
    const lines = parseLrcLyrics(`
[00:10.00] First line here
[00:14.00] Second line here
[00:18.00] Third line here
`);
    const stanzas = groupLinesIntoStanzas(lines, 60000);

    const store = useTypingStore.getState();
    store.loadTrack({
      trackTitle: "Test Track",
      artistName: "Test Artist",
      durationMs: 60000,
      stanzas,
    });

    store.startMatch();
    expect(useTypingStore.getState().phase).toBe("playing_audio");
    expect(useTypingStore.getState().activeStanzaIndex).toBe(0);

    // Player types Line 0 BEFORE the audio reaches 10,000ms!
    const aheadRes = useTypingStore.getState().updateUserInput("first line here");
    expect(aheadRes.justCompleted).toBe(true);
    expect(aheadRes.shouldResumeAudio).toBe(false); // audio was already playing!

    // Cursor immediately advances to Line 1 without resetting or pausing!
    expect(useTypingStore.getState().activeStanzaIndex).toBe(1);
    expect(useTypingStore.getState().userInput).toBe("");
    expect(useTypingStore.getState().targetNormalized).toBe("second line here");

    // When audio reaches 10,000ms (Line 0's trigger), it does NOT pause because Line 0 is already unlocked!
    const tickAtLine0 = useTypingStore.getState().setPlaybackTimeMs(10000);
    expect(tickAtLine0.shouldPauseAudio).toBe(false);
    expect(useTypingStore.getState().phase).toBe("playing_audio");

    // Player starts typing part of Line 1 ("second ") before audio reaches 14,000ms
    useTypingStore.getState().revealNextWordHint();
    expect(useTypingStore.getState().userInput).toBe("second ");

    // Now audio reaches 14,000ms (Line 1's trigger) while Line 1 is still incomplete -> Pauses!
    const tickAtLine1 = useTypingStore.getState().setPlaybackTimeMs(14000);
    expect(tickAtLine1.shouldPauseAudio).toBe(true);
    expect(useTypingStore.getState().phase).toBe("paused_for_stanza");
    // Preserves partial input typed so far on Line 1!
    expect(useTypingStore.getState().userInput).toBe("second ");

    // Finishing Line 1 immediately resumes audio and moves cursor to Line 2!
    const finishLine1 = useTypingStore.getState().updateUserInput("second line here");
    expect(finishLine1.justCompleted).toBe(true);
    expect(finishLine1.shouldResumeAudio).toBe(true);
    expect(useTypingStore.getState().phase).toBe("playing_audio");
    expect(useTypingStore.getState().activeStanzaIndex).toBe(2);
    expect(useTypingStore.getState().targetNormalized).toBe("third line here");
  });
});
