import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, IBM_Plex_Mono } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";
import "./app.css";
import { Providers } from "./providers";

// Self hosted at build time by next/font (no runtime request to Google, CSP font-src 'self')
const atkinson = Atkinson_Hyperlegible({ subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"],
  variable: "--font-atkinson", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "QA Pilot", template: "%s | QA Pilot" },
  description: "Bug tracking and QA management with AI assistance.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${atkinson.variable} ${plexMono.variable}`}>
      <body>
        <a className="skip" href="#main">Skip to content</a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
