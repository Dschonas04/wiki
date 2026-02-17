/**
 * html2pdf.d.ts – Typdefinitionen für die html2pdf.js-Bibliothek
 *
 * Diese Datei stellt TypeScript-Typen für die externe html2pdf.js-Bibliothek bereit,
 * die zur Konvertierung von HTML-Inhalten in PDF-Dateien verwendet wird.
 * Da die Bibliothek keine eigenen TypeScript-Definitionen enthält,
 * werden die Typen hier manuell deklariert.
 */
declare module 'html2pdf.js' {
  /**
   * Html2PdfOptions – Konfigurationsoptionen für die PDF-Generierung
   *
   * Steuert das Aussehen und die Formatierung des generierten PDF-Dokuments.
   */
  interface Html2PdfOptions {
    /** Seitenrand: einzelner Wert (alle Seiten gleich) oder Array [oben, rechts, unten, links] */
    margin?: number | number[];
    /** Dateiname der generierten PDF-Datei */
    filename?: string;
    /** Bildeinstellungen: Format (z.B. 'jpeg') und Qualität (0-1) */
    image?: { type?: string; quality?: number };
    /** Optionen für html2canvas – steuert die HTML-zu-Canvas-Konvertierung */
    html2canvas?: Record<string, unknown>;
    /** jsPDF-Optionen: Maßeinheit, Papierformat und Ausrichtung */
    jsPDF?: { unit?: string; format?: string; orientation?: string };
    /** Seitenumbruch-Einstellungen: Modus als Zeichenkette oder Array von Modi */
    pagebreak?: { mode?: string | string[] };
    /** Ob Hyperlinks im PDF klickbar sein sollen */
    enableLinks?: boolean;
  }

  /**
   * Html2PdfInstance – Instanz des html2pdf-Generators
   *
   * Bietet eine verkettbare (Fluent-)API zum Konfigurieren und
   * Ausführen der PDF-Generierung.
   */
  interface Html2PdfInstance {
    /**
     * Optionen für die PDF-Generierung festlegen
     * @param options - Konfigurationsobjekt
     * @returns Die Instanz für Methodenverkettung
     */
    set(options: Html2PdfOptions): Html2PdfInstance;
    /**
     * Quell-HTML-Element oder HTML-String festlegen
     * @param element - Das zu konvertierende HTML-Element oder ein HTML-String
     * @returns Die Instanz für Methodenverkettung
     */
    from(element: HTMLElement | string): Html2PdfInstance;
    /**
     * PDF generieren und als Datei herunterladen
     * @returns Promise das nach dem Speichern aufgelöst wird
     */
    save(): Promise<void>;
    /**
     * HTML in PDF konvertieren (ohne Speichern)
     * @returns Die Instanz für Methodenverkettung
     */
    toPdf(): Html2PdfInstance;
    /**
     * PDF in verschiedenen Formaten ausgeben
     * @param type - Ausgabeformat (z.B. 'blob', 'datauristring')
     * @returns Promise mit dem Ergebnis im angegebenen Format
     */
    output(type: string): Promise<unknown>;
  }

  /**
   * html2pdf – Einstiegsfunktion der Bibliothek
   *
   * Erstellt eine neue html2pdf-Instanz zum Konfigurieren und
   * Generieren von PDF-Dokumenten.
   *
   * @returns Neue Html2PdfInstance für die Methodenverkettung
   */
  function html2pdf(): Html2PdfInstance;
  export default html2pdf;
}
