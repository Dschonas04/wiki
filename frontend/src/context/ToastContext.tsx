/**
 * ToastContext.tsx – Toast-Benachrichtigungssystem
 *
 * Stellt ein globales Benachrichtigungssystem für die gesamte Anwendung bereit.
 * Toast-Nachrichten werden als temporäre Hinweise am Bildschirmrand angezeigt
 * und verschwinden automatisch nach 4 Sekunden.
 *
 * Unterstützte Typen:
 * - success: Erfolgsmeldung (grünes Häkchen)
 * - error: Fehlermeldung (rotes Ausrufezeichen)
 * - info: Informationsmeldung (blaues Info-Symbol)
 */

// React-Hooks und Typen für Kontextverwaltung importieren
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
// Lucide-Icons für die Toast-Typen importieren
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

// Typdefinition für die verfügbaren Toast-Typen
type ToastType = 'success' | 'error' | 'info';

/**
 * Toast – Einzelne Benachrichtigung
 *
 * Repräsentiert eine angezeigte Toast-Nachricht mit eindeutiger ID.
 */
interface Toast {
  /** Eindeutige Kennung der Benachrichtigung */
  id: number;
  /** Anzuzeigende Nachricht */
  message: string;
  /** Typ der Benachrichtigung (bestimmt Farbe und Icon) */
  type: ToastType;
}

/**
 * ToastContextType – Typdefinition für den Toast-Kontext
 *
 * Stellt die showToast-Funktion für alle Komponenten bereit.
 */
interface ToastContextType {
  /** Funktion zum Anzeigen einer neuen Toast-Benachrichtigung */
  showToast: (message: string, type?: ToastType) => void;
}

// Toast-Kontext mit Standardwert undefined erstellen
const ToastContext = createContext<ToastContextType | undefined>(undefined);

// Fortlaufender Zähler für eindeutige Toast-IDs (wird nie zurückgesetzt)
let toastId = 0;

/**
 * ToastProvider – Provider-Komponente für das Benachrichtigungssystem
 *
 * Verwaltet die Liste aktiver Toast-Nachrichten und rendert diese
 * in einem Container-Element am Bildschirmrand.
 *
 * @param children - Kind-Komponenten, die Zugriff auf showToast erhalten
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  // Liste der aktuell angezeigten Toast-Benachrichtigungen
  const [toasts, setToasts] = useState<Toast[]>([]);

  /**
   * showToast – Neue Toast-Benachrichtigung anzeigen
   *
   * Erstellt eine neue Benachrichtigung mit eindeutiger ID und fügt sie
   * zur Liste hinzu. Nach 4 Sekunden wird die Benachrichtigung automatisch entfernt.
   *
   * @param message - Die anzuzeigende Nachricht
   * @param type - Typ der Benachrichtigung (Standard: 'info')
   */
  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    // Eindeutige ID generieren durch Inkrementierung des globalen Zählers
    const id = ++toastId;
    // Neue Benachrichtigung zur Liste hinzufügen
    setToasts((prev) => [...prev, { id, message, type }]);
    // Timer für automatisches Entfernen nach 4 Sekunden starten
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  /**
   * removeToast – Toast-Benachrichtigung manuell entfernen
   *
   * Ermöglicht dem Benutzer, eine Benachrichtigung vor Ablauf des Timers zu schließen.
   *
   * @param id - ID der zu entfernenden Benachrichtigung
   */
  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Icon-Zuordnung für die verschiedenen Toast-Typen
  const icons = {
    success: <CheckCircle size={18} />,  // Grünes Häkchen für Erfolg
    error: <AlertCircle size={18} />,    // Rotes Ausrufezeichen für Fehler
    info: <Info size={18} />,            // Blaues Info-Symbol für Informationen
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Toast-Container: Feste Position am Bildschirmrand für alle Benachrichtigungen */}
      <div className="toast-container">
        {toasts.map((toast) => (
          // Jeder Toast erhält eine CSS-Klasse basierend auf seinem Typ für die Darstellung
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            {/* Icon passend zum Toast-Typ */}
            <span className="toast-icon">{icons[toast.type]}</span>
            {/* Nachrichtentext */}
            <span className="toast-message">{toast.message}</span>
            {/* Schließen-Button zum manuellen Entfernen der Benachrichtigung */}
            <button className="toast-close" onClick={() => removeToast(toast.id)}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * useToast – Hook zum Zugriff auf das Benachrichtigungssystem
 *
 * Ermöglicht den einfachen Zugriff auf die showToast-Funktion
 * in jeder Komponente innerhalb des ToastProviders.
 *
 * Beispielverwendung:
 *   const { showToast } = useToast();
 *   showToast('Seite gespeichert!', 'success');
 *
 * @throws Fehler wenn der Hook außerhalb des ToastProviders verwendet wird
 * @returns Objekt mit der showToast-Funktion
 */
export function useToast() {
  const ctx = useContext(ToastContext);
  // Sicherheitsprüfung: Hook darf nur innerhalb des ToastProviders verwendet werden
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
