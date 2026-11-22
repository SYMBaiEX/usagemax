import type { Metadata } from "next";
import type { ReactNode } from "react";
import { RootProvider } from "fumadocs-ui/provider/next";

import { docsOrigin } from "../lib/source";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(docsOrigin),
  title: { default: "UsageMax Docs", template: "%s | UsageMax Docs" },
  description: "Set up UsageMax, reconcile local AI usage, and integrate with the UsageMax API.",
  icons: { icon: "/icon.png" },
  openGraph: { siteName: "UsageMax Docs", images: ["/social-card.png"] },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
