/**
 * Normalizes a lyric string for lenient, case-insensitive, and punctuation-insensitive typing.
 * Example: "Don't stop, believin'!" -> "dont stop believin"
 */
export function normalizeLyricText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Strip diacritics/accents
    .toLowerCase()
    .replace(/\[.*?\]|\(.*?\)/g, (match) => {
      // Remove pure metadata tags like [Chorus], [Verse 1], (Instrumental), (Music)
      if (/^(?:\[.*\]|\((?:instrumental|music|intro|outro|guitar solo)\))$/i.test(match.trim())) {
        return "";
      }
      return match;
    })
    .replace(/[.,!?;:'"’‘“”`()\[\]{}\-—–_…/\\|@#$%^&*+=<>~]/g, "") // Remove punctuation
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalizes an array of stanza lines and joins them or returns normalized non-empty lines.
 */
export function normalizeStanzaLines(lines: string[]): string[] {
  return lines
    .map((line) => normalizeLyricText(line))
    .filter((line) => line.length > 0);
}

export type CharStatus = "correct" | "incorrect" | "pending";

export interface TypingComparisonResult {
  targetNormalized: string;
  typedNormalized: string;
  charStatuses: CharStatus[];
  correctChars: number;
  incorrectChars: number;
  cursorIndex: number;
  progressPercent: number;
  accuracyPercent: number;
  isComplete: boolean;
}

/**
 * Normalizes user raw input while preserving a single trailing space if the user just typed a space
 * to advance to the next word.
 */
export function normalizeUserInput(rawInput: string): string {
  const hasTrailingSpace = /\s$/.test(rawInput) && rawInput.trim().length > 0;
  const normalized = normalizeLyricText(rawInput);
  if (!normalized) return "";
  return hasTrailingSpace ? `${normalized} ` : normalized;
}

/**
 * Compares user input against the target normalized stanza text character-by-character.
 */
export function compareTypingProgress(
  targetRawOrNormalized: string,
  userRawInput: string
): TypingComparisonResult {
  const targetNormalized = normalizeLyricText(targetRawOrNormalized);
  const typedNormalized = normalizeUserInput(userRawInput).slice(0, targetNormalized.length);

  const charStatuses: CharStatus[] = [];
  let correctChars = 0;
  let incorrectChars = 0;

  for (let i = 0; i < targetNormalized.length; i++) {
    if (i < typedNormalized.length) {
      if (typedNormalized[i] === targetNormalized[i]) {
        charStatuses.push("correct");
        correctChars++;
      } else {
        charStatuses.push("incorrect");
        incorrectChars++;
      }
    } else {
      charStatuses.push("pending");
    }
  }

  const totalTargetLength = targetNormalized.length;
  const totalTypedLength = typedNormalized.length;

  const progressPercent =
    totalTargetLength === 0
      ? 100
      : Math.min(100, Math.round((correctChars / totalTargetLength) * 100));

  const accuracyPercent =
    totalTypedLength === 0
      ? 100
      : Math.round((correctChars / totalTypedLength) * 100);

  const isComplete =
    totalTargetLength > 0 &&
    typedNormalized === targetNormalized &&
    incorrectChars === 0;

  return {
    targetNormalized,
    typedNormalized,
    charStatuses,
    correctChars,
    incorrectChars,
    cursorIndex: Math.min(typedNormalized.length, totalTargetLength),
    progressPercent,
    accuracyPercent,
    isComplete,
  };
}
