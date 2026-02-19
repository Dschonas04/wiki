/**
 * PageHeader-Komponente (Seitenkopfbereich)
 *
 * Zeigt den Titel und optionalen Untertitel einer Seite an,
 * zusammen mit einem Aktionsbereich für Schaltflächen oder andere Steuerelemente.
 * Wird als einheitlicher Kopfbereich auf allen Seiten der Anwendung verwendet.
 */

// React-Typ-Import für die Kinder-Elemente (ReactNode)
import { type ReactNode } from 'react';

/**
 * Schnittstelle für die PageHeader-Eigenschaften
 */
interface PageHeaderProps {
  /** Haupttitel der Seite */
  title: string;
  /** Optionaler Untertitel unterhalb des Titels */
  subtitle?: string;
  /** Optionales Icon neben dem Titel */
  icon?: ReactNode;
  /** Optionale Aktionselemente (z.B. Schaltflächen) im rechten Bereich */
  actions?: ReactNode;
}

export default function PageHeader({ title, subtitle, icon, actions }: PageHeaderProps) {
  return (
    <div className="page-header">
      {/* Textbereich: Titel und optionaler Untertitel */}
      <div className="page-header-text">
        <h1>{icon && <span className="page-header-icon">{icon}</span>}{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {/* Aktionsbereich: Wird nur gerendert, wenn Aktionen übergeben wurden */}
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  );
}
