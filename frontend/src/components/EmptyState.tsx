/**
 * EmptyState-Komponente (Leerer Zustand)
 *
 * Wird angezeigt, wenn keine Daten vorhanden sind (z.B. leere Listen).
 * Enthält ein Icon, einen Titel, eine Beschreibung und eine optionale Aktion.
 * Sorgt für eine benutzerfreundliche Darstellung leerer Bereiche.
 */

// React-Typ-Import für die Kinder-Elemente (ReactNode)
import { type ReactNode } from 'react';

/**
 * Schnittstelle für die EmptyState-Eigenschaften
 */
interface EmptyStateProps {
  /** Icon, das im leeren Zustand angezeigt wird */
  icon: ReactNode;
  /** Überschrift für den leeren Zustand */
  title: string;
  /** Beschreibungstext, der dem Benutzer erklärt, warum der Bereich leer ist */
  description: string;
  /** Optionale Aktion (z.B. ein Button zum Erstellen neuer Inhalte) */
  action?: ReactNode;
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {/* Icon-Bereich: Visuelles Symbol für den leeren Zustand */}
      <div className="empty-state-icon">{icon}</div>
      {/* Überschrift */}
      <h3>{title}</h3>
      {/* Beschreibungstext */}
      <p>{description}</p>
      {/* Optionaler Aktionsbereich, z.B. "Neue Seite erstellen"-Button */}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
