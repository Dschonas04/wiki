import type { LucideIcon } from 'lucide-react';
import {
  Bold, Italic, Link as LinkIcon, Image, List, ListOrdered,
  Code, Quote, Minus, Heading1, Heading2, Heading3,
} from 'lucide-react';

interface EditorToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  contentType: 'markdown' | 'html';
  onUpdate: (value: string) => void;
}

export default function EditorToolbar({ textareaRef, contentType, onUpdate }: EditorToolbarProps) {
  const wrap = (before: string, after: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = ta.value.substring(start, end) || 'text';
    const newText = ta.value.substring(0, start) + before + selected + after + ta.value.substring(end);
    onUpdate(newText);
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = start + before.length;
      ta.selectionEnd = start + before.length + selected.length;
    }, 0);
  };

  const insertLine = (prefix: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const lineStart = ta.value.lastIndexOf('\n', start - 1) + 1;
    const newText = ta.value.substring(0, lineStart) + prefix + ta.value.substring(lineStart);
    onUpdate(newText);
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + prefix.length;
    }, 0);
  };

  const insertBlock = (block: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const before = start > 0 && ta.value[start - 1] !== '\n' ? '\n' : '';
    const newText = ta.value.substring(0, start) + before + block + ta.value.substring(start);
    onUpdate(newText);
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + before.length + block.length;
    }, 0);
  };

  const md = contentType === 'markdown';

  const actions: ({ icon?: LucideIcon; text?: string; title: string; action: () => void } | { sep: true })[] = [
    { icon: Bold, title: 'Bold (Ctrl+B)', action: () => wrap(md ? '**' : '<strong>', md ? '**' : '</strong>') },
    { icon: Italic, title: 'Italic (Ctrl+I)', action: () => wrap(md ? '_' : '<em>', md ? '_' : '</em>') },
    { sep: true },
    { icon: Heading1, title: 'Heading 1', action: () => md ? insertLine('# ') : wrap('<h1>', '</h1>') },
    { icon: Heading2, title: 'Heading 2', action: () => md ? insertLine('## ') : wrap('<h2>', '</h2>') },
    { icon: Heading3, title: 'Heading 3', action: () => md ? insertLine('### ') : wrap('<h3>', '</h3>') },
    { sep: true },
    { icon: List, title: 'Bullet List', action: () => md ? insertLine('- ') : insertLine('<li>') },
    { icon: ListOrdered, title: 'Numbered List', action: () => md ? insertLine('1. ') : insertLine('<li>') },
    { icon: Quote, title: 'Quote', action: () => md ? insertLine('> ') : wrap('<blockquote>', '</blockquote>') },
    { sep: true },
    { icon: Code, title: 'Inline Code', action: () => wrap(md ? '`' : '<code>', md ? '`' : '</code>') },
    {
      text: '{ }', title: 'Code Block', action: () =>
        insertBlock(md ? '```\ncode\n```\n' : '<pre><code>\ncode\n</code></pre>\n'),
    },
    { sep: true },
    {
      icon: LinkIcon, title: 'Link', action: () => {
        const url = prompt('Enter URL:');
        if (url) wrap(md ? '[' : `<a href="${url}">`, md ? `](${url})` : '</a>');
      },
    },
    {
      icon: Image, title: 'Image', action: () => {
        const url = prompt('Enter image URL:');
        if (url) insertBlock(md ? `![Image](${url})\n` : `<img src="${url}" alt="Image" />\n`);
      },
    },
    { icon: Minus, title: 'Horizontal Rule', action: () => insertBlock(md ? '\n---\n' : '\n<hr />\n') },
    {
      text: '⊞', title: 'Table', action: () =>
        insertBlock(
          md
            ? '\n| Header | Header |\n|--------|--------|\n| Cell   | Cell   |\n'
            : '\n<table>\n  <tr><th>Header</th><th>Header</th></tr>\n  <tr><td>Cell</td><td>Cell</td></tr>\n</table>\n',
        ),
    },
  ];

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
  const ta = textareaRef.current;
  if (ta && !(ta as any).__toolbar_attached) {
    (ta as any).__toolbar_attached = true;
    ta.addEventListener('keydown', handleKeyDown as any);
  }

  return (
    <div className="editor-toolbar">
      {actions.map((item, i) =>
        'sep' in item ? (
          <div key={i} className="editor-toolbar-sep" />
        ) : (
          <button
            key={i}
            type="button"
            className="editor-toolbar-btn"
            onClick={item.action}
            title={item.title}
          >
            {item.icon && <item.icon size={15} strokeWidth={2} />}
            {item.text && <span className="toolbar-text">{item.text}</span>}
          </button>
        ),
      )}
    </div>
  );
}
