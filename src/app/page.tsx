"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Music2,
  Zap,
  Users,
  Radio,
  Keyboard,
  ArrowRight,
  Headphones,
  Sparkles,
  CheckCircle2,
} from "lucide-react";

export default function HomePage() {
  const router = useRouter();
  const [playerName, setPlayerName] = useState("LyricMaster");
  const [joinCode, setJoinCode] = useState("");
  const [spotifyConnected, setSpotifyConnected] = useState(false);

  useEffect(() => {
    if (typeof document !== "undefined") {
      const hasToken = /(?:^|;\s*)spotify_access_token=([^;]*)/.test(document.cookie);
      setSpotifyConnected(hasToken);
    }
  }, []);

  const handleCreateRoom = () => {
    const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const safeName = encodeURIComponent(playerName.trim() || "HostPlayer");
    router.push(`/room/${randomCode}?name=${safeName}&host=true`);
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = joinCode.trim().toUpperCase();
    if (!cleanCode) return;
    const safeName = encodeURIComponent(playerName.trim() || "Challenger");
    router.push(`/room/${cleanCode}?name=${safeName}&host=false`);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-between">
      {/* Header */}
      <header className="border-b border-zinc-800/80 bg-zinc-900/50 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center text-zinc-950 font-bold shadow-lg shadow-emerald-500/20">
              <Music2 className="w-5 h-5" />
            </div>
            <span className="text-xl font-extrabold tracking-tight text-white">
              Lyric<span className="text-emerald-400">Racer</span>
            </span>
          </div>

          {spotifyConnected ? (
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Spotify Connected
            </span>
          ) : (
            <a
              href="/api/auth/spotify?returnTo=/"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-[#1DB954] hover:bg-[#1ed760] text-zinc-950 transition shadow-md"
            >
              <Headphones className="w-4 h-4" />
              Connect Spotify Premium
            </a>
          )}
        </div>
      </header>

      {/* Main Hero & Lobby Section */}
      <main className="max-w-6xl w-full mx-auto px-4 py-12 md:py-16 space-y-16">
        <div className="text-center max-w-3xl mx-auto space-y-5">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <Sparkles className="w-3.5 h-3.5" />
            Spotify Web Playback SDK + LRCLIB Synced Lyrics + Supabase Realtime
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight">
            When the Music Pauses,{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-purple-400">
              Type the Stanza.
            </span>
          </h1>

          <p className="text-base sm:text-lg text-zinc-400 max-w-2xl mx-auto">
            Listen to synchronized tracks with friends. At key lyric stanzas, the audio pauses and
            a countdown begins—race head-to-head to type the entire masked stanza first and resume
            the beat!
          </p>
        </div>

        {/* Create or Join Battle Cards */}
        <div className="max-w-3xl mx-auto bg-zinc-900/90 border border-zinc-800 rounded-3xl p-6 md:p-8 shadow-2xl space-y-6">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
              Your Racer Handle
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your display name..."
              className="w-full px-4 py-3 rounded-xl bg-zinc-950 border border-zinc-800 text-white font-medium focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            {/* Host New Room */}
            <div className="p-5 rounded-2xl bg-zinc-950/80 border border-zinc-800/90 flex flex-col justify-between space-y-4">
              <div className="space-y-1.5">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Zap className="w-5 h-5 text-emerald-400" />
                  Host a Battle Room
                </h2>
                <p className="text-xs text-zinc-400">
                  Pick any song from LRCLIB or Spotify presets, invite friends or AI bots, and
                  control match start.
                </p>
              </div>

              <button
                type="button"
                onClick={handleCreateRoom}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-sm transition shadow-lg shadow-emerald-500/20"
              >
                Create Room & Pick Song
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Join Room by Code */}
            <form
              onSubmit={handleJoinRoom}
              className="p-5 rounded-2xl bg-zinc-950/80 border border-zinc-800/90 flex flex-col justify-between space-y-4"
            >
              <div className="space-y-1.5">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-purple-400" />
                  Join with Room Code
                </h2>
                <p className="text-xs text-zinc-400">
                  Have a 6-character code from a friend? Enter it below to jump straight into their
                  race lane.
                </p>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="e.g. BEAT42"
                  maxLength={8}
                  className="flex-1 px-3.5 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-white font-mono uppercase placeholder-zinc-600 focus:outline-none focus:border-purple-500"
                />
                <button
                  type="submit"
                  className="px-5 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm transition"
                >
                  Join
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Architecture Pillars */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-2">
            <Headphones className="w-6 h-6 text-emerald-400" />
            <h3 className="font-bold text-sm text-white">Spotify Web Playback SDK</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Full in-browser track streaming with programmatic millisecond pause and resume when a
              challenge stanza begins.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-2">
            <Music2 className="w-6 h-6 text-teal-400" />
            <h3 className="font-bold text-sm text-white">Open-Source LRCLIB API</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Fetches community-synced LRC timestamps and groups lines into logical multi-line
              stanza challenges.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-2">
            <Keyboard className="w-6 h-6 text-amber-400" />
            <h3 className="font-bold text-sm text-white">Lenient Monkeytype Feel</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              60+ FPS Zustand state machine ignoring casing and punctuation with live character
              coloring and WPM metrics.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-2">
            <Radio className="w-6 h-6 text-purple-400" />
            <h3 className="font-bold text-sm text-white">Supabase Realtime Sync</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Broadcast & Presence channels sync stanza pauses, countdowns, and live opponent
              progress bars across browsers.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-900 py-6 text-center text-xs text-zinc-500">
        Built with Next.js App Router, TypeScript, Tailwind CSS, Zustand, LRCLIB & Supabase
        Realtime.
      </footer>
    </div>
  );
}
