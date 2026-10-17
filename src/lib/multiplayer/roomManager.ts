import { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "../supabase/client";

export interface RoomPlayer {
  id: string;
  name: string;
  isHost: boolean;
  isBot?: boolean;
  progressPercent: number;
  wpm: number;
  score: number;
  avatarColor: string;
}

export type RoomBroadcastEvent =
  | {
      type: "TRACK_SELECTED";
      senderId: string;
      payload: {
        trackName: string;
        artistName: string;
        albumArtUrl: string;
        spotifyUri: string;
        durationSeconds: number;
      };
    }
  | {
      type: "START_MATCH";
      senderId: string;
      payload: { startedAt: number };
    }
  | {
      type: "PAUSE_RACE";
      senderId: string;
      payload: { stanzaIndex: number };
    }
  | {
      type: "PROGRESS_UPDATE";
      senderId: string;
      payload: {
        playerId: string;
        playerName: string;
        progressPercent: number;
        wpm: number;
        score: number;
      };
    }
  | {
      type: "STANZA_RESOLVED";
      senderId: string;
      payload: {
        stanzaIndex: number;
        winnerId: string;
        winnerName: string;
        wpm: number;
      };
    }
  | {
      type: "PLAYER_JOINED";
      senderId: string;
      payload: { player: RoomPlayer };
    };

export class MultiplayerRoomManager {
  private roomCode: string;
  private localPlayer: RoomPlayer;
  private supabaseChannel: RealtimeChannel | null = null;
  private localBroadcast: BroadcastChannel | null = null;
  private onEventCallback: (event: RoomBroadcastEvent) => void;
  private onPlayersChangeCallback: (players: RoomPlayer[]) => void;
  private playersMap: Map<string, RoomPlayer> = new Map();

  constructor(params: {
    roomCode: string;
    localPlayer: RoomPlayer;
    onEvent: (event: RoomBroadcastEvent) => void;
    onPlayersChange: (players: RoomPlayer[]) => void;
  }) {
    this.roomCode = params.roomCode.toUpperCase();
    this.localPlayer = params.localPlayer;
    this.onEventCallback = params.onEvent;
    this.onPlayersChangeCallback = params.onPlayersChange;
    this.playersMap.set(this.localPlayer.id, this.localPlayer);
  }

  public connect(): { mode: "supabase" | "local_broadcast" } {
    const supabase = getSupabaseClient();

    // Always enable cross-tab BroadcastChannel for instant zero-config local multi-tab testing
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      this.localBroadcast = new BroadcastChannel(`lyric_racer_room_${this.roomCode}`);
      this.localBroadcast.onmessage = (msgEvent) => {
        const event = msgEvent.data as RoomBroadcastEvent;
        if (!event || event.senderId === this.localPlayer.id) return;
        this.handleIncomingEvent(event);
      };
    }

    if (supabase) {
      this.supabaseChannel = supabase.channel(`room:${this.roomCode}`, {
        config: {
          presence: { key: this.localPlayer.id },
          broadcast: { self: false },
        },
      });

      this.supabaseChannel
        .on("presence", { event: "sync" }, () => {
          if (!this.supabaseChannel) return;
          const presenceState = this.supabaseChannel.presenceState<RoomPlayer>();
          Object.values(presenceState).forEach((presences) => {
            presences.forEach((p) => {
              const existing = this.playersMap.get(p.id);
              this.playersMap.set(p.id, {
                ...p,
                progressPercent: existing?.progressPercent ?? p.progressPercent ?? 0,
                wpm: existing?.wpm ?? p.wpm ?? 0,
                score: existing?.score ?? p.score ?? 0,
              });
            });
          });
          this.emitPlayersList();
        })
        .on("broadcast", { event: "game_event" }, ({ payload }) => {
          const event = payload as RoomBroadcastEvent;
          if (event.senderId === this.localPlayer.id) return;
          this.handleIncomingEvent(event);
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED" && this.supabaseChannel) {
            await this.supabaseChannel.track(this.localPlayer);
          }
        });

      this.broadcast({
        type: "PLAYER_JOINED",
        senderId: this.localPlayer.id,
        payload: { player: this.localPlayer },
      });
      this.emitPlayersList();
      return { mode: "supabase" };
    }

    // Announce presence on local BroadcastChannel
    this.broadcast({
      type: "PLAYER_JOINED",
      senderId: this.localPlayer.id,
      payload: { player: this.localPlayer },
    });
    this.emitPlayersList();
    return { mode: "local_broadcast" };
  }

  private handleIncomingEvent(event: RoomBroadcastEvent) {
    if (event.type === "PLAYER_JOINED") {
      const isNew = !this.playersMap.has(event.payload.player.id);
      this.playersMap.set(event.payload.player.id, event.payload.player);
      this.emitPlayersList();
      // Echo back our presence so the newly joined peer discovers us too
      if (isNew) {
        this.broadcast({
          type: "PLAYER_JOINED",
          senderId: this.localPlayer.id,
          payload: { player: this.localPlayer },
        });
      }
      return;
    }

    if (event.type === "PROGRESS_UPDATE") {
      const target = this.playersMap.get(event.payload.playerId);
      if (target) {
        this.playersMap.set(event.payload.playerId, {
          ...target,
          progressPercent: event.payload.progressPercent,
          wpm: event.payload.wpm,
          score: event.payload.score,
        });
        this.emitPlayersList();
      }
    }

    this.onEventCallback(event);
  }

  public broadcast(event: RoomBroadcastEvent): void {
    if (this.supabaseChannel) {
      this.supabaseChannel.send({
        type: "broadcast",
        event: "game_event",
        payload: event,
      });
    }
    if (this.localBroadcast) {
      this.localBroadcast.postMessage(event);
    }
  }

  public updateLocalProgress(progressPercent: number, wpm: number, score: number): void {
    this.localPlayer = {
      ...this.localPlayer,
      progressPercent,
      wpm,
      score,
    };
    this.playersMap.set(this.localPlayer.id, this.localPlayer);
    this.emitPlayersList();

    this.broadcast({
      type: "PROGRESS_UPDATE",
      senderId: this.localPlayer.id,
      payload: {
        playerId: this.localPlayer.id,
        playerName: this.localPlayer.name,
        progressPercent,
        wpm,
        score,
      },
    });
  }

  public resetAllProgressForNewStanza(): void {
    this.playersMap.forEach((player, id) => {
      this.playersMap.set(id, { ...player, progressPercent: 0 });
    });
    this.emitPlayersList();
  }

  public addSimulatedBot(botName: string = "SynthBot 9000"): RoomPlayer {
    const bot: RoomPlayer = {
      id: `bot-${Math.random().toString(36).slice(2, 7)}`,
      name: botName,
      isHost: false,
      isBot: true,
      progressPercent: 0,
      wpm: 58,
      score: 0,
      avatarColor: "#a855f7",
    };
    this.playersMap.set(bot.id, bot);
    this.emitPlayersList();
    return bot;
  }

  public updateBotProgress(botId: string, progressPercent: number, wpm: number, score: number): void {
    const bot = this.playersMap.get(botId);
    if (!bot) return;
    this.playersMap.set(botId, {
      ...bot,
      progressPercent: Math.min(100, progressPercent),
      wpm,
      score,
    });
    this.emitPlayersList();
  }

  private emitPlayersList(): void {
    this.onPlayersChangeCallback(Array.from(this.playersMap.values()));
  }

  public disconnect(): void {
    if (this.supabaseChannel) {
      this.supabaseChannel.unsubscribe();
      this.supabaseChannel = null;
    }
    if (this.localBroadcast) {
      this.localBroadcast.close();
      this.localBroadcast = null;
    }
  }
}
