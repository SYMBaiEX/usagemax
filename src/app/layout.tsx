import type { Metadata, Viewport } from "next";
import { Geist_Mono, Instrument_Sans } from "next/font/google";

import { Providers } from "@/components/providers";
import { SiteFooter, SiteHeader } from "@/components/site-shell";
import { SiteFrame } from "@/components/site-frame";
import "./globals.css";
import { themeBootstrap } from "@/lib/theme";
import { usageMaxStructuredData } from "@/lib/structured-data";

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://usagemax.com"),
  title: {
    default: "UsageMax — Your AI work, made visible",
    template: "%s · UsageMax",
  },
  description: "Track your AI token usage, compare stats, and share the public record of what you build.",
  applicationName: "UsageMax",
  keywords: ["AI telemetry", "agent observability", "LLM usage", "AI usage analytics", "OpenTelemetry"],
  authors: [{ name: "UsageMax" }],
  creator: "UsageMax",
  publisher: "UsageMax",
  alternates: { canonical: "https://usagemax.com" },
  openGraph: {
    images: [{ url: "/brand/social-card.png", width: 1200, height: 630, alt: "UsageMax — Your AI work, on the record." }],
    type: "website",
    url: "https://usagemax.com",
    siteName: "UsageMax",
    title: "UsageMax — Your AI work, made visible",
    description: "Track your AI usage, compare stats, and share your public profile.",
  },
  twitter: {
    images: ["/brand/social-card.png"],
    card: "summary_large_image",
    title: "UsageMax — Your AI work, made visible",
    description: "Track your AI usage, compare stats, and share your public profile.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f7f7f8" }, { media: "(prefers-color-scheme: dark)", color: "#121212" }],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${instrumentSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <script id="usagemax-structured-data" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(usageMaxStructuredData) }} />
        <link rel="ard" href="/.well-known/ard.json" />
        <link rel="nlweb" href="/ask" title="Ask UsageMax" />
      </head>
      <body className="site-body">
        <Providers>
          <a className="skip-link" href="#main-content">Skip to main content</a>
          <SiteFrame header={<SiteHeader />} footer={<SiteFooter />}>{children}</SiteFrame>
        </Providers>
      </body>
    </html>
  );
}
