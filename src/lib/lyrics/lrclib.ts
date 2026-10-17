import { groupLinesIntoStanzas, LyricLine, LyricStanza, parseLrcLyrics } from "./stanzaParser";

export interface LrclibResponse {
  id: number;
  name: string;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

export interface TrackLyricsPayload {
  trackName: string;
  artistName: string;
  albumName?: string;
  albumArtUrl?: string;
  spotifyUri?: string;
  previewAudioUrl?: string;
  durationSeconds: number;
  syncedLrc: string;
  lines: LyricLine[];
  stanzas: LyricStanza[];
  source: "lrclib" | "demo";
}

export interface DemoSongPreset {
  id: string;
  spotifyUri: string;
  trackName: string;
  artistName: string;
  albumName: string;
  albumArtUrl: string;
  durationSeconds: number;
  syncedLrc: string;
}

/**
 * Curated fallback & instant-play tracks with synchronized LRC timestamps.
 * Note: For instant excitement, the first lines start within a few seconds of playback.
 */
export const DEMO_SONG_PRESETS: DemoSongPreset[] = [
  {
    id: "rick-astley-never-gonna-give-you-up",
    spotifyUri: "spotify:track:4PTG3Z6ehGkBFwjybzWkR8",
    trackName: "Never Gonna Give You Up",
    artistName: "Rick Astley",
    albumName: "Whenever You Need Somebody",
    albumArtUrl: "https://i.scdn.co/image/ab67616d0000b2735755e164993798e0c9ef7d7a",
    durationSeconds: 213,
    syncedLrc: `[00:18.80] We're no strangers to love
[00:22.60] You know the rules and so do I
[00:27.00] A full commitment's what I'm thinking of
[00:31.10] You wouldn't get this from any other guy
[00:35.10] I just wanna tell you how I'm feeling
[00:40.20] Gotta make you understand
[00:43.20] Never gonna give you up
[00:45.30] Never gonna let you down
[00:47.40] Never gonna run around and desert you
[00:51.60] Never gonna make you cry
[00:53.70] Never gonna say goodbye
[00:55.80] Never gonna tell a lie and hurt you`,
  },
  {
    id: "queen-bohemian-rhapsody",
    spotifyUri: "spotify:track:7tFiyTwD0nx5a1eklYtX2J",
    trackName: "Bohemian Rhapsody",
    artistName: "Queen",
    albumName: "A Night at the Opera",
    albumArtUrl: "https://i.scdn.co/image/ab67616d0000b273e319baafd16e84f0408af2a0",
    durationSeconds: 354,
    syncedLrc: `[00:04.50] Is this the real life? Is this just fantasy?
[00:08.50] Caught in a landslide, no escape from reality
[00:15.10] Open your eyes, look up to the skies and see
[00:24.10] I'm just a poor boy, I need no sympathy
[00:30.40] Because I'm easy come, easy go, little high, little low
[00:37.90] Any way the wind blows doesn't really matter to me, to me
[00:55.20] Mama, just killed a man
[01:01.20] Put a gun against his head, pulled my trigger, now he's dead
[01:08.50] Mama, life had just begun
[01:15.10] But now I've gone and thrown it all away`,
  },
  {
    id: "the-weeknd-blinding-lights",
    spotifyUri: "spotify:track:0VjIjW4GlUZAMYd2vXMi3b",
    trackName: "Blinding Lights",
    artistName: "The Weeknd",
    albumName: "After Hours",
    albumArtUrl: "https://i.scdn.co/image/ab67616d0000b2738863bc11d2aa12b54f5aeb36",
    durationSeconds: 200,
    syncedLrc: `[00:27.20] I've been tryna call
[00:30.00] I've been on my own for long enough
[00:32.80] Maybe you can show me how to love, maybe
[00:38.50] I'm going through withdrawals
[00:41.30] You don't even have to do too much
[00:44.10] You can turn me on with just a touch, baby
[00:49.80] I look around and Sin City's cold and empty
[00:55.30] No one's around to judge me
[00:58.20] I can't see clearly when you're gone
[01:01.10] I said, ooh, I'm blinded by the lights
[01:06.70] No, I can't sleep until I feel your touch`,
  },
];

const LRCLIB_BASE_URL = "https://lrclib.net/api";

/**
 * Queries the free iTunes Search API for a guaranteed audio preview stream (.m4a) and album artwork.
 */
async function fetchItunesAudioPreview(
  trackName: string,
  artistName: string
): Promise<{ previewUrl?: string; artworkUrl?: string }> {
  try {
    const term = encodeURIComponent(`${trackName} ${artistName}`);
    const res = await fetch(
      `https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=1`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) return {};
    const data = await res.json();
    const item = data?.results?.[0];
    if (!item) return {};
    return {
      previewUrl: item.previewUrl || undefined,
      artworkUrl: item.artworkUrl100
        ? String(item.artworkUrl100).replace("100x100bb", "300x300bb")
        : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Fetches synchronized lyrics from LRCLIB API by track metadata, falling back to search if exact get fails.
 */
export async function fetchSyncedLyricsFromLrclib(params: {
  trackName: string;
  artistName: string;
  albumName?: string;
  durationSeconds?: number;
}): Promise<TrackLyricsPayload> {
  const { trackName, artistName, albumName, durationSeconds = 180 } = params;

  const searchParams = new URLSearchParams({
    track_name: trackName,
    artist_name: artistName,
  });
  if (albumName) searchParams.set("album_name", albumName);
  if (durationSeconds) searchParams.set("duration", String(Math.round(durationSeconds)));

  const headers = {
    "User-Agent": "LyricRacerWebApp/1.0 (https://github.com/lyric-racer)",
  };

  // Fetch iTunes audio preview stream in parallel
  const itunesPromise = fetchItunesAudioPreview(trackName, artistName);

  try {
    // 1. Try exact match endpoint first
    const getRes = await fetch(`${LRCLIB_BASE_URL}/get?${searchParams.toString()}`, {
      headers,
      next: { revalidate: 3600 },
    });

    if (getRes.ok) {
      const data = (await getRes.json()) as LrclibResponse;
      if (data.syncedLyrics) {
        const itunes = await itunesPromise;
        const lines = parseLrcLyrics(data.syncedLyrics);
        const stanzas = groupLinesIntoStanzas(lines, (data.duration || durationSeconds) * 1000);
        return {
          trackName: data.trackName || trackName,
          artistName: data.artistName || artistName,
          albumName: data.albumName || albumName,
          albumArtUrl: itunes.artworkUrl,
          previewAudioUrl: itunes.previewUrl,
          durationSeconds: data.duration || durationSeconds,
          syncedLrc: data.syncedLyrics,
          lines,
          stanzas,
          source: "lrclib",
        };
      }
    }

    // 2. Fallback to LRCLIB search endpoint
    const queryRes = await fetch(
      `${LRCLIB_BASE_URL}/search?track_name=${encodeURIComponent(trackName)}&artist_name=${encodeURIComponent(artistName)}`,
      { headers, next: { revalidate: 3600 } }
    );

    if (queryRes.ok) {
      const results = (await queryRes.json()) as LrclibResponse[];
      const bestSynced = results.find((item) => Boolean(item.syncedLyrics));
      if (bestSynced && bestSynced.syncedLyrics) {
        const itunes = await itunesPromise;
        const lines = parseLrcLyrics(bestSynced.syncedLyrics);
        const stanzas = groupLinesIntoStanzas(
          lines,
          (bestSynced.duration || durationSeconds) * 1000
        );
        return {
          trackName: bestSynced.trackName || trackName,
          artistName: bestSynced.artistName || artistName,
          albumName: bestSynced.albumName || albumName,
          albumArtUrl: itunes.artworkUrl,
          previewAudioUrl: itunes.previewUrl,
          durationSeconds: bestSynced.duration || durationSeconds,
          syncedLrc: bestSynced.syncedLyrics,
          lines,
          stanzas,
          source: "lrclib",
        };
      }
    }
  } catch (err) {
    console.warn("LRCLIB fetch error, checking preset fallback:", err);
  }

  // 3. Check if track matches one of our built-in presets or fall back to default demo
  const matchedPreset =
    DEMO_SONG_PRESETS.find(
      (p) =>
        p.trackName.toLowerCase().includes(trackName.toLowerCase()) ||
        trackName.toLowerCase().includes(p.trackName.toLowerCase())
    ) || DEMO_SONG_PRESETS[0];

  const itunes = await itunesPromise;
  const lines = parseLrcLyrics(matchedPreset.syncedLrc);
  const stanzas = groupLinesIntoStanzas(lines, matchedPreset.durationSeconds * 1000);

  return {
    trackName: matchedPreset.trackName,
    artistName: matchedPreset.artistName,
    albumName: matchedPreset.albumName,
    albumArtUrl: matchedPreset.albumArtUrl || itunes.artworkUrl,
    spotifyUri: matchedPreset.spotifyUri,
    previewAudioUrl: itunes.previewUrl,
    durationSeconds: matchedPreset.durationSeconds,
    syncedLrc: matchedPreset.syncedLrc,
    lines,
    stanzas,
    source: "demo",
  };
}
