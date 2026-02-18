/**
 * BlockEditor – Tiptap-basierter WYSIWYG Block-Editor (à la Notion)
 *
 * Features:
 * - Rich-Text-Bearbeitung mit Toolbar
 * - Slash-Commands (/) für schnelle Block-Einfügung
 * - Tastaturkürzel (Ctrl+B, Ctrl+I, etc.)
 * - Tabellen, Aufgabenlisten, Code-Blöcke
 * - Bilder, Links, Highlights
 */

import { useEffect, useCallback, useState, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Underline from '@tiptap/extension-underline';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Color from '@tiptap/extension-color';
import TextStyle from '@tiptap/extension-text-style';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, Heading3,
  List, ListOrdered, ListChecks,
  Quote, Code, Code2,
  Link as LinkIcon, Image as ImageIcon,
  Table as TableIcon, Minus,
  AlignLeft, AlignCenter, AlignRight,
  Highlighter, Undo2, Redo2, Type,
  Pilcrow
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface BlockEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  editable?: boolean;
}

// Slash-Command Konfiguration
const SLASH_COMMANDS = [
  { id: 'h1', label: 'Überschrift 1', icon: '𝐇₁', action: (e: any) => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { id: 'h2', label: 'Überschrift 2', icon: '𝐇₂', action: (e: any) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { id: 'h3', label: 'Überschrift 3', icon: '𝐇₃', action: (e: any) => e.chain().focus().toggleHeading({ level: 3 }).run() },
  { id: 'bullet', label: 'Aufzählung', icon: '•', action: (e: any) => e.chain().focus().toggleBulletList().run() },
  { id: 'ordered', label: 'Nummerierte Liste', icon: '1.', action: (e: any) => e.chain().focus().toggleOrderedList().run() },
  { id: 'task', label: 'Aufgabenliste', icon: '☑', action: (e: any) => e.chain().focus().toggleTaskList().run() },
  { id: 'quote', label: 'Zitat', icon: '❝', action: (e: any) => e.chain().focus().toggleBlockquote().run() },
  { id: 'code', label: 'Codeblock', icon: '</>', action: (e: any) => e.chain().focus().toggleCodeBlock().run() },
  { id: 'hr', label: 'Trennlinie', icon: '—', action: (e: any) => e.chain().focus().setHorizontalRule().run() },
  { id: 'table', label: 'Tabelle', icon: '⊞', action: (e: any) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { id: 'image', label: 'Bild (URL)', icon: '🖼', action: null }, // handled separately
];

/** Prüft ob eine URL ein sicheres Protokoll verwendet */
const isValidUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol);
  } catch {
    return false;
  }
};

