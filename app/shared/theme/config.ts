export const THEME_STORAGE_KEY = "nexora-theme-preference-v1";
export const LEGACY_PREFERENCES_KEY = "nexora-prototype-preferences-v2";
export const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}

export const themeInitializationScript = `(() => {
  const storageKey = ${JSON.stringify(THEME_STORAGE_KEY)};
  const legacyKey = ${JSON.stringify(LEGACY_PREFERENCES_KEY)};
  const query = ${JSON.stringify(SYSTEM_THEME_QUERY)};
  const valid = (value) => value === "system" || value === "light" || value === "dark";
  let preference = "system";
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (valid(stored)) {
      preference = stored;
    } else if (stored === null) {
      const legacyRaw = window.localStorage.getItem(legacyKey);
      if (legacyRaw) {
        const legacyTheme = JSON.parse(legacyRaw)?.theme;
        if (legacyTheme === "light" || legacyTheme === "dark") {
          preference = legacyTheme;
          window.localStorage.setItem(storageKey, preference);
        }
      }
    }
  } catch {}
  const systemDark = typeof window.matchMedia === "function" && window.matchMedia(query).matches;
  const resolved = preference === "system" ? (systemDark ? "dark" : "light") : preference;
  const root = document.documentElement;
  root.dataset.themePreference = preference;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
})();`;
