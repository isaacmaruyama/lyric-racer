import { NextRequest, NextResponse } from "next/server";
import { fetchSyncedLyricsFromLrclib } from "@/lib/lyrics/lrclib";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const trackName = searchParams.get("track") || "";
  const artistName = searchParams.get("artist") || "";
  const albumName = searchParams.get("album") || undefined;
  const durationSeconds = Number(searchParams.get("duration") || "180");

  if (!trackName || !artistName) {
    return NextResponse.json(
      { error: "Both 'track' and 'artist' query parameters are required" },
      { status: 400 }
    );
  }

  const payload = await fetchSyncedLyricsFromLrclib({
    trackName,
    artistName,
    albumName,
    durationSeconds,
  });

  // If the user has connected Spotify and we don't have a spotifyUri yet, resolve it via Spotify Search API
  const spotifyToken = request.cookies.get("spotify_access_token")?.value;
  if (spotifyToken && !payload.spotifyUri) {
    try {
      const q = encodeURIComponent(`track:${trackName} artist:${artistName}`);
      const spRes = await fetch(
        `https://api.spotify.com/v1/search?q=${q}&type=track&limit=1`,
        {
          headers: { Authorization: `Bearer ${spotifyToken}` },
        }
      );
      if (spRes.ok) {
        const spData = await spRes.json();
        const item = spData?.tracks?.items?.[0];
        if (item?.uri) {
          payload.spotifyUri = item.uri;
          if (item.album?.images?.[0]?.url) {
            payload.albumArtUrl = item.album.images[0].url;
          }
        }
      }
    } catch (err) {
      console.warn("Spotify track URI lookup failed:", err);
    }
  }

  return NextResponse.json(payload);
}
