"use client";

import { useEffect, useSyncExternalStore } from "react";
import { resolveTheme, themeStorageKey, type ThemePreference } from "@/lib/theme";

const changeEvent = "usagemax:appearance";
function subscribe(update: () => void) {
  window.addEventListener(changeEvent, update);
  return () => window.removeEventListener(changeEvent, update);
}
function readPreference(): ThemePreference {
  try { const value = localStorage.getItem(themeStorageKey); return value === "light" || value === "dark" ? value : "system"; } catch { return "system"; }
}
function snapshot() { return `${document.documentElement.dataset.theme || "light"}:${document.documentElement.dataset.motion || "on"}`; }
function serverSnapshot() { return "light:on"; }

function setTheme(value: ThemePreference) {
  try { localStorage.setItem(themeStorageKey, value); } catch { /* Theme still works without storage. */ }
  const resolved = resolveTheme(value, matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  window.dispatchEvent(new Event(changeEvent));
}

export function SystemThemeButton() {
  return <button className="system-theme" type="button" onClick={() => setTheme("system")}>Use device theme</button>;
}

export function ThemeControls() {
  const current = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [theme] = current.split(":");
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      const resolved = resolveTheme(readPreference(), media.matches);
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
      document.documentElement.dataset.motion = "on";
      window.dispatchEvent(new Event(changeEvent));
    };
    media.addEventListener("change", sync);
    window.addEventListener("storage", sync);
    return () => { media.removeEventListener("change", sync); window.removeEventListener("storage", sync); };
  }, []);

  return <div className="appearance-controls">
    <button type="button" className="theme-toggle" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path className="theme-moon" d="M20.8 13.4A9 9 0 0 1 10.6 3.2 9 9 0 1 0 20.8 13.4Z"/><g className="theme-sun"><circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/></g></svg>
    </button>
  </div>;
}
