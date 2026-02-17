/**
 * ThemeContext.tsx – Globaler Theme-Provider
 *
 * Stellt das Farbschema (Theme) applikationsweit bereit.
 * Das Theme wird beim App-Start sofort angewendet, damit es
 * nicht erst beim Besuch der Einstellungen-Seite aktiviert wird.
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

export type Theme = 'light' | 'dark' | 'orange' | 'midnight' | 'contrast' | 'soft-dark';

export const THEMES: { id: Theme; label: string; icon: string }[] = [
  { id: 'light',     label: 'Light',         icon: '☀️' },
  { id: 'dark',      label: 'Dark',          icon: '🌙' },
  { id: 'orange',    label: 'Orange',        icon: '🍊' },
  { id: 'midnight',  label: 'Midnight',      icon: '🌌' },
  { id: 'contrast',  label: 'High Contrast', icon: '◑' },
  { id: 'soft-dark', label: 'Soft Dark',     icon: '🌑' },
];

const VALID: Set<string> = new Set(THEMES.map(t => t.id));
const STORAGE_KEY = 'wiki-theme';

function isValidTheme(val: unknown): val is Theme {
  return typeof val === 'string' && VALID.has(val);
}

/** Theme sofort aus localStorage laden und auf <html> anwenden – noch vor React-Rendering */
function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (isValidTheme(stored)) return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

interface ThemeContextType {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  isDark: boolean;
  themes: typeof THEMES;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  // Theme auf DOM anwenden und in localStorage speichern
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  // Theme vom Server laden (einmalig beim App-Start)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings/theme', {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        if (res.ok) {
          const data = await res.json();
          if (isValidTheme(data?.theme)) {
            setThemeState(data.theme);
          }
        }
      } catch { /* Lokales Theme verwenden */ }
    })();
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    fetch('/api/settings/theme', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'WikiApp' },
      body: JSON.stringify({ theme: t }),
    }).catch(() => {});
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState(prev => {
      const idx = THEMES.findIndex(t => t.id === prev);
      const next = THEMES[(idx + 1) % THEMES.length].id;
      fetch('/api/settings/theme', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'WikiApp' },
        body: JSON.stringify({ theme: next }),
      }).catch(() => {});
      return next;
    });
  }, []);

  const isDark = theme === 'dark' || theme === 'midnight' || theme === 'soft-dark';

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, isDark, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>');
  return ctx;
}
