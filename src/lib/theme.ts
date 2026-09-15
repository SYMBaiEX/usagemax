export type ThemePreference = "light" | "dark" | "system";
export const themeStorageKey = "usagemax:theme";
export const motionStorageKey = "usagemax:motion";

export function resolveTheme(preference: unknown, systemDark: boolean): "light" | "dark" {
  return preference === "light" || preference === "dark" ? preference : systemDark ? "dark" : "light";
}

// Runs before first paint. Storage is optional (private browsing / blocked storage).
export const themeBootstrap = `(function(){var p='system',m='on';try{p=localStorage.getItem('${themeStorageKey}')||p;m=localStorage.getItem('${motionStorageKey}')||m}catch(e){}var d=document.documentElement;d.dataset.theme=p==='light'||p==='dark'?p:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';d.dataset.motion=m==='off'?'off':'on';d.style.colorScheme=d.dataset.theme})()`;
