"use client";

import type { ReactNode } from "react";
import { ConvexProvider, ConvexReactClient } from "convex/react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const convexClient = convexUrl ? new ConvexReactClient(convexUrl) : null;

export function Providers({ children }: { children: ReactNode }) {
  if (!convexClient) return <>{children}</>;
  return <ConvexProvider client={convexClient}>{children}</ConvexProvider>;
}
