export type ThemePreference = "light" | "dark" | "system";
export const themeStorageKey = "usagemax:theme";

export function resolveTheme(preference: unknown, systemDark: boolean): "light" | "dark" {
  return preference === "light" || preference === "dark" ? preference : systemDark ? "dark" : "light";
}

// Runs before first paint. Storage is optional (private browsing / blocked storage).
// Legacy playback preferences no longer apply; CSS honors OS reduced motion.
export const themeBootstrap = `(function(){var p='system';try{p=localStorage.getItem('${themeStorageKey}')||p}catch(e){}var d=document.documentElement;d.dataset.theme=p==='light'||p==='dark'?p:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';d.dataset.motion='on';d.style.colorScheme=d.dataset.theme})()`;
