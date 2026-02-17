import { useState, useEffect, useCallback } from 'react';

export type Theme = 'light' | 'dark' | 'orange' | 'midnight' | 'contrast' | 'soft-dark';

export const THEMES: { id: Theme; label: string; icon: string }[] = [
  { id: 'light',    label: 'Light',       icon: '☀️' },
  { id: 'dark',     label: 'Dark',        icon: '🌙' },
  { id: 'orange',   label: 'Orange',      icon: '🍊' },
  { id: 'midnight', label: 'Midnight',    icon: '🌌' },
  { id: 'contrast', label: 'High Contrast', icon: '◑' },
  { id: 'soft-dark', label: 'Soft Dark',  icon: '🌑' },
];

const VALID: Set<string> = new Set(THEMES.map(t => t.id));

function isValidTheme(val: unknown): val is Theme {
  return typeof val === 'string' && VALID.has(val);
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'light';
    const stored = localStorage.getItem('wiki-theme');
    if (isValidTheme(stored)) return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  // Apply theme to DOM
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('wiki-theme', theme);
  }, [theme]);

  // Load from server on mount (async, non-blocking)
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
      } catch { /* ignore — use local */ }
    })();
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    // Persist to server (fire and forget)
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
      // Also persist
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

  return { theme, setTheme, toggleTheme, isDark, themes: THEMES };
}
