import { normalizeLyricText } from "../typing/normalizer";

export interface LyricLine {
  id: string;
  timeMs: number;
  rawText: string;
  normalizedText: string;
}

export interface LyricStanza {
  index: number;
  startTimeMs: number;
  endTimeMs: number;
  pauseTriggerMs: number;
  lines: LyricLine[];
  rawDisplayLines: string[];
  combinedNormalizedText: string;
  isChallenge: boolean;
  countdownSeconds: number;
}

export interface StanzaGroupingOptions {
  /** Silence gap threshold (ms) that naturally splits two stanzas. Default: 2500ms */
  gapThresholdMs?: number;
  /** Maximum lines per challenge before splitting. Default: 1 (pause before every line) */
  maxLinesPerStanza?: number;
  /** Minimum lines for a stanza to qualify as a challenge. Default: 1 */
  minChallengeLines?: number;
  /** Whether every eligible line is a challenge or every Nth line. Default: 1 (every line) */
  challengeFrequency?: number;
}

const LRC_LINE_REGEX = /^\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\](.*)$/;

/**
 * Parses standard LRC format strings ("[mm:ss.xx] Lyric line") into sorted LyricLine objects.
 */
export function parseLrcLyrics(lrcContent: string): LyricLine[] {
  if (!lrcContent || !lrcContent.trim()) {
    return [];
  }

  const rawLines = lrcContent.split(/\r?\n/);
  const parsed: LyricLine[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    const match = line.match(LRC_LINE_REGEX);
    if (!match) continue;

    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const fractionStr = (match[3] || "0").padEnd(3, "0").slice(0, 3);
    const milliseconds = parseInt(fractionStr, 10);

    const timeMs = minutes * 60 * 1000 + seconds * 1000 + milliseconds;
    const rawText = match[4].trim();
    const normalizedText = normalizeLyricText(rawText);

    // Skip empty or purely instrumental markers
    if (!normalizedText) continue;

    parsed.push({
      id: `line-${i}-${timeMs}`,
      timeMs,
      rawText,
      normalizedText,
    });
  }

  return parsed.sort((a, b) => a.timeMs - b.timeMs);
}

/**
 * Groups parsed LRC lines into playable line challenges (default: 1 line per pause challenge).
 */
export function groupLinesIntoStanzas(
  lines: LyricLine[],
  trackDurationMs: number = 180000,
  options: StanzaGroupingOptions = {}
): LyricStanza[] {
  const {
    gapThresholdMs = 2500,
    maxLinesPerStanza = 1,
    minChallengeLines = 1,
    challengeFrequency = 1,
  } = options;

  if (lines.length === 0) return [];

  const groupedLines: LyricLine[][] = [];
  let currentGroup: LyricLine[] = [];

  for (let i = 0; i < lines.length; i++) {
    const current = lines[i];
    const prev = currentGroup[currentGroup.length - 1];

    if (!prev) {
      currentGroup.push(current);
      continue;
    }

    const timeGap = current.timeMs - prev.timeMs;
    const shouldSplit =
      currentGroup.length >= maxLinesPerStanza || timeGap >= gapThresholdMs * 2.2;

    if (shouldSplit) {
      groupedLines.push(currentGroup);
      currentGroup = [current];
    } else {
      currentGroup.push(current);
    }
  }

  if (currentGroup.length > 0) {
    groupedLines.push(currentGroup);
  }

  let eligibleCounter = 0;

  return groupedLines.map((group, idx) => {
    const startTimeMs = group[0].timeMs;
    const nextGroupStart =
      idx + 1 < groupedLines.length
        ? groupedLines[idx + 1][0].timeMs
        : Math.max(startTimeMs + 5000, trackDurationMs);
    const endTimeMs = Math.min(nextGroupStart - 100, startTimeMs + group.length * 4500);

    const combinedNormalizedText = group.map((l) => l.normalizedText).join(" ");
    const rawDisplayLines = group.map((l) => l.rawText);

    const isEligible =
      group.length >= minChallengeLines && combinedNormalizedText.length >= 3;

    let isChallenge = false;
    if (isEligible) {
      isChallenge = eligibleCounter % challengeFrequency === 0;
      eligibleCounter++;
    } else if (groupedLines.length === 1 && combinedNormalizedText.length > 0) {
      isChallenge = true;
    }

    // Estimate fair countdown timer for memory recall: ~2.5 chars per second + 10s thinking buffer (clamped 12s - 35s)
    const estimatedSeconds = Math.ceil(combinedNormalizedText.length / 2.5) + 10;
    const countdownSeconds = Math.max(12, Math.min(35, estimatedSeconds));

    return {
      index: idx,
      startTimeMs,
      endTimeMs,
      pauseTriggerMs: startTimeMs,
      lines: group,
      rawDisplayLines,
      combinedNormalizedText,
      isChallenge,
      countdownSeconds,
    };
  });
}
