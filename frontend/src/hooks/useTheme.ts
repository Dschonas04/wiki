/**
 * useTheme.ts – Theme-Verwaltung für die Wiki-Anwendung
 *
 * Dieser Hook verwaltet das Farbschema (Theme) der Anwendung.
 * Er unterstützt mehrere Themes und synchronisiert die Auswahl zwischen:
 * - Lokalem Speicher (localStorage) für sofortige Verfügbarkeit
 * - Server-seitiger Persistenz für geräteübergreifende Konsistenz
 * - System-Präferenz (prefers-color-scheme) als Fallback
 *
 * Verfügbare Themes: Light, Dark, Orange, Midnight, High Contrast, Soft Dark
 */

// React-Hooks für Zustandsverwaltung und Seiteneffekte
import { useState, useEffect, useCallback } from 'react';

// Typdefinition für alle verfügbaren Theme-Bezeichner
export type Theme = 'light' | 'dark' | 'orange' | 'midnight' | 'contrast' | 'soft-dark';

/**
 * THEMES – Liste aller verfügbaren Farbschemata
 *
 * Jedes Theme hat eine eindeutige ID, einen Anzeigenamen und ein Emoji-Icon.
 * Diese Liste wird für die Theme-Auswahl in der Benutzeroberfläche verwendet.
 */
export const THEMES: { id: Theme; label: string; icon: string }[] = [
  { id: 'light',    label: 'Light',       icon: '☀️' },   // Helles Standard-Theme
  { id: 'dark',     label: 'Dark',        icon: '🌙' },   // Dunkles Theme
  { id: 'orange',   label: 'Orange',      icon: '🍊' },   // Warmes orangefarbenes Theme
  { id: 'midnight', label: 'Midnight',    icon: '🌌' },   // Sehr dunkles Theme
  { id: 'contrast', label: 'High Contrast', icon: '◑' },  // Hoher Kontrast für Barrierefreiheit
  { id: 'soft-dark', label: 'Soft Dark',  icon: '🌑' },   // Sanftes dunkles Theme
];

// Set aller gültigen Theme-IDs für schnelle Validierung
const VALID: Set<string> = new Set(THEMES.map(t => t.id));

/**
 * isValidTheme – Prüft ob ein Wert ein gültiger Theme-Bezeichner ist
 *
 * Type Guard-Funktion, die sicherstellt, dass nur bekannte Theme-Werte
 * akzeptiert werden (z.B. aus localStorage oder Server-Antworten).
 *
 * @param val - Zu prüfender Wert
 * @returns true wenn der Wert ein gültiger Theme-Bezeichner ist
 */
function isValidTheme(val: unknown): val is Theme {
  return typeof val === 'string' && VALID.has(val);
}

/**
 * useTheme – Hook zur Verwaltung des Farbschemas
 *
 * Gibt das aktuelle Theme sowie Funktionen zum Ändern und Wechseln zurück.
 * Das Theme wird sowohl lokal als auch serverseitig gespeichert.
 *
 * @returns Objekt mit theme, setTheme, toggleTheme, isDark und themes
 */
export function useTheme() {
  // Theme-Zustand mit intelligenter Initialisierung
  const [theme, setThemeState] = useState<Theme>(() => {
    // Server-seitiges Rendering: Standardmäßig 'light' verwenden
    if (typeof window === 'undefined') return 'light';
    // Zuerst im localStorage nach gespeichertem Theme suchen
    const stored = localStorage.getItem('wiki-theme');
    if (isValidTheme(stored)) return stored;
    // Fallback: System-Farbschema-Präferenz des Betriebssystems verwenden
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  // Theme auf das DOM anwenden und im localStorage speichern
  useEffect(() => {
    // data-theme-Attribut am HTML-Root-Element setzen (wird von CSS verwendet)
    document.documentElement.setAttribute('data-theme', theme);
    // Theme lokal speichern für sofortige Verfügbarkeit beim nächsten Laden
    localStorage.setItem('wiki-theme', theme);
  }, [theme]);

  // Theme vom Server laden (asynchron, nicht-blockierend)
  // Wird beim ersten Laden ausgeführt, um serverseitig gespeichertes Theme zu synchronisieren
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings/theme', {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        if (res.ok) {
          const data = await res.json();
          // Nur gültige Themes vom Server übernehmen
          if (isValidTheme(data?.theme)) {
            setThemeState(data.theme);
          }
        }
      } catch { /* Fehler ignorieren — lokales Theme verwenden */ }
    })();
  }, []);

  /**
   * setTheme – Theme manuell setzen
   *
   * Aktualisiert das Theme im lokalen Zustand und speichert es
   * auf dem Server (Fire-and-Forget, ohne auf Antwort zu warten).
   *
   * @param t - Das gewünschte neue Theme
   */
  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    // Theme auf dem Server persistieren (Fehler werden ignoriert)
    fetch('/api/settings/theme', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'WikiApp' },
      body: JSON.stringify({ theme: t }),
    }).catch(() => {});
  }, []);

  /**
   * toggleTheme – Zum nächsten Theme in der Liste wechseln
   *
   * Rotiert durch alle verfügbaren Themes in der Reihenfolge der THEMES-Liste.
   * Nach dem letzten Theme wird wieder beim ersten begonnen.
   */
  const toggleTheme = useCallback(() => {
    setThemeState(prev => {
      // Index des aktuellen Themes in der Liste finden
      const idx = THEMES.findIndex(t => t.id === prev);
      // Nächstes Theme auswählen (mit Überlauf zum Anfang der Liste)
      const next = THEMES[(idx + 1) % THEMES.length].id;
      // Neues Theme ebenfalls auf dem Server persistieren
      fetch('/api/settings/theme', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'WikiApp' },
        body: JSON.stringify({ theme: next }),
      }).catch(() => {});
      return next;
    });
  }, []);

  // Hilfseigenschaft: Prüft ob das aktuelle Theme ein dunkles Theme ist
  // Wird verwendet um z.B. Bilder oder Logos an den Hintergrund anzupassen
  const isDark = theme === 'dark' || theme === 'midnight' || theme === 'soft-dark';

  // Alle Werte und Funktionen als Objekt zurückgeben
  return { theme, setTheme, toggleTheme, isDark, themes: THEMES };
}
