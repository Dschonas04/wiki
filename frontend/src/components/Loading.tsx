/**
 * Loading-Komponente (Ladeindikator)
 *
 * Zeigt einen animierten Lade-Spinner mit einer optionalen Nachricht an.
 * Wird verwendet, wenn Daten geladen werden oder asynchrone Operationen laufen.
 */

// Lade-Spinner-Icon aus der Lucide-Bibliothek
import { Loader2 } from 'lucide-react';

// Internationalisierung
import { useLanguage } from '../context/LanguageContext';

/**
 * Schnittstelle für die Loading-Eigenschaften
 */
interface LoadingProps {
  /** Optionale Nachricht, die unter dem Spinner angezeigt wird (Standard: 'Loading…') */
  message?: string;
}

export default function Loading({ message }: LoadingProps) {
  const { t } = useLanguage();
  const resolvedMessage = message ?? t('loading.text');
  return (
    <div className="loading-state">
      {/* Animierter Lade-Spinner */}
      <Loader2 className="loading-spinner" size={32} />
      {/* Lademeldung unterhalb des Spinners */}
      <p>{resolvedMessage}</p>
    </div>
  );
}
