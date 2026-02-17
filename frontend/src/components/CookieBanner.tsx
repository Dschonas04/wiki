/**
 * CookieBanner-Komponente (Cookie-Hinweis-Banner)
 *
 * Zeigt einen Hinweis über die Verwendung von Cookies an.
 * Informiert den Benutzer, dass nur technisch notwendige Cookies
 * für Authentifizierung und Sitzungsverwaltung verwendet werden.
 * Der Hinweis wird im localStorage gespeichert, damit er nach
 * dem Schließen nicht erneut erscheint.
 */

// React-Hooks für Zustand und Seiteneffekte
import { useState, useEffect } from 'react';

// Schild-Icon als visuelles Symbol für Datenschutz
import { Shield } from 'lucide-react';

export default function CookieBanner() {
  // Sichtbarkeitszustand des Banners
  const [visible, setVisible] = useState(false);

  // Effekt: Prüft ob der Cookie-Hinweis bereits bestätigt wurde
  // Zeigt das Banner nach 600ms Verzögerung an, wenn noch nicht bestätigt
  useEffect(() => {
    if (!localStorage.getItem('wiki_cookie_notice')) {
      const t = setTimeout(() => setVisible(true), 600);
      return () => clearTimeout(t);
    }
  }, []);

  // Nichts rendern, wenn das Banner nicht sichtbar ist
  if (!visible) return null;

  // Schließt das Banner und speichert die Bestätigung im localStorage
  const dismiss = () => {
    localStorage.setItem('wiki_cookie_notice', 'dismissed');
    setVisible(false);
  };

  return (
    <div className="cookie-banner">
      <div className="cookie-banner-inner">
        {/* Datenschutz-Icon */}
        <Shield size={20} className="cookie-banner-icon" />
        {/* Hinweistext über die Cookie-Nutzung */}
        <p className="cookie-banner-text">
          <strong>Cookie-Hinweis:</strong> Diese Anwendung verwendet ausschließlich
          technisch notwendige Cookies für Authentifizierung und Sitzungsverwaltung.
          Keine Tracking- oder Analyse-Cookies.
        </p>
        {/* Bestätigungsbutton zum Schließen des Banners */}
        <button className="btn btn-primary btn-sm" onClick={dismiss}>
          Verstanden
        </button>
      </div>
    </div>
  );
}
