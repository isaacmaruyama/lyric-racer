import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const stateParam = request.nextUrl.searchParams.get("state");

  const defaultOrigin = request.nextUrl.origin.replace(
    /^http:\/\/localhost(?=:|$)/,
    "http://127.0.0.1"
  );

  let returnTo = "/";
  if (stateParam) {
    try {
      const decoded = JSON.parse(
        Buffer.from(stateParam, "base64url").toString("utf-8")
      );
      if (typeof decoded.returnTo === "string" && decoded.returnTo.startsWith("/")) {
        returnTo = decoded.returnTo;
      }
    } catch {
      // ignore invalid state JSON
    }
  }

  if (error || !code) {
    return NextResponse.redirect(
      `${defaultOrigin}${returnTo}${returnTo.includes("?") ? "&" : "?"}spotify_error=${encodeURIComponent(error || "missing_code")}`
    );
  }

  const clientId = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID || "";
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET || "";
  const redirectUri =
    process.env.NEXT_PUBLIC_SPOTIFY_REDIRECT_URI ||
    `${defaultOrigin}/api/auth/callback`;

  try {
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      return NextResponse.redirect(
        `${defaultOrigin}${returnTo}${returnTo.includes("?") ? "&" : "?"}spotify_error=token_exchange_failed`
      );
    }

    const tokenData = await tokenRes.json();
    const response = NextResponse.redirect(
      `${defaultOrigin}${returnTo}${returnTo.includes("?") ? "&" : "?"}spotify_connected=true`
    );

    // Set accessible token cookie for client Web Playback SDK initialization
    response.cookies.set("spotify_access_token", tokenData.access_token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: tokenData.expires_in || 3600,
      path: "/",
    });

    if (tokenData.refresh_token) {
      response.cookies.set("spotify_refresh_token", tokenData.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30,
        path: "/",
      });
    }

    return response;
  } catch (err) {
    console.error("Spotify callback error:", err);
    return NextResponse.redirect(
      `${defaultOrigin}${returnTo}${returnTo.includes("?") ? "&" : "?"}spotify_error=server_error`
    );
  }
}
