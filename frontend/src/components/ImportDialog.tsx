import { useState, useRef } from 'react';
import { X, Upload, FileText, Code, AlignLeft } from 'lucide-react';
import { api } from '../api/client';
import { useToast } from '../context/ToastContext';

interface ImportDialogProps {
  onClose: () => void;
  onImported: () => void;
}

export default function ImportDialog({ onClose, onImported }: ImportDialogProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<{ name: string; ok: boolean; error?: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
      setResults([]);
    }
  };

  const detectType = (name: string): 'markdown' | 'html' => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'html' || ext === 'htm') return 'html';
    return 'markdown';
  };

  const titleFromName = (name: string) =>
    name
      .replace(/\.(md|markdown|html|htm|txt|text)$/i, '')
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());

  const handleImport = async () => {
    if (files.length === 0) return;
    setImporting(true);
    const newResults: typeof results = [];

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
    const success = newResults.filter((r) => r.ok).length;
    if (success > 0) {
      showToast(`${success} page${success > 1 ? 's' : ''} imported!`, 'success');
      onImported();
    }
  };

  const getIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (ext === 'html' || ext === 'htm') return <Code size={16} />;
    if (ext === 'md' || ext === 'markdown') return <FileText size={16} />;
    return <AlignLeft size={16} />;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <Upload size={18} /> Import Pages
          </h3>
          <button className="icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: 16 }}>
            Import Markdown (.md), HTML (.html) or plain text (.txt) files as wiki pages.
            The filename becomes the page title.
          </p>

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
            <span>Click or drag files here</span>
            <span className="text-muted" style={{ fontSize: '0.78rem' }}>
              .md, .html, .txt
            </span>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".md,.markdown,.html,.htm,.txt,.text"
            multiple
            onChange={handleFiles}
            style={{ display: 'none' }}
          />

          {files.length > 0 && (
            <div className="import-file-list">
              {files.map((f, i) => (
                <div key={i} className="import-file-item">
                  {getIcon(f.name)}
                  <span className="import-file-name">{f.name}</span>
                  <span className="import-file-type">{detectType(f.name)}</span>
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

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
          <button
            className="btn btn-primary"
            onClick={handleImport}
            disabled={files.length === 0 || importing}
          >
            <Upload size={16} />
            {importing
              ? 'Importing…'
              : `Import ${files.length} file${files.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
