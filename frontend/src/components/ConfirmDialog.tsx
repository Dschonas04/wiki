/**
 * ConfirmDialog-Komponente (Bestätigungsdialog)
 *
 * Ein modaler Dialog, der den Benutzer zur Bestätigung einer Aktion auffordert.
 * Unterstützt verschiedene Varianten (Gefahr, Warnung, Information) mit
 * entsprechenden visuellen Stilen. Wird z.B. beim Löschen oder bei
 * kritischen Aktionen verwendet.
 */

// Icons für das Warnsymbol und den Schließen-Button
import { AlertTriangle, X } from 'lucide-react';

// Internationalisierung
import { useLanguage } from '../context/LanguageContext';

/**
 * Schnittstelle für die ConfirmDialog-Eigenschaften
 */
interface ConfirmDialogProps {
  /** Titel des Bestätigungsdialogs */
  title: string;
  /** Nachricht, die dem Benutzer die anstehende Aktion erklärt */
  message: string;
  /** Beschriftung des Bestätigungsbuttons (Standard: 'Confirm') */
  confirmLabel?: string;
  /** Beschriftung des Abbrechen-Buttons (Standard: 'Cancel') */
  cancelLabel?: string;
  /** Visuelle Variante: 'danger' (Gefahr), 'warning' (Warnung) oder 'info' (Information) */
  variant?: 'danger' | 'warning' | 'info';
  /** Callback-Funktion, die bei Bestätigung aufgerufen wird */
  onConfirm: () => void;
  /** Callback-Funktion, die beim Abbrechen aufgerufen wird */
  onCancel: () => void;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useLanguage();
  const resolvedConfirmLabel = confirmLabel ?? t('confirm.default_confirm');
  const resolvedCancelLabel = cancelLabel ?? t('confirm.default_cancel');
  return (
    // Overlay: Schließt den Dialog beim Klick auf den Hintergrund
    <div className="confirm-overlay" onClick={onCancel}>
      {/* Dialog-Fenster: Verhindert Schließen beim Klick innerhalb des Dialogs */}
      <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
        {/* Schließen-Button oben rechts */}
        <button className="confirm-close" onClick={onCancel}>
          <X size={18} />
        </button>
        {/* Warnsymbol mit variantenabhängiger Farbe */}
        <div className={`confirm-icon ${variant}`}>
          <AlertTriangle size={28} />
        </div>
        {/* Dialog-Titel */}
        <h3 className="confirm-title">{title}</h3>
        {/* Dialog-Nachricht */}
        <p className="confirm-message">{message}</p>
        {/* Aktionsbereich: Abbrechen- und Bestätigungsbutton */}
        <div className="confirm-actions">
          <button className="btn btn-secondary" onClick={onCancel}>
            {resolvedCancelLabel}
          </button>
          {/* Bestätigungsbutton: CSS-Klasse variiert je nach Variante */}
          <button
            className={`btn ${variant === 'danger' ? 'btn-danger' : variant === 'warning' ? 'btn-warning' : 'btn-primary'}`}
            onClick={onConfirm}
            autoFocus
          >
            {resolvedConfirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
