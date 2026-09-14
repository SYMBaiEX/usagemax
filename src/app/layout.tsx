import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Providers } from "@/components/providers";
import { SiteFooter, SiteHeader } from "@/components/site-shell";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://usagemax.com"),
  title: {
    default: "UsageMax — Public AI telemetry",
    template: "%s · UsageMax",
  },
  description: "A public observability layer for builders running serious AI systems.",
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
    title: "UsageMax — Public AI telemetry",
    description: "Make your agent signal legible.",
  },
  twitter: {
    card: "summary_large_image",
    title: "UsageMax — Public AI telemetry",
    description: "Make your agent signal legible.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
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
