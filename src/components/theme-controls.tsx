"use client";

import { useEffect, useSyncExternalStore } from "react";
import { motionStorageKey, resolveTheme, themeStorageKey, type ThemePreference } from "@/lib/theme";

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
  const [theme, motion] = current.split(":");
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      const resolved = resolveTheme(readPreference(), media.matches);
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
      try { document.documentElement.dataset.motion = localStorage.getItem(motionStorageKey) === "off" ? "off" : "on"; } catch { /* Keep the in-memory preference. */ }
      window.dispatchEvent(new Event(changeEvent));
    };
    media.addEventListener("change", sync);
    window.addEventListener("storage", sync);
    return () => { media.removeEventListener("change", sync); window.removeEventListener("storage", sync); };
  }, []);

  function toggleMotion() {
    const value = motion === "off" ? "on" : "off";
    try { localStorage.setItem(motionStorageKey, value); } catch { /* Motion still works without storage. */ }
    document.documentElement.dataset.motion = value;
    window.dispatchEvent(new Event(changeEvent));
  }
  return <div className="appearance-controls">
    <button type="button" className="theme-toggle" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path className="theme-moon" d="M20.8 13.4A9 9 0 0 1 10.6 3.2 9 9 0 1 0 20.8 13.4Z"/><g className="theme-sun"><circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/></g></svg>
    </button>
    <button type="button" className="motion-toggle" aria-label={motion === "off" ? "Enable ambient animation" : "Pause ambient animation"} aria-pressed={motion === "off"} title={motion === "off" ? "Enable ambient animation" : "Pause ambient animation"} onClick={toggleMotion}>
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">{motion === "off" ? <path d="m6 3 10 7-10 7Z"/> : <path d="M7 3v14m6-14v14"/>}</svg>
    </button>
  </div>;
}
