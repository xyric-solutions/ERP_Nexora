// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider, ThemeSelector } from "../../app/theme-provider.js";
import { LEGACY_PREFERENCES_KEY, THEME_STORAGE_KEY, themeInitializationScript } from "../../app/theme-config.js";

let container: HTMLDivElement;
let root: Root;
let systemDark = false;
let mediaListeners: Set<(event: MediaQueryListEvent) => void>;

function installMatchMedia() {
  mediaListeners = new Set();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: systemDark,
      media: "(prefers-color-scheme: dark)",
      onchange: null,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => mediaListeners.add(listener),
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
        mediaListeners.delete(listener),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

async function renderSelector() {
  await act(async () => {
    root.render(createElement(ThemeProvider, null, createElement(ThemeSelector, { label: "Appearance" })));
  });
  return container.querySelector<HTMLSelectElement>('select[aria-label="Appearance"]')!;
}

async function choose(select: HTMLSelectElement, value: "system" | "light" | "dark") {
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("global theme settings", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    systemDark = false;
    installMatchMedia();
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-theme-preference");
    document.documentElement.style.colorScheme = "";
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("defaults to System and resolves the current operating-system theme", async () => {
    systemDark = true;
    const select = await renderSelector();

    expect(select.value).toBe("system");
    expect(document.documentElement.dataset.themePreference).toBe("system");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("resolves System before hydration", () => {
    systemDark = true;
    window.localStorage.setItem(THEME_STORAGE_KEY, "system");

    window.eval(themeInitializationScript);

    expect(document.documentElement.dataset.themePreference).toBe("system");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("migrates the former prototype theme before hydration", () => {
    window.localStorage.setItem(LEGACY_PREFERENCES_KEY, JSON.stringify({ theme: "dark", density: "compact" }));

    window.eval(themeInitializationScript);

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("persists explicit Light and Dark preferences", async () => {
    const select = await renderSelector();

    await choose(select, "dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");

    await choose(select, "light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("follows operating-system changes only while System is selected", async () => {
    const select = await renderSelector();
    expect(mediaListeners.size).toBe(1);

    systemDark = true;
    await act(async () => {
      for (const listener of mediaListeners) listener({ matches: true } as MediaQueryListEvent);
    });
    expect(document.documentElement.dataset.theme).toBe("dark");

    await choose(select, "light");
    expect(mediaListeners.size).toBe(0);
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("ignores invalid saved values and survives unavailable storage", async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked");
    });

    const select = await renderSelector();
    expect(select.value).toBe("system");
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
