import { NextRequest, NextResponse } from "next/server";
import { fetchSyncedLyricsFromLrclib } from "@/lib/lyrics/lrclib";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  let trackName = searchParams.get("track") || "";
  let artistName = searchParams.get("artist") || "";
  let albumName = searchParams.get("album") || undefined;
  let durationSeconds = Number(searchParams.get("duration") || "180");

  if (!trackName || !artistName) {
    return NextResponse.json(
      { error: "Both 'track' and 'artist' query parameters are required" },
      { status: 400 }
    );
  }

  let resolvedSpotifyUri: string | undefined;
  let resolvedSpotifyArt: string | undefined;

  // 1. If user has a Spotify token, search Spotify FIRST with market=from_token
  // so we get a guaranteed-playable Spotify URI and exact track duration for LRCLIB matching!
  const spotifyToken = request.cookies.get("spotify_access_token")?.value;
  if (spotifyToken) {
    try {
      const q = encodeURIComponent(`${trackName} ${artistName}`);
      const spRes = await fetch(
        `https://api.spotify.com/v1/search?q=${q}&type=track&market=from_token&limit=3`,
        {
          headers: { Authorization: `Bearer ${spotifyToken}` },
        }
      );
      if (spRes.ok) {
        const spData = await spRes.json();
        const items: any[] = spData?.tracks?.items || [];
        // Prefer explicitly playable track in user's market
        const bestTrack = items.find((item) => item.is_playable !== false) || items[0];
        if (bestTrack?.uri) {
          resolvedSpotifyUri = bestTrack.uri;
          trackName = bestTrack.name || trackName;
          artistName = bestTrack.artists?.[0]?.name || artistName;
          albumName = bestTrack.album?.name || albumName;
          if (bestTrack.duration_ms) {
            durationSeconds = Math.round(bestTrack.duration_ms / 1000);
          }
          if (bestTrack.album?.images?.[0]?.url) {
            resolvedSpotifyArt = bestTrack.album.images[0].url;
          }
        }
      }
    } catch (err) {
      console.warn("Spotify track search failed:", err);
    }
  }

  // 2. Fetch synchronized LRC lyrics matching the exact track metadata and duration
  const payload = await fetchSyncedLyricsFromLrclib({
    trackName,
    artistName,
    albumName,
    durationSeconds,
  });

  if (resolvedSpotifyUri) {
    payload.spotifyUri = resolvedSpotifyUri;
  }
  if (resolvedSpotifyArt) {
    payload.albumArtUrl = resolvedSpotifyArt;
  }

  return NextResponse.json(payload);
}
