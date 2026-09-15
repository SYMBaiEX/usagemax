import type { Metadata } from "next";
import { Geist_Mono, Instrument_Sans, Instrument_Serif } from "next/font/google";

import { Providers } from "@/components/providers";
import { SiteFooter, SiteHeader } from "@/components/site-shell";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({ variable: "--font-instrument-serif", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });

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
    type: "website",
    url: "https://usagemax.com",
    siteName: "UsageMax",
    title: "UsageMax — Your AI work, made visible",
    description: "Track your AI usage, compare stats, and share your public profile.",
  },
  twitter: {
    card: "summary_large_image",
    title: "UsageMax — Your AI work, made visible",
    description: "Track your AI usage, compare stats, and share your public profile.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${instrumentSans.variable} ${geistMono.variable} ${instrumentSerif.variable}`} data-scroll-behavior="smooth">
      <body className="site-body">
        <Providers>
          <a className="skip-link" href="#main-content">Skip to main content</a>
          <SiteHeader />
          <main className="site-main" id="main-content">{children}</main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
