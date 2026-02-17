/**
 * LanguageContext – Internationalisierung für Nexora
 *
 * Stellt die aktuelle Sprache und eine Übersetzungsfunktion bereit.
 * Sprache wird in localStorage und serverseitig in user_settings persistiert.
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import de from '../i18n/de';
import en from '../i18n/en';

export type Language = 'de' | 'en';

const translations: Record<Language, Record<string, string>> = { de, en };

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'de',
  setLanguage: () => {},
  t: (key) => key,
});

function isValidLanguage(val: unknown): val is Language {
  return val === 'de' || val === 'en';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window === 'undefined') return 'de';
    const stored = localStorage.getItem('nexora-language');
    if (isValidLanguage(stored)) return stored;
    // Browser-Sprache als Fallback
    const browserLang = navigator.language.slice(0, 2);
    return browserLang === 'en' ? 'en' : 'de';
  });

  // Vom Server laden (einmalig)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings/language', {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        if (res.ok) {
          const data = await res.json();
          if (isValidLanguage(data?.language)) {
            setLanguageState(data.language);
          }
        }
      } catch { /* Ignorieren – lokale Sprache verwenden */ }
    })();
  }, []);

  // Bei Änderung in localStorage speichern + HTML-Lang-Attribut setzen
  useEffect(() => {
    localStorage.setItem('nexora-language', language);
    document.documentElement.setAttribute('lang', language);
  }, [language]);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    // Auf Server persistieren (fire-and-forget)
    fetch('/api/settings/language', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'WikiApp' },
      body: JSON.stringify({ language: lang }),
    }).catch(() => {});
  }, []);

  /**
   * t() – Übersetzungsfunktion
   * Unterstützt Platzhalter: t('key', { name: 'Welt' }) → "Hallo, Welt!"
   */
  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      let text = translations[language]?.[key] ?? translations.de[key] ?? key;
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        });
      }
      return text;
    },
    [language],
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
