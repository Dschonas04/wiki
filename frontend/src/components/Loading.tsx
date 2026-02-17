/**
 * Loading-Komponente (Ladeindikator)
 *
 * Zeigt einen animierten Lade-Spinner mit einer optionalen Nachricht an.
 * Wird verwendet, wenn Daten geladen werden oder asynchrone Operationen laufen.
 */

// Lade-Spinner-Icon aus der Lucide-Bibliothek
import { Loader2 } from 'lucide-react';

/**
 * Schnittstelle für die Loading-Eigenschaften
 */
interface LoadingProps {
  /** Optionale Nachricht, die unter dem Spinner angezeigt wird (Standard: 'Loading…') */
  message?: string;
}

export default function Loading({ message = 'Laden…' }: LoadingProps) {
  return (
    <div className="loading-state">
      {/* Animierter Lade-Spinner */}
      <Loader2 className="loading-spinner" size={32} />
      {/* Lademeldung unterhalb des Spinners */}
      <p>{message}</p>
    </div>
  );
}
