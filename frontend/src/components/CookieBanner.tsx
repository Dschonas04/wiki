import { useState, useEffect } from 'react';
import { Shield } from 'lucide-react';

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('wiki_cookie_notice')) {
      const t = setTimeout(() => setVisible(true), 600);
      return () => clearTimeout(t);
    }
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem('wiki_cookie_notice', 'dismissed');
    setVisible(false);
  };

  return (
    <div className="cookie-banner">
      <div className="cookie-banner-inner">
        <Shield size={20} className="cookie-banner-icon" />
        <p className="cookie-banner-text">
          <strong>Cookie-Hinweis:</strong> Diese Anwendung verwendet ausschließlich
          technisch notwendige Cookies für Authentifizierung und Sitzungsverwaltung.
          Keine Tracking- oder Analyse-Cookies.
        </p>
        <button className="btn btn-primary btn-sm" onClick={dismiss}>
          Verstanden
        </button>
      </div>
    </div>
  );
}
