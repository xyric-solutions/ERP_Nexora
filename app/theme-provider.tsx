"use client";

import { createContext, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";

import {
  LEGACY_PREFERENCES_KEY,
  SYSTEM_THEME_QUERY,
  THEME_STORAGE_KEY,
  isThemePreference,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
} from "./theme-config";

type ThemeContextValue = {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference(preference: ThemePreference): void;
};

type ThemeSnapshot = Pick<ThemeContextValue, "preference" | "resolvedTheme">;

type ThemeStore = {
  getSnapshot(): ThemeSnapshot;
  subscribe(listener: () => void): () => void;
  setPreference(preference: ThemePreference): void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const serverSnapshot: ThemeSnapshot = { preference: "system", resolvedTheme: "light" };

function readLegacyPreference(): ThemePreference | null {
  try {
    const raw = window.localStorage.getItem(LEGACY_PREFERENCES_KEY);
    if (!raw) return null;
    const legacyTheme = (JSON.parse(raw) as { theme?: unknown }).theme;
    return legacyTheme === "light" || legacyTheme === "dark" ? legacyTheme : null;
  } catch {
    return null;
  }
}

function readPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemePreference(stored)) return stored;
    if (stored === null) return readLegacyPreference() ?? "system";
  } catch {
    return "system";
  }
  return "system";
}

function applyTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  const resolved = resolveTheme(preference, systemDark);
  const root = document.documentElement;
  root.dataset.themePreference = preference;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  return resolved;
}

function createThemeStore(): ThemeStore {
  const browser = typeof window !== "undefined";
  const media = browser && typeof window.matchMedia === "function" ? window.matchMedia(SYSTEM_THEME_QUERY) : null;
  const preference = browser ? readPreference() : "system";
  let snapshot: ThemeSnapshot = {
    preference,
    resolvedTheme: resolveTheme(preference, media?.matches ?? false),
  };
  const listeners = new Set<() => void>();
  let removeMediaListener: (() => void) | undefined;

  const persist = () => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, snapshot.preference);
    } catch {
      /* Storage may be blocked; the in-memory preference remains usable. */
    }
  };
  const emit = () => listeners.forEach((listener) => listener());
  const followSystem = () => {
    removeMediaListener?.();
    removeMediaListener = undefined;
    if (snapshot.preference !== "system" || !media) return;
    const sync = (event: MediaQueryListEvent) => {
      snapshot = {
        preference: snapshot.preference,
        resolvedTheme: applyTheme(snapshot.preference, event.matches),
      };
      emit();
    };
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", sync);
      removeMediaListener = () => media.removeEventListener("change", sync);
    } else {
      media.addListener(sync);
      removeMediaListener = () => media.removeListener(sync);
    }
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      if (listeners.size === 1 && browser) {
        snapshot = {
          preference: snapshot.preference,
          resolvedTheme: applyTheme(snapshot.preference, media?.matches ?? false),
        };
        persist();
        followSystem();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          removeMediaListener?.();
          removeMediaListener = undefined;
        }
      };
    },
    setPreference: (nextPreference) => {
      snapshot = {
        preference: nextPreference,
        resolvedTheme: applyTheme(nextPreference, media?.matches ?? false),
      };
      persist();
      followSystem();
      emit();
    },
  };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createThemeStore);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, () => serverSnapshot);
  const value = useMemo(() => ({ ...snapshot, setPreference: store.setPreference }), [snapshot, store]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used within ThemeProvider");
  return value;
}

export function ThemeSelector({ label = "Appearance", className = "" }: { label?: string; className?: string }) {
  const { preference, setPreference } = useTheme();
  return (
    <label className={`nx-theme-selector ${className}`.trim()}>
      <span>{label}</span>
      <select
        aria-label={label}
        value={preference}
        onChange={(event) => setPreference(event.target.value as ThemePreference)}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
