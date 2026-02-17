/**
 * EditorToolbar-Komponente (Editor-Werkzeugleiste)
 *
 * Stellt eine Werkzeugleiste für den Texteditor bereit, mit der Benutzer
 * Formatierungen auf Markdown- oder HTML-Inhalte anwenden können.
 *
 * Funktionen:
 * - Textformatierung: Fett, Kursiv, Überschriften (H1-H3)
 * - Listen: Aufzählung und Nummerierung
 * - Blöcke: Zitate, Code (inline und Block)
 * - Medien: Links, Bilder, horizontale Linie, Tabelle
 * - Tastaturkürzel: Strg/Cmd+B (Fett), Strg/Cmd+I (Kursiv)
 * - Unterstützung für Markdown und HTML-Inhaltstypen
 */

// Typ-Import für Lucide-Icons
import type { LucideIcon } from 'lucide-react';

// Editor-Werkzeugleisten-Icons
import {
  Bold, Italic, Link as LinkIcon, Image, List, ListOrdered,
  Code, Quote, Minus, Heading1, Heading2, Heading3,
} from 'lucide-react';

// Internationalisierung
import { useLanguage } from '../context/LanguageContext';

/**
 * Schnittstelle für die EditorToolbar-Eigenschaften
 */
interface EditorToolbarProps {
  /** Referenz auf das Textarea-Element, in dem der Text bearbeitet wird */
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  /** Inhaltstyp: 'markdown' oder 'html' – bestimmt die Formatierungssyntax */
  contentType: 'markdown' | 'html';
  /** Callback-Funktion, die bei Textänderungen aufgerufen wird */
  onUpdate: (value: string) => void;
}

