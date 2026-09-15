"use client";

import { useEffect, useState } from "react";
import { authHref, type AuthContext, type AuthMode, type SocialProvider } from "@/lib/auth-flow";
import { GitHubIcon } from "./auth-controls";
import { ArrowRight } from "./icons";
import styles from "./auth-page.module.css";

function GoogleIcon() {
  return <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.97-3.38.97-2.61 0-4.83-1.77-5.62-4.15H3.03v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.38 13.9a6 6 0 0 1 0-3.8V7.51H3.03a10 10 0 0 0 0 8.98l3.35-2.59Z"/><path fill="#EA4335" d="M12 5.95c1.48 0 2.8.51 3.85 1.51l2.89-2.89A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.97 5.51l3.35 2.59A5.98 5.98 0 0 1 12 5.95Z"/></svg>;
}

export function AuthButtons({ mode, context }: { mode: AuthMode; context: AuthContext }) {
  const [pending, setPending] = useState<SocialProvider | null>(null);
  useEffect(() => {
    const reset = () => setPending(null);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);
  return <div className={styles.providers} aria-label="Sign-in providers">
    {(["github", "google"] as const).map(provider => <a
      key={provider}
      className={`${styles.provider} ${provider === "github" ? styles.github : styles.google}`}
      href={authHref("/auth/start", mode, context, provider)}
      aria-disabled={pending ? true : undefined}
      onClick={event => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (pending) { event.preventDefault(); return; }
        setPending(provider);
      }}
    >
      {provider === "github" ? <GitHubIcon size={20} /> : <GoogleIcon />}
      <span>{pending === provider ? "Connecting…" : `Continue with ${provider === "github" ? "GitHub" : "Google"}`}</span>
      <ArrowRight size={16} />
    </a>)}
    <span className="sr-only" role="status" aria-live="polite">{pending ? `Connecting to ${pending === "github" ? "GitHub" : "Google"}` : ""}</span>
  </div>;
}
