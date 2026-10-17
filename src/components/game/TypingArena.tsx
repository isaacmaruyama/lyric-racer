"use client";

import React, { useEffect, useRef } from "react";
import { useTypingStore } from "@/lib/typing/useTypingStore";
import { normalizeUserInput } from "@/lib/typing/normalizer";
import {
  Clock,
  Flame,
  Music,
  PauseCircle,
  PlayCircle,
  FastForward,
  CheckCircle2,
  Lightbulb,
  Eye,
  Zap,
  Lock,
} from "lucide-react";

interface TypingArenaProps {
  onUserTyped: (input: string) => void;
  onHintWord: () => void;
  onGiveUpLine: () => void;
  onSkipToNextChallenge: () => void;
}

export function TypingArena({
  onUserTyped,
  onHintWord,
  onGiveUpLine,
  onSkipToNextChallenge,
}: TypingArenaProps) {
  const {
    phase,
    stanzas,
    activeStanzaIndex,
    audioStanzaIndex,
    resolvedStanzaIndices,
    playbackTimeMs,
    userInput,
    targetNormalized,
    charStatuses,
    cursorIndex,
    progressPercent,
    accuracyPercent,
    countdownRemainingSec,
    score,
    streak,
  } = useTypingStore();

  const inputRef = useRef<HTMLInputElement | null>(null);

  // Keep input focused automatically as player advances from line to line
  useEffect(() => {
    if (phase === "playing_audio" || phase === "paused_for_stanza") {
      inputRef.current?.focus();
    }
  }, [phase, activeStanzaIndex]);

  const currentTypingStanza = stanzas[activeStanzaIndex];
  const allLinesCompleted = resolvedStanzaIndices.length >= stanzas.length && stanzas.length > 0;

  // How many lines the player has unlocked ahead of where the audio currently is
  const linesAheadCount = Math.max(0, activeStanzaIndex - audioStanzaIndex);

  const secondsUntilCurrentLinePause =
    currentTypingStanza && phase === "playing_audio"
      ? Math.max(0, Math.ceil((currentTypingStanza.pauseTriggerMs - playbackTimeMs) / 1000))
      : null;

  const typedNormalized = normalizeUserInput(userInput);
  const wordCount = targetNormalized ? targetNormalized.split(" ").filter(Boolean).length : 0;

  // Slice recent unlocked lines above and upcoming lines below for a continuous rolling view
  const recentUnlockedStanzas = stanzas.slice(
    Math.max(0, activeStanzaIndex - 2),
    activeStanzaIndex
  );
  const upcomingFutureStanzas = stanzas.slice(
    activeStanzaIndex + 1,
    activeStanzaIndex + 3
  );

  return (
    <div
      onClick={() => {
        inputRef.current?.focus();
      }}
      className="relative bg-zinc-900/95 border border-zinc-800 rounded-3xl p-6 md:p-8 shadow-2xl overflow-hidden cursor-text space-y-6"
    >
      {/* Hidden Input always active during gameplay so typing never stops between lines */}
      <input
        ref={inputRef}
        type="text"
        value={userInput}
        onChange={(e) => onUserTyped(e.target.value)}
        disabled={allLinesCompleted}
        aria-label="Type the hidden lyric lines continuously from memory"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        className="sr-only"
      />

      {/* Top Status & Metrics Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-zinc-800/80">
        <div className="flex flex-wrap items-center gap-3">
          {phase === "paused_for_stanza" ? (
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
              <PauseCircle className="w-4 h-4" />
              Audio Paused — Type Line #{activeStanzaIndex + 1} to Resume!
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
              <PlayCircle className="w-4 h-4" />
              Seamless Playback Active
            </span>
          )}

          {linesAheadCount > 0 && phase === "playing_audio" && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
              <Zap className="w-3.5 h-3.5 text-purple-400" />
              +{linesAheadCount} {linesAheadCount === 1 ? "Line" : "Lines"} Ahead of Music
            </span>
          )}

          <span className="text-xs text-zinc-400 font-mono">
            Unlocked {resolvedStanzaIndices.length} / {stanzas.length} Lines
          </span>
        </div>

        {/* Live Player Metrics */}
        <div className="flex items-center gap-5 font-mono text-sm">
          <div className="flex items-center gap-1.5">
            <Flame className="w-4 h-4 text-orange-400" />
            <span className="text-zinc-400">Streak:</span>
            <strong className="text-white">{streak}x</strong>
          </div>
          <div>
            <span className="text-zinc-400">Acc: </span>
            <strong className="text-zinc-200">{accuracyPercent}%</strong>
          </div>
          <div>
            <span className="text-zinc-400">Score: </span>
            <strong className="text-amber-400">{score.toLocaleString()}</strong>
          </div>
        </div>
      </div>

      {/* Continuous Rolling Line Stream */}
      <div className="space-y-4">
        {/* 1. Recently Unlocked Lines Above */}
        {recentUnlockedStanzas.length > 0 && (
          <div className="space-y-2">
            {recentUnlockedStanzas.map((stanza) => {
              const isCurrentlySinging =
                phase === "playing_audio" && stanza.index === audioStanzaIndex;
              return (
                <div
                  key={stanza.index}
                  className={`flex items-center justify-between px-4 py-2.5 rounded-2xl border transition ${
                    isCurrentlySinging
                      ? "bg-emerald-500/15 border-emerald-500/40 text-white"
                      : "bg-zinc-950/50 border-zinc-800/70 text-zinc-400"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-xs font-mono text-zinc-500">
                      #{stanza.index + 1}
                    </span>
                    <span className="text-base md:text-lg font-semibold">
                      {stanza.rawDisplayLines.join(" ")}
                    </span>
                  </div>

                  {isCurrentlySinging && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300">
                      <Music className="w-3 h-3 animate-bounce" />
                      Now Singing
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 2. Active Line Being Typed Right Now */}
        {!allLinesCompleted && currentTypingStanza ? (
          <div
            className={`p-6 rounded-2xl bg-zinc-950 border-2 shadow-inner space-y-4 transition-colors ${
              phase === "paused_for_stanza"
                ? "border-amber-500/60"
                : "border-emerald-500/50"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-md text-xs font-mono font-bold bg-zinc-800 text-zinc-200">
                  Line #{activeStanzaIndex + 1}
                </span>
                <span className="text-xs text-zinc-400">
                  {wordCount} {wordCount === 1 ? "word" : "words"} •{" "}
                  {targetNormalized.length} letters • Type from memory to advance
                  automatically!
                </span>
              </div>

              <div className="flex items-center gap-3">
                {phase === "playing_audio" &&
                  secondsUntilCurrentLinePause !== null &&
                  secondsUntilCurrentLinePause > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-zinc-400">
                        Audio reaches this line in{" "}
                        <strong className="text-emerald-400">
                          {secondsUntilCurrentLinePause}s
                        </strong>
                      </span>
                      {secondsUntilCurrentLinePause > 3 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSkipToNextChallenge();
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-emerald-400 text-xs font-semibold border border-zinc-700 transition"
                        >
                          <FastForward className="w-3 h-3" />
                          Skip Wait
                        </button>
                      )}
                    </div>
                  )}

                {phase === "paused_for_stanza" && (
                  <div
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-xl font-mono text-sm font-bold border ${
                      countdownRemainingSec <= 5
                        ? "bg-rose-500/20 text-rose-400 border-rose-500/40 animate-bounce"
                        : "bg-zinc-900 text-amber-300 border-zinc-700"
                    }`}
                  >
                    <Clock className="w-4 h-4" />
                    {countdownRemainingSec}s
                  </div>
                )}
              </div>
            </div>

            {/* Masked Blank-Fill Character Slots */}
            <div className="font-mono text-2xl md:text-3xl leading-relaxed tracking-wider select-none break-words py-2">
              {targetNormalized.split("").map((targetChar, idx) => {
                const status = charStatuses[idx];
                const isCursor = idx === cursorIndex;
                const isSpace = targetChar === " ";

                let displayChar = isSpace ? " " : "_";
                let colorClass = isSpace ? "mx-1.5" : "text-zinc-600";

                if (status === "correct") {
                  displayChar = targetChar;
                  colorClass = isSpace
                    ? "mx-1.5 bg-emerald-500/20"
                    : "text-emerald-400 bg-emerald-500/15 font-bold";
                } else if (status === "incorrect") {
                  const userWrongChar = typedNormalized[idx] || "?";
                  displayChar = userWrongChar === " " ? "_" : userWrongChar;
                  colorClass =
                    "text-rose-400 bg-rose-500/30 underline decoration-rose-400 font-bold";
                }

                return (
                  <span
                    key={idx}
                    className={`relative inline-block whitespace-pre rounded px-[2px] transition-colors ${colorClass} ${
                      isCursor ? "border-l-2 border-emerald-400 animate-pulse" : ""
                    }`}
                  >
                    {displayChar}
                  </span>
                );
              })}
            </div>

            {/* Hint & Skip Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-900">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onHintWord();
                    inputRef.current?.focus();
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-semibold transition"
                >
                  <Lightbulb className="w-3.5 h-3.5" />
                  Hint: Reveal Next Word (-60 pts)
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onGiveUpLine();
                    inputRef.current?.focus();
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 text-xs font-semibold transition"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Reveal & Advance to Next Line
                </button>
              </div>

              <span className="font-mono text-xs text-emerald-400 font-semibold">
                {progressPercent}% of Line #{activeStanzaIndex + 1}
              </span>
            </div>
          </div>
        ) : (
          <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
            <h3 className="text-xl font-bold text-white">
              All Lyric Lines Unlocked!
            </h3>
            <p className="text-xs text-zinc-300">
              Enjoy the rest of the track playback!
            </p>
          </div>
        )}

        {/* 3. Upcoming Future Masked Lines Below */}
        {upcomingFutureStanzas.length > 0 && (
          <div className="space-y-2 pt-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-1.5 px-1">
              <Lock className="w-3 h-3" />
              Up Next (Auto-advances as soon as you finish Line #{activeStanzaIndex + 1})
            </div>
            {upcomingFutureStanzas.map((stanza) => {
              const maskedPreview = stanza.combinedNormalizedText
                .split("")
                .map((c) => (c === " " ? "  " : "_"))
                .join("");
              const words = stanza.combinedNormalizedText
                .split(" ")
                .filter(Boolean).length;

              return (
                <div
                  key={stanza.index}
                  className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-zinc-950/40 border border-zinc-800/50 text-zinc-500"
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <span className="text-xs font-mono text-zinc-600 shrink-0">
                      #{stanza.index + 1}
                    </span>
                    <span className="font-mono text-sm tracking-widest truncate">
                      {maskedPreview}
                    </span>
                  </div>
                  <span className="text-xs font-mono text-zinc-600 shrink-0 ml-3">
                    {words} {words === 1 ? "word" : "words"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
