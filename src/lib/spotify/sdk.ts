"use client";

export interface SpotifyPlayerInstance {
  connect: () => Promise<boolean>;
  disconnect: () => void;
  addListener: (event: string, cb: (data: any) => void) => void;
  removeListener: (event: string) => void;
  getCurrentState: () => Promise<any>;
  setName: (name: string) => Promise<void>;
  getVolume: () => Promise<number>;
  setVolume: (volume: number) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  togglePlay: () => Promise<void>;
  seek: (position_ms: number) => Promise<void>;
  activateElement?: () => Promise<void>;
}

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: {
      Player: new (options: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume?: number;
      }) => SpotifyPlayerInstance;
    };
  }
}

export class SpotifyPlaybackController {
  private player: SpotifyPlayerInstance | null = null;
  private deviceId: string | null = null;
  private accessToken: string | null = null;

  public async initialize(
    accessToken: string,
    onReady: (deviceId: string) => void,
    onStateChange: (positionMs: number, paused: boolean) => void,
    onError: (errMessage: string) => void
  ): Promise<void> {
    this.accessToken = accessToken;

    if (typeof window === "undefined") return;

    const setupPlayer = () => {
      if (!window.Spotify) return;

      this.player = new window.Spotify.Player({
        name: "LyricRacer Web Arena",
        getOAuthToken: (cb) => {
          if (this.accessToken) cb(this.accessToken);
        },
        volume: 0.85,
      });

      this.player.addListener("ready", ({ device_id }: { device_id: string }) => {
        this.deviceId = device_id;
        onReady(device_id);
      });

      this.player.addListener("not_ready", () => {
        this.deviceId = null;
      });

      this.player.addListener("player_state_changed", (state: any) => {
        if (!state) return;
        onStateChange(state.position, state.paused);
      });

      this.player.addListener("initialization_error", ({ message }: { message: string }) =>
        onError(`Browser DRM/Init Error: ${message}`)
      );
      this.player.addListener("authentication_error", ({ message }: { message: string }) =>
        onError(`Spotify Auth Expired — Reconnect Spotify: ${message}`)
      );
      this.player.addListener("account_error", ({ message }: { message: string }) =>
        onError(`Spotify Premium Required: ${message}`)
      );
      this.player.addListener("playback_error", ({ message }: { message: string }) => {
        console.warn("Transient Spotify SDK playback_error:", message);
      });

      this.player.connect();
    };

    if (window.Spotify) {
      setupPlayer();
    } else {
      window.onSpotifyWebPlaybackSDKReady = setupPlayer;
      if (!document.getElementById("spotify-player-script")) {
        const script = document.createElement("script");
        script.id = "spotify-player-script";
        script.src = "https://sdk.scdn.co/spotify-player.js";
        script.async = true;
        document.body.appendChild(script);
      }
    }
  }

  /**
   * Must be called directly inside a user click gesture handler to unlock browser audio autoplay.
   */
  public async unlockBrowserAudio(): Promise<void> {
    try {
      if (this.player?.activateElement) {
        await this.player.activateElement();
      }
    } catch {
      // ignore if not supported
    }
  }

  /**
   * Resolves a playable Spotify track URI in the user's market by track & artist name.
   */
  public async resolvePlayableTrackUri(
    trackName: string,
    artistName: string
  ): Promise<string | null> {
    if (!this.accessToken) return null;
    try {
      const q = encodeURIComponent(`${trackName} ${artistName}`);
      const res = await fetch(
        `https://api.spotify.com/v1/search?q=${q}&type=track&market=from_token&limit=3`,
        {
          headers: { Authorization: `Bearer ${this.accessToken}` },
        }
      );
      if (!res.ok) return null;
      const data = await res.json();
      const items: any[] = data?.tracks?.items || [];
      const playable = items.find((item) => item.is_playable !== false) || items[0];
      return playable?.uri || null;
    } catch {
      return null;
    }
  }

  public async playTrack(
    spotifyUri: string,
    positionMs: number = 0,
    fallbackSearch?: { trackName: string; artistName: string }
  ): Promise<{ ok: boolean; error?: string }> {
    if (!this.accessToken) {
      return { ok: false, error: "Not logged into Spotify" };
    }
    if (!this.deviceId) {
      return { ok: false, error: "Spotify Web Player device still initializing" };
    }

    try {
      await this.unlockBrowserAudio();

      // Always resolve the market-playable URI if fallbackSearch is provided
      let targetUri = spotifyUri;
      if (fallbackSearch?.trackName && fallbackSearch?.artistName) {
        const marketUri = await this.resolvePlayableTrackUri(
          fallbackSearch.trackName,
          fallbackSearch.artistName
        );
        if (marketUri) {
          targetUri = marketUri;
        }
      }

      if (!targetUri) {
        return { ok: false, error: "Track not found on Spotify" };
      }

      const sendPlayRequest = (uriToPlay: string) =>
        fetch(
          `https://api.spotify.com/v1/me/player/play?device_id=${this.deviceId}`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${this.accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              uris: [uriToPlay],
              position_ms: positionMs,
            }),
          }
        );

      let res = await sendPlayRequest(targetUri);

      // If device went dormant or returned an error, wake/transfer device and retry
      if (!res.ok) {
        await fetch("https://api.spotify.com/v1/me/player", {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            device_ids: [this.deviceId],
            play: false,
          }),
        });
        await new Promise((r) => setTimeout(r, 400));
        res = await sendPlayRequest(targetUri);
      }

      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const errJson = await res.json();
          detail = errJson?.error?.message || detail;
        } catch {
          // ignore
        }
        return { ok: false, error: detail };
      }

      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message || "Network error starting Spotify" };
    }
  }

  public async pause(): Promise<void> {
    if (this.player) {
      try {
        await this.player.pause();
      } catch {
        // ignore
      }
    }
  }

  public async resume(): Promise<void> {
    if (this.player) {
      try {
        await this.player.resume();
      } catch {
        // ignore
      }
    }
  }

  public async seek(positionMs: number): Promise<void> {
    if (this.player) {
      try {
        await this.player.seek(positionMs);
      } catch {
        // ignore
      }
    }
  }

  public async setVolume(volume: number): Promise<void> {
    if (this.player) {
      try {
        await this.player.setVolume(Math.max(0, Math.min(1, volume)));
      } catch {
        // ignore
      }
    }
  }

  public async getPositionMs(): Promise<number | null> {
    if (!this.player) return null;
    try {
      const state = await this.player.getCurrentState();
      return state ? state.position : null;
    } catch {
      return null;
    }
  }

  public disconnect(): void {
    if (this.player) {
      this.player.disconnect();
      this.player = null;
    }
  }
}

/**
 * Web Audio API sound synthesizer for instant audio feedback on pause, countdown, and stanza completion.
 */
class ArcadeAudioCuePlayer {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public playPauseChallengeAlert(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const freqs = [523.25, 392.0]; // C5 -> G4 alert
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(f, now + idx * 0.11);
      gain.gain.setValueAtTime(0.14, now + idx * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.11 + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.11);
      osc.stop(now + idx * 0.11 + 0.24);
    });
  }

  public playStanzaSuccessChime(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const freqs = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6 major arpeggio
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, now + idx * 0.08);
      gain.gain.setValueAtTime(0.16, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.3);
    });
  }

  public playCountdownTick(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }
}

export const soundEffects = new ArcadeAudioCuePlayer();
