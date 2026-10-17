# LyricRacer — Multiplayer Spotify & LRCLIB Stanza Typing Game

A real-time multiplayer music lyrics typing battle built with **Next.js (App Router)**, **TypeScript**, **Tailwind CSS**, **Zustand**, **Spotify Web Playback SDK**, **LRCLIB API**, and **Supabase Realtime**.

## Gameplay Mechanics
1. **Synchronized Audio Playback**: Players join a room and listen to a track together.
2. **Dynamic Stanza Pause**: When the song reaches a designated challenge stanza, playback automatically pauses across all connected players and a countdown timer begins.
3. **Full Stanza Race**: Players race head-to-head to type the entire masked stanza. Input matching is **lenient** (case- and punctuation-insensitive) with Monkeytype-style character coloring and live WPM metrics.
4. **Live Opponent Lanes**: Opponent typing progress bars update in real time via **Supabase Realtime** (with automatic fallback to browser `BroadcastChannel` for zero-config multi-tab local testing, plus optional AI Bot rivals).

## Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment variables (Optional for Demo/Multi-Tab mode)**:
   Copy `.env.example` to `.env.local` to connect live Spotify Premium streaming and cloud Supabase Realtime:
   ```bash
   cp .env.example .env.local
   ```
   > **Important Spotify Redirect URI Note**: Spotify's Developer Dashboard security policy forbids `http://localhost` for non-HTTPS redirect URIs. Use the explicit loopback IP literal instead:
   > `http://127.0.0.1:3000/api/auth/callback`

3. **Run development server**:
   ```bash
   npm run dev
   ```

4. **Run unit tests**:
   ```bash
   npm test
   ```
