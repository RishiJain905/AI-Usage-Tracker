import type { Theme } from "@/types/settings";

const STORAGE_KEY = "app_theme";

function getSystemPreference(): "light" | "dark" {
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return "light";
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const effective = theme === "system" ? getSystemPreference() : theme;
  root.classList.remove("light", "dark");
  root.classList.add(effective);
  root.setAttribute("data-theme", effective);
}

function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    // localStorage may be unavailable
  }
  return "system";
}

function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // localStorage may be unavailable
  }
}

export function initializeTheme(): Theme {
  const theme = getStoredTheme();
  applyTheme(theme);

  // Listen for system preference changes
  if (typeof window !== "undefined" && window.matchMedia) {
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", () => {
        const current = getStoredTheme();
        if (current === "system") {
          applyTheme("system");
        }
      });
  }

  return theme;
}

export function setTheme(theme: Theme): void {
  storeTheme(theme);
  applyTheme(theme);
}

export function getEffectiveTheme(theme: Theme): "light" | "dark" {
  return theme === "system" ? getSystemPreference() : theme;
}
