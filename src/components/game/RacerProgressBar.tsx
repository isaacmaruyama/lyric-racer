"use client";

import React from "react";
import { RoomPlayer } from "@/lib/multiplayer/roomManager";
import { Trophy, Zap, Bot, Crown } from "lucide-react";

interface RacerProgressBarProps {
  players: RoomPlayer[];
  localPlayerId: string;
}

export function RacerProgressBar({ players, localPlayerId }: RacerProgressBarProps) {
  const sortedPlayers = [...players].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.progressPercent - a.progressPercent;
  });

  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-emerald-400" />
          Live Stanza Race Lanes ({players.length} {players.length === 1 ? "Racer" : "Racers"})
        </h3>
        <span className="text-xs text-zinc-500">First to 100% wins the stanza</span>
      </div>

      <div className="space-y-3">
        {sortedPlayers.map((player) => {
          const isMe = player.id === localPlayerId;
          return (
            <div key={player.id} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full inline-block shrink-0"
                    style={{ backgroundColor: player.avatarColor || "#1DB954" }}
                  />
                  <span className={`font-medium ${isMe ? "text-emerald-400" : "text-zinc-200"}`}>
                    {player.name} {isMe && "(You)"}
                  </span>
                  {player.isHost && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-amber-500/15 text-amber-300 rounded border border-amber-500/30">
                      <Crown className="w-3 h-3" /> Host
                    </span>
                  )}
                  {player.isBot && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-purple-500/15 text-purple-300 rounded border border-purple-500/30">
                      <Bot className="w-3 h-3" /> AI Rival
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4 text-xs font-mono">
                  <span className="text-zinc-400 flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <strong className="text-zinc-200">{player.wpm}</strong> WPM
                  </span>
                  <span className="text-emerald-400 font-semibold">
                    {player.score.toLocaleString()} pts
                  </span>
                  <span className="w-10 text-right text-zinc-300 font-bold">
                    {player.progressPercent}%
                  </span>
                </div>
              </div>

              {/* Race Track Lane */}
              <div className="relative h-3 w-full bg-zinc-800/80 rounded-full overflow-hidden border border-zinc-700/50">
                <div
                  className="h-full transition-all duration-150 ease-out rounded-full"
                  style={{
                    width: `${Math.max(2, player.progressPercent)}%`,
                    background: isMe
                      ? "linear-gradient(90deg, #10b981, #34d399)"
                      : "linear-gradient(90deg, #8b5cf6, #c084fc)",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