export default function BlockEditor({ content, onChange, placeholder, editable = true }: BlockEditorProps) {
  const { t } = useLanguage();
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const slashRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
      }),
      Placeholder.configure({
        placeholder: placeholder || t('blockeditor.placeholder'),
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'editor-link' },
      }),
      Image.configure({
        HTMLAttributes: { class: 'editor-image' },
      }),
      Underline,
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      TextStyle,
      Color,
    ],
    content,
    editable,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'block-editor-content',
      },
      handleKeyDown: (_view, event) => {
        // Slash commands
        if (event.key === '/' && !slashOpen) {
          setTimeout(() => {
            setSlashOpen(true);
            setSlashFilter('');
            setSlashIndex(0);
          }, 10);
          return false;
        }
        if (slashOpen) {
          if (event.key === 'Escape') {
            setSlashOpen(false);
            return true;
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setSlashIndex(prev => Math.min(prev + 1, filteredCommands.length - 1));
            return true;
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            setSlashIndex(prev => Math.max(prev - 1, 0));
            return true;
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            executeSlashCommand(slashIndex);
            return true;
          }
          if (event.key === 'Backspace' && slashFilter === '') {
            setSlashOpen(false);
            return false;
          }
        }
        return false;
      },
    },
  });

  // Sync content from parent
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, false);
    }
  }, [content, editor]);

  // Track slash filter
  useEffect(() => {
    if (!slashOpen || !editor) return;
    const handler = (e: KeyboardEvent) => {
      if (/^[a-zA-Z0-9äöüÄÖÜß]$/.test(e.key)) {
        setSlashFilter(prev => prev + e.key);
      } else if (e.key === 'Backspace') {
        setSlashFilter(prev => {
          if (prev.length === 0) {
            setSlashOpen(false);
            return '';
          }
          return prev.slice(0, -1);
        });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [slashOpen, editor]);

  const filteredCommands = SLASH_COMMANDS.filter(cmd =>
    cmd.label.toLowerCase().includes(slashFilter.toLowerCase())
  );

  const executeSlashCommand = useCallback((index: number) => {
    if (!editor) return;
    const cmd = filteredCommands[index];
    if (!cmd) return;

    // Delete the "/" and filter text
    const deleteCount = 1 + slashFilter.length;
    for (let i = 0; i < deleteCount; i++) {
      editor.commands.deleteRange({
        from: editor.state.selection.from - 1,
        to: editor.state.selection.from,
      });
    }

    if (cmd.id === 'image') {
      const url = window.prompt('Bild-URL eingeben:');
      if (url && isValidUrl(url)) editor.chain().focus().setImage({ src: url }).run();
    } else if (cmd.action) {
      cmd.action(editor);
    }

    setSlashOpen(false);
    setSlashFilter('');
  }, [editor, filteredCommands, slashFilter]);

  // Close slash menu on click outside
  useEffect(() => {
    if (!slashOpen) return;
    const handler = (e: MouseEvent) => {
      if (slashRef.current && !slashRef.current.contains(e.target as Node)) {
        setSlashOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [slashOpen]);

  if (!editor) return null;

  const setLink = () => {
    const url = window.prompt('URL eingeben:', editor.getAttributes('link').href || 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().unsetLink().run();
    } else if (isValidUrl(url)) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  const addImage = () => {
    const url = window.prompt('Bild-URL eingeben:');
    if (url && isValidUrl(url)) editor.chain().focus().setImage({ src: url }).run();
  };

  const ToolBtn = ({ onClick, active, title, children }: {
    onClick: () => void; active?: boolean; title: string; children: React.ReactNode;
  }) => (
    <button
      type="button"
      className={`be-tool-btn ${active ? 'active' : ''}`}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );

  const Divider = () => <div className="be-tool-divider" />;

  return (
    <div className="block-editor-wrapper">
      {/* Toolbar */}
      <div className="be-toolbar">
        <div className="be-toolbar-group">
          <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Fett (Ctrl+B)">
            <Bold size={15} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Kursiv (Ctrl+I)">
            <Italic size={15} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Unterstrichen (Ctrl+U)">
            <UnderlineIcon size={15} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Durchgestrichen">
            <Strikethrough size={15} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive('highlight')} title="Hervorheben">
            <Highlighter size={15} />
          </ToolBtn>
        </div>

        <Divider />

        <div className="be-toolbar-group">
          <ToolBtn onClick={() => editor.chain().focus().setParagraph().run()} active={editor.isActive('paragraph')} title="Absatz">
            <Pilcrow size={15} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="Überschrift 1">
            <Heading1 size={15} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Überschrift 2">
            <Heading2 size={15} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Überschrift 3">
            <Heading3 size={15} />
          </ToolBtn>
        </div>

        <Divider />

        <div className="be-toolbar-group">
          <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Aufzählung">
            <List size={15} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Nummerierte Liste">
            <ListOrdered size={15} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleTaskList().run()} active={editor.isActive('taskList')} title="Aufgabenliste">
            <ListChecks size={15} />
          </ToolBtn>
        </div>

        <Divider />

        <div className="be-toolbar-group">
          <ToolBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Zitat">
            <Quote size={15} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} title="Inline-Code">
            <Code size={15} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="Codeblock">
            <Code2 size={15} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Trennlinie">
            <Minus size={15} />
          </ToolBtn>
        </div>

        <Divider />

        <div className="be-toolbar-group">
          <ToolBtn onClick={setLink} active={editor.isActive('link')} title="Link">
            <LinkIcon size={15} />
          </ToolBtn>
          <ToolBtn onClick={addImage} title="Bild einfügen">
            <ImageIcon size={15} />
          </ToolBtn>
          <ToolBtn
            onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            title="Tabelle einfügen"
          >
            <TableIcon size={15} />
          </ToolBtn>
        </div>

        <Divider />

        <div className="be-toolbar-group">
          <ToolBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Links">
            <AlignLeft size={15} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Zentriert">
            <AlignCenter size={15} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Rechts">
            <AlignRight size={15} />
          </ToolBtn>
        </div>

        <Divider />

        <div className="be-toolbar-group">
          <ToolBtn onClick={() => editor.chain().focus().undo().run()} title="Rückgängig (Ctrl+Z)">
            <Undo2 size={15} />
          </ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().redo().run()} title="Wiederholen (Ctrl+Shift+Z)">
            <Redo2 size={15} />
          </ToolBtn>
        </div>
      </div>

      {/* Editor Content */}
      <div className="be-editor-area">
        <EditorContent editor={editor} />

        {/* Slash Commands Popup */}
        {slashOpen && filteredCommands.length > 0 && (
          <div className="be-slash-menu" ref={slashRef}>
            <div className="be-slash-header">Blöcke einfügen</div>
            {filteredCommands.map((cmd, i) => (
              <button
                key={cmd.id}
                className={`be-slash-item ${i === slashIndex ? 'active' : ''}`}
                onClick={() => executeSlashCommand(i)}
                onMouseEnter={() => setSlashIndex(i)}
              >
                <span className="be-slash-icon">{cmd.icon}</span>
                <span className="be-slash-label">{cmd.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
