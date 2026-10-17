import { NextRequest, NextResponse } from "next/server";
import { resolveSpotifyRedirectUri } from "@/lib/spotify/redirectUri";

const SPOTIFY_SCOPES = [
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-modify-playback-state",
  "user-read-playback-state",
].join(" ");

export async function GET(request: NextRequest) {
  const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
  const { redirectUri } = resolveSpotifyRedirectUri(request);

  if (!clientId || clientId === "your_spotify_client_id") {
    return NextResponse.json(
      {
        error: "Spotify Client ID not configured",
        message:
          "Set NEXT_PUBLIC_SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env.local to enable live Spotify Premium streaming.",
      },
      { status: 400 }
    );
  }

  const returnTo = request.nextUrl.searchParams.get("returnTo") || "/";
  const statePayload = Buffer.from(
    JSON.stringify({
      nonce: Math.random().toString(36).substring(2, 10),
      returnTo,
    })
  ).toString("base64url");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: SPOTIFY_SCOPES,
    redirect_uri: redirectUri,
    state: statePayload,
  });

  return NextResponse.redirect(
    `https://accounts.spotify.com/authorize?${params.toString()}`
  );
}
