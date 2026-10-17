"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { DEMO_SONG_PRESETS } from "@/lib/lyrics/lrclib";
import { useTypingStore } from "@/lib/typing/useTypingStore";
import {
  MultiplayerRoomManager,
  RoomBroadcastEvent,
  RoomPlayer,
} from "@/lib/multiplayer/roomManager";
import { SpotifyPlaybackController, soundEffects } from "@/lib/spotify/sdk";
import { RacerProgressBar } from "@/components/game/RacerProgressBar";
import { TypingArena } from "@/components/game/TypingArena";
import {
  Music2,
  Users,
  Copy,
  Check,
  Play,
  Bot,
  Search,
  Radio,
  Sparkles,
  Award,
  RotateCcw,
  ArrowLeft,
  Headphones,
  Volume2,
  VolumeX,
} from "lucide-react";

const AVATAR_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4"];

export default function GameRoomPage() {
  const params = useParams<{ code: string }>();
  const searchParams = useSearchParams();
  const roomCode = (params?.code || "LYRIC1").toUpperCase();
  const playerNameParam = searchParams.get("name") || "Player";
  const isHostParam = searchParams.get("host") !== "false";

  const [localPlayerId] = useState(
    () => `p-${Math.random().toString(36).substring(2, 9)}`
  );
  const [localPlayerName] = useState(playerNameParam);
  const [isHost] = useState(isHostParam);

  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [syncMode, setSyncMode] = useState<"supabase" | "local_broadcast">("local_broadcast");
  const [copiedCode, setCopiedCode] = useState(false);

  // Song selection state
  const [selectedPresetId, setSelectedPresetId] = useState(DEMO_SONG_PRESETS[0].id);
  const [customTrackQuery, setCustomTrackQuery] = useState("");
  const [customArtistQuery, setCustomArtistQuery] = useState("");
  const [isLoadingLyrics, setIsLoadingLyrics] = useState(false);
  const [lyricsSourceBadge, setLyricsSourceBadge] = useState<"lrclib" | "demo">("demo");

  // Audio playback state (Spotify SDK + HTML5 Audio stream fallback)
  const [spotifyToken, setSpotifyToken] = useState<string | null>(null);
  const [spotifyDeviceReady, setSpotifyDeviceReady] = useState(false);
  const [activeAudioEngine, setActiveAudioEngine] = useState<"spotify" | "html5_preview" | "idle">("idle");
  const [spotifyStatusMsg, setSpotifyStatusMsg] = useState<string>("Ready to Play Audio");
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.85);

  const roomManagerRef = useRef<MultiplayerRoomManager | null>(null);
  const spotifyControllerRef = useRef<SpotifyPlaybackController | null>(null);
  const html5AudioRef = useRef<HTMLAudioElement | null>(null);

  const {
    phase,
    trackTitle,
    artistName,
    spotifyUri,
    previewAudioUrl,
    durationMs,
    playbackTimeMs,
    stanzas,
    activeStanzaIndex,
    score,
    averageWpm,
    history,
    loadTrack,
    startMatch,
    setPlaybackTimeMs,
    triggerStanzaChallenge,
    updateUserInput,
    revealNextWordHint,
    giveUpCurrentLine,
    tickCountdown,
    resolveStanza,
    continuePlaybackAfterResolve,
    resetGame,
  } = useTypingStore();

  // Pause both Spotify and HTML5 audio
  const pauseAllAudio = useCallback(() => {
    spotifyControllerRef.current?.pause();
    if (html5AudioRef.current && !html5AudioRef.current.paused) {
      html5AudioRef.current.pause();
    }
  }, []);

  // Resume active audio engine
  const resumeActiveAudio = useCallback(async () => {
    if (activeAudioEngine === "spotify") {
      await spotifyControllerRef.current?.resume();
    } else if (html5AudioRef.current && previewAudioUrl) {
      html5AudioRef.current.play().catch((err) => {
        console.warn("HTML5 audio resume blocked:", err);
      });
    }
  }, [activeAudioEngine, previewAudioUrl]);

  // Load lyrics + preview audio stream from /api/lyrics
  const fetchAndLoadTrack = useCallback(
    async (opts: {
      trackName: string;
      artistName: string;
      albumArtUrl?: string;
      spotifyUri?: string;
      durationSeconds?: number;
      broadcastToPeers?: boolean;
    }) => {
      setIsLoadingLyrics(true);
      pauseAllAudio();
      try {
        const q = new URLSearchParams({
          track: opts.trackName,
          artist: opts.artistName,
          duration: String(opts.durationSeconds || 200),
        });
        const res = await fetch(`/api/lyrics?${q.toString()}`);
        const data = await res.json();

        if (data && data.stanzas) {
          setLyricsSourceBadge(data.source || "lrclib");
          loadTrack({
            trackTitle: data.trackName || opts.trackName,
            artistName: data.artistName || opts.artistName,
            albumArtUrl: data.albumArtUrl || opts.albumArtUrl || "",
            spotifyUri: data.spotifyUri || opts.spotifyUri || "",
            previewAudioUrl: data.previewAudioUrl || "",
            durationMs: (data.durationSeconds || opts.durationSeconds || 200) * 1000,
            stanzas: data.stanzas,
          });

          if (opts.broadcastToPeers && roomManagerRef.current) {
            roomManagerRef.current.broadcast({
              type: "TRACK_SELECTED",
              senderId: localPlayerId,
              payload: {
                trackName: data.trackName || opts.trackName,
                artistName: data.artistName || opts.artistName,
                albumArtUrl: data.albumArtUrl || opts.albumArtUrl || "",
                spotifyUri: data.spotifyUri || opts.spotifyUri || "",
                durationSeconds: data.durationSeconds || opts.durationSeconds || 200,
              },
            });
          }
        }
      } catch (err) {
        console.error("Failed to load lyrics:", err);
      } finally {
        setIsLoadingLyrics(false);
      }
    },
    [loadTrack, localPlayerId, pauseAllAudio]
  );

  // Initialize default preset on mount
  useEffect(() => {
    const preset = DEMO_SONG_PRESETS[0];
    fetchAndLoadTrack({
      trackName: preset.trackName,
      artistName: preset.artistName,
      albumArtUrl: preset.albumArtUrl,
      spotifyUri: preset.spotifyUri,
      durationSeconds: preset.durationSeconds,
      broadcastToPeers: false,
    });
  }, [fetchAndLoadTrack]);

  // Check for Spotify access token cookie
  useEffect(() => {
    if (typeof document === "undefined") return;
    const match = document.cookie.match(/(?:^|;\s*)spotify_access_token=([^;]*)/);
    if (match && match[1]) {
      const token = decodeURIComponent(match[1]);
      setSpotifyToken(token);
      setSpotifyStatusMsg("Connecting Spotify Web Player...");
      const controller = new SpotifyPlaybackController();
      spotifyControllerRef.current = controller;

      controller.initialize(
        token,
        () => {
          setSpotifyDeviceReady(true);
          setSpotifyStatusMsg("Spotify Premium Web Player Ready");
        },
        (positionMs, paused) => {
          if (!paused && useTypingStore.getState().phase === "playing_audio") {
            const { shouldPauseAudio, triggeredStanzaIndex } = setPlaybackTimeMs(positionMs);
            if (shouldPauseAudio) {
              pauseAllAudio();
              soundEffects.playPauseChallengeAlert();
              roomManagerRef.current?.resetAllProgressForNewStanza();
              if (triggeredStanzaIndex !== null && isHost) {
                roomManagerRef.current?.broadcast({
                  type: "PAUSE_RACE",
                  senderId: localPlayerId,
                  payload: { stanzaIndex: triggeredStanzaIndex },
                });
              }
            }
          }
        },
        (errMsg) => {
          setSpotifyStatusMsg(`${errMsg} — Using Audio Preview Stream`);
        }
      );
    }

    return () => {
      spotifyControllerRef.current?.disconnect();
    };
  }, [setPlaybackTimeMs, pauseAllAudio, isHost, localPlayerId]);

  // Initialize Multiplayer Room Manager
  useEffect(() => {
    const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    const manager = new MultiplayerRoomManager({
      roomCode,
      localPlayer: {
        id: localPlayerId,
        name: localPlayerName,
        isHost,
        progressPercent: 0,
        wpm: 0,
        score: 0,
        avatarColor: color,
      },
      onPlayersChange: (updatedPlayers) => {
        setPlayers(updatedPlayers);
      },
      onEvent: (event: RoomBroadcastEvent) => {
        if (event.type === "TRACK_SELECTED") {
          fetchAndLoadTrack({
            ...event.payload,
            broadcastToPeers: false,
          });
        } else if (event.type === "START_MATCH") {
          roomManagerRef.current?.resetAllProgressForNewStanza();
          startMatch();
          if (html5AudioRef.current && useTypingStore.getState().previewAudioUrl) {
            html5AudioRef.current.currentTime = 0;
            html5AudioRef.current.play().catch(() => {});
            setActiveAudioEngine("html5_preview");
          }
        } else if (event.type === "PAUSE_RACE") {
          roomManagerRef.current?.resetAllProgressForNewStanza();
          pauseAllAudio();
          soundEffects.playPauseChallengeAlert();
          triggerStanzaChallenge(event.payload.stanzaIndex);
        } else if (event.type === "STANZA_RESOLVED") {
          resolveStanza("opponent_won", event.payload.winnerName);
        }
      },
    });

    const { mode } = manager.connect();
    setSyncMode(mode);
    roomManagerRef.current = manager;

    return () => {
      manager.disconnect();
    };
  }, [
    roomCode,
    localPlayerId,
    localPlayerName,
    isHost,
    fetchAndLoadTrack,
    startMatch,
    pauseAllAudio,
    triggerStanzaChallenge,
    resolveStanza,
  ]);

  // Playback Clock Loop (runs during 'playing_audio')
  useEffect(() => {
    if (phase !== "playing_audio") return;

    const interval = setInterval(async () => {
      let nextMs = useTypingStore.getState().playbackTimeMs + 200;

      // Sync tightly with real Spotify SDK position if Spotify is active
      if (activeAudioEngine === "spotify" && spotifyControllerRef.current) {
        const spPos = await spotifyControllerRef.current.getPositionMs();
        if (typeof spPos === "number" && spPos > 0) {
          nextMs = spPos;
        }
      }

      const { shouldPauseAudio, triggeredStanzaIndex } = setPlaybackTimeMs(nextMs);

      if (shouldPauseAudio) {
        pauseAllAudio();
        soundEffects.playPauseChallengeAlert();
        roomManagerRef.current?.resetAllProgressForNewStanza();

        if (triggeredStanzaIndex !== null && isHost) {
          roomManagerRef.current?.broadcast({
            type: "PAUSE_RACE",
            senderId: localPlayerId,
            payload: { stanzaIndex: triggeredStanzaIndex },
          });
        }
      }
    }, 200);

    return () => clearInterval(interval);
  }, [phase, activeAudioEngine, setPlaybackTimeMs, pauseAllAudio, isHost, localPlayerId]);

  // Countdown Timer Loop + Simulated AI Bot Typing (runs during 'paused_for_stanza')
  useEffect(() => {
    if (phase !== "paused_for_stanza") return;

    const timer = setInterval(() => {
      const currentRem = useTypingStore.getState().countdownRemainingSec;
      if (currentRem <= 4 && currentRem > 1 && !isMuted) {
        soundEffects.playCountdownTick();
      }

      const { timedOut, shouldResumeAudio } = tickCountdown();
      if (timedOut) {
        if (shouldResumeAudio) {
          resumeActiveAudio();
        }
        return;
      }

      // Advance any AI Bot players in the room
      const bots = players.filter((p) => p.isBot);
      bots.forEach((bot) => {
        const nextProgress = Math.min(96, bot.progressPercent + Math.floor(Math.random() * 9) + 5);
        roomManagerRef.current?.updateBotProgress(
          bot.id,
          nextProgress,
          52 + Math.floor(Math.random() * 14),
          bot.score
        );
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [phase, isMuted, tickCountdown, resumeActiveAudio, players]);

  // Start Match Handler (unlocks and starts Spotify or HTML5 Audio fallback!)
  const handleStartMatch = async () => {
    roomManagerRef.current?.resetAllProgressForNewStanza();

    let startedSpotify = false;
    if (spotifyDeviceReady && spotifyUri && spotifyControllerRef.current) {
      setSpotifyStatusMsg("Starting Spotify Playback...");
      const res = await spotifyControllerRef.current.playTrack(spotifyUri, 0);
      if (res.ok) {
        startedSpotify = true;
        setActiveAudioEngine("spotify");
        setSpotifyStatusMsg("Streaming via Spotify Premium SDK");
      } else {
        setSpotifyStatusMsg(`Spotify API (${res.error}) — Playing Preview Stream`);
      }
    }

    // If Spotify didn't start, play the HTML5 audio stream so user always hears music
    if (!startedSpotify && html5AudioRef.current && previewAudioUrl) {
      try {
        html5AudioRef.current.volume = isMuted ? 0 : volume;
        html5AudioRef.current.currentTime = 0;
        await html5AudioRef.current.play();
        setActiveAudioEngine("html5_preview");
        if (!spotifyToken) {
          setSpotifyStatusMsg("Playing Track Audio Stream");
        }
      } catch (err) {
        console.warn("Audio playback failed:", err);
      }
    }

    startMatch();

    roomManagerRef.current?.broadcast({
      type: "START_MATCH",
      senderId: localPlayerId,
      payload: { startedAt: Date.now() },
    });
  };

  const handleUserTyped = (input: string) => {
    const {
      justCompleted,
      shouldResumeAudio,
      completedStanzaIndex,
      progressPercent,
      wpm,
    } = updateUserInput(input);
    const updatedScore = useTypingStore.getState().score;

    roomManagerRef.current?.updateLocalProgress(progressPercent, wpm, updatedScore);

    if (justCompleted) {
      if (!isMuted) {
        soundEffects.playStanzaSuccessChime();
      }
      if (shouldResumeAudio) {
        resumeActiveAudio();
      }
      roomManagerRef.current?.broadcast({
        type: "STANZA_RESOLVED",
        senderId: localPlayerId,
        payload: {
          stanzaIndex: completedStanzaIndex ?? activeStanzaIndex,
          winnerId: localPlayerId,
          winnerName: localPlayerName,
          wpm,
        },
      });
    }
  };

  const handleSkipToNextChallenge = () => {
    const nextChallenge = stanzas.find(
      (s) =>
        s.isChallenge &&
        !useTypingStore.getState().resolvedStanzaIndices.includes(s.index) &&
        s.pauseTriggerMs > playbackTimeMs
    );
    if (nextChallenge) {
      if (activeAudioEngine === "spotify") {
        spotifyControllerRef.current?.seek(nextChallenge.pauseTriggerMs);
      }
      const { shouldPauseAudio, triggeredStanzaIndex } = setPlaybackTimeMs(
        nextChallenge.pauseTriggerMs
      );
      if (shouldPauseAudio) {
        pauseAllAudio();
        if (!isMuted) {
          soundEffects.playPauseChallengeAlert();
        }
        roomManagerRef.current?.resetAllProgressForNewStanza();
        if (triggeredStanzaIndex !== null && isHost) {
          roomManagerRef.current?.broadcast({
            type: "PAUSE_RACE",
            senderId: localPlayerId,
            payload: { stanzaIndex: triggeredStanzaIndex },
          });
        }
      }
    }
  };

  const handleToggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    const targetVol = nextMute ? 0 : volume;
    spotifyControllerRef.current?.setVolume(targetVol);
    if (html5AudioRef.current) {
      html5AudioRef.current.volume = targetVol;
    }
  };

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    setIsMuted(newVol === 0);
    spotifyControllerRef.current?.setVolume(newVol);
    if (html5AudioRef.current) {
      html5AudioRef.current.volume = newVol;
    }
  };

  const handleCopyInvite = () => {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/room/${roomCode}?name=Rival&host=false`;
    navigator.clipboard.writeText(url);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const formatTime = (ms: number) => {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, "0")}`;
  };

  const currentRoomReturnPath = `/room/${roomCode}?name=${encodeURIComponent(localPlayerName)}&host=${isHost}`;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Hidden HTML5 Audio Element for instant audio preview playback */}
      {previewAudioUrl && (
        <audio
          ref={html5AudioRef}
          src={previewAudioUrl}
          loop
          preload="auto"
          className="hidden"
        />
      )}

      {/* Top Navigation Bar */}
      <header className="border-b border-zinc-800/80 bg-zinc-900/60 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              onClick={pauseAllAudio}
              className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition"
            >
              <ArrowLeft className="w-4 h-4" />
              Lobby
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center text-zinc-950 font-bold">
                <Music2 className="w-5 h-5" />
              </div>
              <div>
                <span className="font-bold tracking-tight text-white">LyricRacer</span>
                <span className="ml-2 px-2 py-0.5 text-[10px] font-mono uppercase rounded bg-zinc-800 text-emerald-400 border border-zinc-700">
                  Room {roomCode}
                </span>
              </div>
            </div>
          </div>

          {/* Room Sync, Volume & Spotify Controls */}
          <div className="flex items-center gap-3">
            {/* Volume Controls */}
            <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-2.5 py-1.5 rounded-xl">
              <button
                type="button"
                onClick={handleToggleMute}
                title={isMuted ? "Unmute Audio" : "Mute Audio"}
                className="text-zinc-400 hover:text-white transition"
              >
                {isMuted ? (
                  <VolumeX className="w-4 h-4 text-rose-400" />
                ) : (
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={(e) => handleVolumeChange( parseFloat(e.target.value) )}
                aria-label="Audio Volume"
                className="w-16 accent-emerald-500 cursor-pointer h-1.5 bg-zinc-700 rounded-lg"
              />
            </div>

            <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs bg-zinc-800/90 text-zinc-300 border border-zinc-700">
              <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              {syncMode === "supabase" ? "Supabase Realtime" : "Multi-Tab Live Sync"}
            </span>

            <button
              type="button"
              onClick={handleCopyInvite}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 transition"
            >
              {copiedCode ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  Invite URL Copied!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-zinc-400" />
                  Copy Opponent Link
                </>
              )}
            </button>

            {!spotifyToken ? (
              <a
                href={`/api/auth/spotify?returnTo=${encodeURIComponent(currentRoomReturnPath)}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#1DB954] hover:bg-[#1ed760] text-zinc-950 transition"
              >
                <Headphones className="w-3.5 h-3.5" />
                Connect Spotify Premium
              </a>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                <Headphones className="w-3.5 h-3.5" />
                {spotifyDeviceReady ? "Spotify SDK Ready" : "Spotify Connected"}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 space-y-6">
        {/* Track Header & Progress Bar */}
        <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-zinc-950 font-bold shrink-0 shadow-md">
              <Music2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-white">
                  {trackTitle || "Select a Song"}
                </h1>
                <span className="px-2 py-0.5 text-[10px] font-mono uppercase rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  {lyricsSourceBadge === "lrclib" ? "LRCLIB Synced" : "Curated LRC"}
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                {artistName} • {stanzas.filter((s) => s.isChallenge).length} Stanza Races
              </p>
            </div>
          </div>

          {/* Song Timeline */}
          <div className="w-full md:w-80 space-y-1.5">
            <div className="flex justify-between text-xs font-mono text-zinc-400">
              <span>{formatTime(playbackTimeMs)}</span>
              <span className="text-emerald-400/90 truncate max-w-[195px]">
                {spotifyStatusMsg}
              </span>
              <span>{formatTime(durationMs)}</span>
            </div>
            <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-200"
                style={{
                  width: `${Math.min(100, Math.round((playbackTimeMs / Math.max(1, durationMs)) * 100))}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Live Multiplayer Race Lanes */}
        <RacerProgressBar players={players} localPlayerId={localPlayerId} />

        {/* LOBBY PHASE: Track Selection & Match Start */}
        {phase === "lobby" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Columns: Preset Songs & Live LRCLIB Search */}
            <div className="lg:col-span-2 bg-zinc-900/90 border border-zinc-800 rounded-3xl p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-emerald-400" />
                    Choose Track & Synchronized Lyrics
                  </h2>
                  <p className="text-xs text-zinc-400">
                    Pick a featured track or query any song live from LRCLIB (lrclib.net)
                  </p>
                </div>
              </div>

              {/* Preset Track Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {DEMO_SONG_PRESETS.map((preset) => {
                  const isSelected =
                    selectedPresetId === preset.id && trackTitle === preset.trackName;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setSelectedPresetId(preset.id);
                        fetchAndLoadTrack({
                          trackName: preset.trackName,
                          artistName: preset.artistName,
                          albumArtUrl: preset.albumArtUrl,
                          spotifyUri: preset.spotifyUri,
                          durationSeconds: preset.durationSeconds,
                          broadcastToPeers: true,
                        });
                      }}
                      className={`text-left p-3.5 rounded-2xl border transition flex flex-col justify-between gap-2 ${
                        isSelected
                          ? "bg-emerald-500/15 border-emerald-500 text-white shadow-lg shadow-emerald-500/10"
                          : "bg-zinc-950/70 border-zinc-800 hover:border-zinc-700 text-zinc-300"
                      }`}
                    >
                      <div>
                        <div className="font-bold text-sm truncate">{preset.trackName}</div>
                        <div className="text-xs text-zinc-400 truncate">{preset.artistName}</div>
                      </div>
                      <div className="text-[11px] font-mono text-emerald-400">
                        {Math.floor(preset.durationSeconds / 60)}:
                        {(preset.durationSeconds % 60).toString().padStart(2, "0")} • Audio Ready
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Custom LRCLIB Song Search */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!customTrackQuery.trim() || !customArtistQuery.trim()) return;
                  fetchAndLoadTrack({
                    trackName: customTrackQuery.trim(),
                    artistName: customArtistQuery.trim(),
                    durationSeconds: 210,
                    broadcastToPeers: true,
                  });
                }}
                className="pt-4 border-t border-zinc-800/80 space-y-3"
              >
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Search Any Song via Open-Source LRCLIB API
                </label>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    type="text"
                    placeholder="Track title (e.g. Anti-Hero)"
                    value={customTrackQuery}
                    onChange={(e) => setCustomTrackQuery(e.target.value)}
                    className="flex-1 px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                  />
                  <input
                    type="text"
                    placeholder="Artist (e.g. Taylor Swift)"
                    value={customArtistQuery}
                    onChange={(e) => setCustomArtistQuery(e.target.value)}
                    className="flex-1 px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="submit"
                    disabled={isLoadingLyrics}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm font-semibold text-white transition disabled:opacity-50"
                  >
                    <Search className="w-4 h-4" />
                    {isLoadingLyrics ? "Fetching..." : "Fetch LRC"}
                  </button>
                </div>
              </form>
            </div>

            {/* Right Column: Match Controls & Bot Spawner */}
            <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-6 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-emerald-400" />
                  Battle Lobby
                </h2>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Share the room link or open another browser tab to race live. When the song hits a
                  masked stanza, playback pauses and everyone races to type the full stanza!
                </p>

                <div className="p-3.5 rounded-2xl bg-zinc-950/80 border border-zinc-800 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Total Stanzas:</span>
                    <strong className="text-zinc-200">{stanzas.length}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Challenge Pauses:</span>
                    <strong className="text-emerald-400">
                      {stanzas.filter((s) => s.isChallenge).length} Stanzas
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Audio Source:</span>
                    <strong className="text-emerald-400">
                      {spotifyDeviceReady
                        ? "Spotify Web Playback SDK"
                        : previewAudioUrl
                          ? "High-Quality Track Stream"
                          : "Loading Audio..."}
                    </strong>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => roomManagerRef.current?.addSimulatedBot()}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 text-xs font-semibold transition"
                >
                  <Bot className="w-4 h-4" />
                  + Add AI Bot Rival to Room
                </button>
              </div>

              <button
                type="button"
                onClick={handleStartMatch}
                disabled={stanzas.length === 0 || isLoadingLyrics}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-base shadow-lg shadow-emerald-500/25 transition disabled:opacity-50"
              >
                <Play className="w-5 h-5 fill-current" />
                Start Multiplayer Battle
              </button>
            </div>
          </div>
        )}

        {/* ACTIVE GAMEPLAY PHASE */}
        {(phase === "playing_audio" ||
          phase === "paused_for_stanza" ||
          phase === "stanza_resolved") && (
          <TypingArena
            onUserTyped={handleUserTyped}
            onHintWord={() => {
              const {
                justCompleted,
                shouldResumeAudio,
                completedStanzaIndex,
                progressPercent,
                wpm,
              } = revealNextWordHint();
              const updatedScore = useTypingStore.getState().score;
              roomManagerRef.current?.updateLocalProgress(progressPercent, wpm, updatedScore);
              if (justCompleted) {
                if (!isMuted) {
                  soundEffects.playStanzaSuccessChime();
                }
                if (shouldResumeAudio) {
                  resumeActiveAudio();
                }
                roomManagerRef.current?.broadcast({
                  type: "STANZA_RESOLVED",
                  senderId: localPlayerId,
                  payload: {
                    stanzaIndex: completedStanzaIndex ?? activeStanzaIndex,
                    winnerId: localPlayerId,
                    winnerName: localPlayerName,
                    wpm,
                  },
                });
              }
            }}
            onGiveUpLine={() => {
              const { shouldResumeAudio } = giveUpCurrentLine();
              if (shouldResumeAudio) {
                resumeActiveAudio();
              }
            }}
            onSkipToNextChallenge={handleSkipToNextChallenge}
          />
        )}

        {/* GAME OVER PODIUM PHASE */}
        {phase === "game_over" && (
          <div className="bg-zinc-900/95 border border-zinc-800 rounded-3xl p-8 text-center space-y-6 shadow-2xl">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400">
              <Award className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h2 className="text-3xl font-extrabold text-white">Song Complete!</h2>
              <p className="text-sm text-zinc-400">
                {trackTitle} — {artistName}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-xl mx-auto">
              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800">
                <div className="text-xs text-zinc-400">Final Score</div>
                <div className="text-2xl font-bold text-amber-400 font-mono">
                  {score.toLocaleString()}
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800">
                <div className="text-xs text-zinc-400">Average Speed</div>
                <div className="text-2xl font-bold text-emerald-400 font-mono">
                  {averageWpm} WPM
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800">
                <div className="text-xs text-zinc-400">Stanzas Completed</div>
                <div className="text-2xl font-bold text-white font-mono">
                  {history.filter((h) => h.outcome === "completed").length} / {history.length}
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  pauseAllAudio();
                  resetGame();
                }}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-sm transition"
              >
                <RotateCcw className="w-4 h-4" />
                Back to Room Lobby
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