export default function EditorToolbar({ textareaRef, contentType, onUpdate }: EditorToolbarProps) {
  const { t } = useLanguage();

  /**
   * Umschließt den ausgewählten Text mit Vor- und Nachzeichen.
   * Wird für inline-Formatierungen wie Fett, Kursiv, Code usw. verwendet.
   */
  const wrap = (before: string, after: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    // Fallback auf 'text', wenn nichts ausgewählt ist
    const selected = ta.value.substring(start, end) || 'text';
    const newText = ta.value.substring(0, start) + before + selected + after + ta.value.substring(end);
    onUpdate(newText);
    // Cursor nach der Einfügung neu positionieren
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = start + before.length;
      ta.selectionEnd = start + before.length + selected.length;
    }, 0);
  };

  /**
   * Fügt ein Präfix am Anfang der aktuellen Zeile ein.
   * Wird für Überschriften, Listenpunkte und Zitate verwendet.
   */
  const insertLine = (prefix: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    // Zeilenanfang finden
    const lineStart = ta.value.lastIndexOf('\n', start - 1) + 1;
    const newText = ta.value.substring(0, lineStart) + prefix + ta.value.substring(lineStart);
    onUpdate(newText);
    // Cursor hinter dem eingefügten Präfix positionieren
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + prefix.length;
    }, 0);
  };

  /**
   * Fügt einen Block-Inhalt an der Cursorposition ein.
   * Wird für Codeblöcke, Bilder, horizontale Linien und Tabellen verwendet.
   */
  const insertBlock = (block: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    // Zeilenumbruch voranstellen, falls nötig
    const before = start > 0 && ta.value[start - 1] !== '\n' ? '\n' : '';
    const newText = ta.value.substring(0, start) + before + block + ta.value.substring(start);
    onUpdate(newText);
    // Cursor ans Ende des eingefügten Blocks setzen
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + before.length + block.length;
    }, 0);
  };

  // Kurzform: Prüft ob der Inhaltstyp Markdown ist
  const md = contentType === 'markdown';

  // Definition aller Werkzeugleisten-Aktionen mit Icons, Titeln und zugehörigen Funktionen
  // Trenner werden mit { sep: true } dargestellt
  const actions: ({ icon?: LucideIcon; text?: string; title: string; action: () => void } | { sep: true })[] = [
    // Textformatierung: Fett und Kursiv
    { icon: Bold, title: t('toolbar.bold'), action: () => wrap(md ? '**' : '<strong>', md ? '**' : '</strong>') },
    { icon: Italic, title: t('toolbar.italic'), action: () => wrap(md ? '_' : '<em>', md ? '_' : '</em>') },
    { sep: true },
    // Überschriften: H1, H2, H3
    { icon: Heading1, title: t('toolbar.h1'), action: () => md ? insertLine('# ') : wrap('<h1>', '</h1>') },
    { icon: Heading2, title: t('toolbar.h2'), action: () => md ? insertLine('## ') : wrap('<h2>', '</h2>') },
    { icon: Heading3, title: t('toolbar.h3'), action: () => md ? insertLine('### ') : wrap('<h3>', '</h3>') },
    { sep: true },
    // Listen und Zitate
    { icon: List, title: t('toolbar.ul'), action: () => md ? insertLine('- ') : insertLine('<li>') },
    { icon: ListOrdered, title: t('toolbar.ol'), action: () => md ? insertLine('1. ') : insertLine('<li>') },
    { icon: Quote, title: t('toolbar.quote'), action: () => md ? insertLine('> ') : wrap('<blockquote>', '</blockquote>') },
    { sep: true },
    // Code: Inline und Block
    { icon: Code, title: t('toolbar.code'), action: () => wrap(md ? '`' : '<code>', md ? '`' : '</code>') },
    {
      text: '{ }', title: t('toolbar.codeblock'), action: () =>
        insertBlock(md ? '```\ncode\n```\n' : '<pre><code>\ncode\n</code></pre>\n'),
    },
    { sep: true },
    // Medien: Link, Bild, horizontale Linie und Tabelle
    {
      icon: LinkIcon, title: t('toolbar.link'), action: () => {
        const url = prompt(t('toolbar.link_prompt'));
        if (url) wrap(md ? '[' : `<a href="${url}">`, md ? `](${url})` : '</a>');
      },
    },
    {
      icon: Image, title: t('toolbar.image'), action: () => {
        const url = prompt(t('toolbar.image_prompt'));
        if (url) insertBlock(md ? `![Bild](${url})\n` : `<img src="${url}" alt="Bild" />\n`);
      },
    },
    { icon: Minus, title: t('toolbar.hr'), action: () => insertBlock(md ? '\n---\n' : '\n<hr />\n') },
    {
      text: '⊞', title: t('toolbar.table'), action: () =>
        insertBlock(
          md
            ? '\n| Header | Header |\n|--------|--------|\n| Cell   | Cell   |\n'
            : '\n<table>\n  <tr><th>Header</th><th>Header</th></tr>\n  <tr><td>Cell</td><td>Cell</td></tr>\n</table>\n',
        ),
    },
  ];

  /**
   * Tastaturkürzel-Handler für das Textarea-Element.
   * Strg/Cmd+B = Fett, Strg/Cmd+I = Kursiv
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
      e.preventDefault();
      wrap(md ? '**' : '<strong>', md ? '**' : '</strong>');
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
      e.preventDefault();
      wrap(md ? '_' : '<em>', md ? '_' : '</em>');
    }
  };

  // Attach keyboard shortcuts to textarea
  // Tastaturkürzel an das Textarea-Element anhängen (einmalig)
  const ta = textareaRef.current;
  if (ta && !(ta as any).__toolbar_attached) {
    (ta as any).__toolbar_attached = true;
    ta.addEventListener('keydown', handleKeyDown as any);
  }

  return (
    <div className="editor-toolbar">
      {/* Werkzeugleisten-Elemente rendern: Trenner oder Aktionsbuttons */}
      {actions.map((item, i) =>
        'sep' in item ? (
          // Visueller Trenner zwischen Buttongruppen
          <div key={i} className="editor-toolbar-sep" />
        ) : (
          // Einzelner Werkzeugleisten-Button
          <button
            key={i}
            type="button"
            className="editor-toolbar-btn"
            onClick={item.action}
            title={item.title}
          >
            {/* Icon-basierter Button */}
            {item.icon && <item.icon size={15} strokeWidth={2} />}
            {/* Text-basierter Button (z.B. für Codeblock und Tabelle) */}
            {item.text && <span className="toolbar-text">{item.text}</span>}
          </button>
        ),
      )}
    </div>
  );
}
