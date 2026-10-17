import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LyricRacer — Multiplayer Spotify & LRCLIB Typing Battle",
  description:
    "Real-time multiplayer music lyrics typing game powered by Spotify Web Playback SDK, LRCLIB synced lyrics, Zustand, and Supabase Realtime.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased selection:bg-emerald-500 selection:text-zinc-950">
        {children}
      </body>
    </html>
  );
}
