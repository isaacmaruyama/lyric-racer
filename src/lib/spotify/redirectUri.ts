import { NextRequest } from "next/server";

/**
 * Resolves the Spotify OAuth Redirect URI and origin dynamically:
 * 1. Always rewrites http://localhost -> http://127.0.0.1 for Spotify security compliance.
 * 2. If running on a live production domain (e.g. Vercel/Render) and NEXT_PUBLIC_SPOTIFY_REDIRECT_URI
 *    was accidentally left pointing to localhost or 127.0.0.1, automatically uses the live production origin instead!
 */
export function resolveSpotifyRedirectUri(request: NextRequest): {
  origin: string;
  redirectUri: string;
} {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  const rawOrigin = forwardedHost
    ? `${forwardedProto}://${forwardedHost}`
    : request.nextUrl.origin;

  // Always normalize http://localhost to http://127.0.0.1 per Spotify security policy
  const normalizedOrigin = rawOrigin.replace(
    /^http:\/\/localhost(?=:|$)/i,
    "http://127.0.0.1"
  );

  const isLocalRequest =
    normalizedOrigin.includes("127.0.0.1") ||
    normalizedOrigin.includes("localhost");

  const envRedirect = process.env.NEXT_PUBLIC_SPOTIFY_REDIRECT_URI?.trim();

  if (envRedirect) {
    const normalizedEnvRedirect = envRedirect.replace(
      /^http:\/\/localhost(?=:|$)/i,
      "http://127.0.0.1"
    );
    const isEnvLocal =
      normalizedEnvRedirect.includes("127.0.0.1") ||
      normalizedEnvRedirect.includes("localhost");

    // If running on a live production domain (e.g. Vercel/Render) but env var was accidentally left as localhost/127.0.0.1,
    // use the actual production origin instead!
    if (!isLocalRequest && isEnvLocal) {
      return {
        origin: normalizedOrigin,
        redirectUri: `${normalizedOrigin}/api/auth/callback`,
      };
    }

    return {
      origin: normalizedOrigin,
      redirectUri: normalizedEnvRedirect,
    };
  }

  return {
    origin: normalizedOrigin,
    redirectUri: `${normalizedOrigin}/api/auth/callback`,
  };
}
