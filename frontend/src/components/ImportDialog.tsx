/**
 * ImportDialog-Komponente (Import-Dialog für Wiki-Seiten)
 *
 * Ermöglicht das Importieren von Dateien als neue Wiki-Seiten.
 * Unterstützte Formate: Markdown (.md), HTML (.html) und
 * Textdateien (.txt). Der Dateiname wird automatisch als
 * Seitentitel verwendet.
 *
 * Funktionen:
 * - Drag-and-Drop Dateiauswahl
 * - Automatische Erkennung des Inhaltstyps anhand der Dateiendung
 * - Anzeige des Importstatus für jede Datei
 * - Massenimport mehrerer Dateien gleichzeitig
 */

// React-Hooks für Zustand und Referenzen
import { useState, useRef } from 'react';

// Icons für den Import-Dialog
import { X, Upload, FileText, Code, AlignLeft } from 'lucide-react';

// API-Client für die Server-Kommunikation
import { api } from '../api/client';

// Toast-Benachrichtigungen für Erfolgs-/Fehlermeldungen
import { useToast } from '../context/ToastContext';

// Internationalisierung
import { useLanguage } from '../context/LanguageContext';

/**
 * Schnittstelle für die ImportDialog-Eigenschaften
 */
interface ImportDialogProps {
  /** Callback-Funktion zum Schließen des Dialogs */
  onClose: () => void;
  /** Callback-Funktion, die nach erfolgreichem Import aufgerufen wird */
  onImported: () => void;
}

export default function ImportDialog({ onClose, onImported }: ImportDialogProps) {
  // Ausgewählte Dateien für den Import
  const [files, setFiles] = useState<File[]>([]);
  // Importvorgang läuft gerade
  const [importing, setImporting] = useState(false);
  // Ergebnisse des Imports pro Datei (Erfolg/Fehler)
  const [results, setResults] = useState<{ name: string; ok: boolean; error?: string }[]>([]);
  // Referenz auf das versteckte Datei-Eingabefeld
  const fileRef = useRef<HTMLInputElement>(null);
  // Toast-Benachrichtigungsfunktion
  const { showToast } = useToast();
  // Übersetzungsfunktion
  const { t } = useLanguage();

  // Dateien aus dem Eingabefeld übernehmen und Ergebnisse zurücksetzen
  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
      setResults([]);
    }
  };

  /**
   * Erkennt den Inhaltstyp anhand der Dateiendung.
   * HTML/HTM-Dateien werden als 'html' erkannt, alles andere als 'markdown'.
   */
  const detectType = (name: string): 'markdown' | 'html' => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'html' || ext === 'htm') return 'html';
    return 'markdown';
  };

  /**
   * Erzeugt einen Seitentitel aus dem Dateinamen.
   * Entfernt die Dateiendung, ersetzt Bindestriche/Unterstriche durch
   * Leerzeichen und setzt Wortanfänge groß.
   */
  const titleFromName = (name: string) =>
    name
      .replace(/\.(md|markdown|html|htm|txt|text)$/i, '')
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());

  /**
   * Importiert alle ausgewählten Dateien nacheinander.
   * Für jede Datei wird der Inhalt gelesen, der Typ erkannt und
   * eine neue Wiki-Seite über die API erstellt.
   */
  const handleImport = async () => {
    if (files.length === 0) return;
    setImporting(true);
    const newResults: typeof results = [];

    // Dateien sequentiell importieren
    for (const file of files) {
      try {
        const content = await file.text();
        const contentType = detectType(file.name);
        const title = titleFromName(file.name);
        await api.createPage({ title, content, contentType });
        newResults.push({ name: file.name, ok: true });
      } catch (err: any) {
        newResults.push({ name: file.name, ok: false, error: err.message });
      }
    }

    setResults(newResults);
    setImporting(false);
    // Erfolgsmeldung anzeigen, wenn mindestens eine Datei importiert wurde
    const success = newResults.filter((r) => r.ok).length;
    if (success > 0) {
      showToast(t('import.success', { count: success }), 'success');
      onImported();
    }
  };

  /**
   * Gibt das passende Icon für eine Datei basierend auf der Endung zurück.
   * HTML = Code-Icon, Markdown = FileText-Icon, sonst = AlignLeft-Icon
   */
  const getIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'html' || ext === 'htm') return <Code size={16} />;
    if (ext === 'md' || ext === 'markdown') return <FileText size={16} />;
    return <AlignLeft size={16} />;
  };

  return (
    // Overlay: Schließt den Dialog beim Klick auf den Hintergrund
    <div className="modal-overlay" onClick={onClose}>
      {/* Dialog-Fenster: Verhindert Schließen beim Klick innerhalb */}
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Dialog-Kopfbereich mit Titel und Schließen-Button */}
        <div className="modal-header">
          <h3>
            <Upload size={18} /> {t('import.title')}
          </h3>
          <button className="icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {/* Erklärungstext für unterstützte Dateiformate */}
          <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: 16 }}>
            {t('import.desc')}
          </p>

          {/* Drag-and-Drop-Bereich für die Dateiauswahl */}
          <div
            className="import-dropzone"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.classList.add('dragover');
            }}
            onDragLeave={(e) => e.currentTarget.classList.remove('dragover')}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove('dragover');
              if (e.dataTransfer.files.length) {
                setFiles(Array.from(e.dataTransfer.files));
                setResults([]);
              }
            }}
          >
            <Upload size={32} />
            <span>{t('import.drop')}</span>
            <span className="text-muted" style={{ fontSize: '0.78rem' }}>
              .md, .html, .txt
            </span>
          </div>

          {/* Verstecktes Datei-Eingabefeld (wird durch die Dropzone ausgelöst) */}
          <input
            ref={fileRef}
            type="file"
            accept=".md,.markdown,.html,.htm,.txt,.text"
            multiple
            onChange={handleFiles}
            style={{ display: 'none' }}
          />

          {/* Dateiliste: Zeigt die ausgewählten Dateien mit Icon, Name, Typ und Status an */}
          {files.length > 0 && (
            <div className="import-file-list">
              {files.map((f, i) => (
                <div key={i} className="import-file-item">
                  {getIcon(f.name)}
                  <span className="import-file-name">{f.name}</span>
                  <span className="import-file-type">{detectType(f.name)}</span>
                  {/* Importstatus: Häkchen für Erfolg, Kreuz mit Fehlermeldung bei Fehler */}
                  {results[i] && (
                    <span
                      className={`import-file-status ${results[i].ok ? 'success' : 'error'}`}
                    >
                      {results[i].ok ? '✓' : '✗ ' + results[i].error}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Dialog-Fußbereich mit Schließen- und Import-Button */}
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            {t('common.close')}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleImport}
            disabled={files.length === 0 || importing}
          >
            <Upload size={16} />
            {/* Dynamischer Buttontext: Zeigt "Importing…" während des Imports */}
            {importing
              ? t('import.importing')
              : t('import.btn', { count: files.length })}
          </button>
        </div>
      </div>
    </div>
  );
}
