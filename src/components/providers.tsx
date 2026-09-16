"use client";

import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { AuthKitProvider, useAccessToken, useAuth } from "@workos-inc/authkit-nextjs/components";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";

import { WebMcpTools } from "./webmcp-tools";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

export function Providers({ children }: { children: ReactNode }) {
  const [convexClient] = useState(() => (convexUrl ? new ConvexReactClient(convexUrl) : null));
  if (!convexClient) return <AuthKitProvider><WebMcpTools />{children}</AuthKitProvider>;
  return (
    <AuthKitProvider>
      <WebMcpTools />
      <ConvexProviderWithAuth client={convexClient} useAuth={useAuthFromAuthKit}>
        {children}
      </ConvexProviderWithAuth>
    </AuthKitProvider>
  );
}

function useAuthFromAuthKit() {
  const { user, loading: isLoading } = useAuth();
  const { getAccessToken, refresh } = useAccessToken();
  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken?: boolean } = {}) => {
      if (!user) return null;
      try {
        return ((forceRefreshToken ? await refresh() : await getAccessToken()) ?? null);
      } catch {
        return null;
      }
    },
    [getAccessToken, refresh, user],
  );
  return { isLoading, isAuthenticated: Boolean(user), fetchAccessToken };
}
