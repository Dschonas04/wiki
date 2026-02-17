import { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Edit3, Trash2, ArrowLeft, Calendar, RefreshCw, User, History, Download, Star, Tag, FileText, Paperclip, Upload, X, List } from 'lucide-react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { api, type WikiPage, type Tag as TagType, type Attachment } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import Loading from '../components/Loading';
import ConfirmDialog from '../components/ConfirmDialog';

export default function PageView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [page, setPage] = useState<WikiPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [favorited, setFavorited] = useState(false);
  const [tags, setTags] = useState<TagType[]>([]);
  const [allTags, setAllTags] = useState<TagType[]>([]);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeleteAtt, setConfirmDeleteAtt] = useState<Attachment | null>(null);
  const [confirmDeleteTag, setConfirmDeleteTag] = useState<TagType | null>(null);
  const [showToc, setShowToc] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();
  const { hasPermission, user } = useAuth();
  const canEdit = hasPermission('pages.edit');
  const canDelete = hasPermission('pages.delete');
  const isOwner = page ? page.created_by === user?.id : false;
  const isAdmin = user?.globalRole === 'admin';

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      api.getPage(id).then(setPage).catch((err) => setError(err.status === 404 ? 'Seite nicht gefunden.' : err.message)),
      api.checkFavorite(id).then(r => setFavorited(r.favorited)).catch(() => {}),
      api.getPageTags(id).then(setTags).catch(() => {}),
      api.getAttachments(id).then(setAttachments).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [id]);

  const toggleFavorite = async () => {
    if (!id) return;
    try {
      const result = await api.toggleFavorite(id);
      setFavorited(result.favorited);
      showToast(result.favorited ? 'Zu Favoriten hinzugefügt' : 'Aus Favoriten entfernt', 'success');
    } catch { showToast('Fehler beim Ändern der Favoriten', 'error'); }
  };

  const openTagPicker = async () => {
    try {
      const all = await api.getTags();
      setAllTags(all);
      setShowTagPicker(true);
    } catch { showToast('Tags konnten nicht geladen werden', 'error'); }
  };

  const toggleTag = async (tagId: number) => {
    if (!id) return;
    const currentIds = tags.map(t => t.id);
    const newIds = currentIds.includes(tagId)
      ? currentIds.filter(i => i !== tagId)
      : [...currentIds, tagId];
    try {
      const updated = await api.setPageTags(id, newIds);
      setTags(updated);
    } catch { showToast('Tags konnten nicht aktualisiert werden', 'error'); }
  };

  const handleDeleteTag = async () => {
    if (!confirmDeleteTag) return;
    try {
      await api.deleteTag(confirmDeleteTag.id);
      setTags(prev => prev.filter(t => t.id !== confirmDeleteTag.id));
      setAllTags(prev => prev.filter(t => t.id !== confirmDeleteTag.id));
      showToast(`Tag "${confirmDeleteTag.name}" gelöscht`, 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setConfirmDeleteTag(null);
    }
  };

  const handlePdfExport = async () => {
    if (!page) return;
    const element = document.querySelector('.page-view-content') as HTMLElement;
    if (!element) return;
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      await html2pdf()
        .set({
          margin: [15, 15, 15, 15],
          filename: `${page.title}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
        })
        .from(element)
        .save();
      showToast('PDF exportiert', 'success');
    } catch {
      showToast('PDF-Export fehlgeschlagen', 'error');
    }
  };

  const handleDelete = async () => {
    if (!page) return;
    try {
      await api.deletePage(page.id);
      showToast('Seite in Papierkorb verschoben', 'success');
      navigate('/pages');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setConfirmDelete(false);
    }
  };

  const handleFileUpload = async (files: FileList | File[]) => {
    if (!id || !files.length) return;
    setUploading(true);
    let successCount = 0;
    for (const file of Array.from(files)) {
      try {
        const att = await api.uploadAttachment(id, file);
        setAttachments(prev => [att, ...prev]);
        successCount++;
      } catch (err: any) {
        showToast(`Fehler beim Hochladen von "${file.name}": ${err.message}`, 'error');
      }
    }
    if (successCount > 0) showToast(`${successCount} Datei(en) hochgeladen`, 'success');
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeleteAttachment = async (att: Attachment) => {
    try {
      await api.deleteAttachment(att.id);
      setAttachments(prev => prev.filter(a => a.id !== att.id));
      showToast('Anhang gelöscht', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setConfirmDeleteAtt(null);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType === 'application/pdf') return '📄';
    if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet') || mimeType === 'text/csv') return '📊';
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return '📽️';
    if (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('gzip')) return '📦';
    return '📎';
  };

  const formatDateLong = (s: string) =>
    new Date(s).toLocaleDateString('de-DE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const markdownHtml = page
    ? page.content_type === 'html'
      ? DOMPurify.sanitize(page.content || '', { ADD_TAGS: ['iframe', 'video', 'audio', 'source', 'style'], ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'target', 'controls', 'autoplay'] })
      : DOMPurify.sanitize(marked.parse(page.content || '') as string)
    : '';

  // Generate Table of Contents from headings
  const tocItems = (() => {
    if (!markdownHtml) return [];
    const tmp = document.createElement('div');
    tmp.innerHTML = markdownHtml;
    const headings = tmp.querySelectorAll('h1, h2, h3, h4');
    return Array.from(headings).map((h, i) => {
      const level = parseInt(h.tagName[1]);
      const text = h.textContent || '';
      const id = `heading-${i}`;
      return { level, text, id };
    });
  })();

  // Inject IDs into the rendered HTML for anchor links
  const htmlWithIds = (() => {
    if (!markdownHtml || tocItems.length === 0) return markdownHtml;
    const tmp = document.createElement('div');
    tmp.innerHTML = markdownHtml;
    const headings = tmp.querySelectorAll('h1, h2, h3, h4');
    headings.forEach((h, i) => {
      h.id = `heading-${i}`;
    });
    return tmp.innerHTML;
  })();

  if (loading) {
    return (
      <>
        <PageHeader title="Laden…" />
        <div className="content-body"><Loading /></div>
      </>
    );
  }

  if (error || !page) {
    return (
      <>
        <PageHeader title="Fehler" />
        <div className="content-body">
          <div className="card">
            <p className="error-text">{error || 'Seite nicht gefunden.'}</p>
            <div className="btn-row">
              <Link to="/pages" className="btn btn-secondary">
                <ArrowLeft size={16} /> Zurück zu Seiten
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={page.title}
        actions={
          <div className="btn-row">
            {/* Workflow-Status */}
            {(page as any).workflow_status && (
              <span className="btn btn-secondary" style={{ cursor: 'default', opacity: 0.85 }}>
                {(page as any).workflow_status === 'published' ? '✅ Veröffentlicht' :
                 (page as any).workflow_status === 'draft' ? '📝 Entwurf' :
                 (page as any).workflow_status === 'review' ? '🔍 In Prüfung' :
                 (page as any).workflow_status}
              </span>
            )}
            <button
              className={`btn ${favorited ? 'btn-warning' : 'btn-secondary'}`}
              onClick={toggleFavorite}
              title={favorited ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
            >
              <Star size={16} fill={favorited ? 'currentColor' : 'none'} />
            </button>
            {canEdit && (
              <Link to={`/pages/${page.id}/edit`} className="btn btn-primary">
                <Edit3 size={16} />
                <span>Bearbeiten</span>
              </Link>
            )}
            {canEdit && (
              <Link to={`/pages/${page.id}/history`} className="btn btn-secondary">
                <History size={16} />
                <span>Verlauf</span>
              </Link>
            )}
            <a href={api.exportPage(page.id)} className="btn btn-secondary" download>
              <Download size={16} />
              <span>Exportieren</span>
            </a>
            {tocItems.length > 0 && (
              <button className={`btn ${showToc ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setShowToc(!showToc)} title="Inhaltsverzeichnis">
                <List size={16} />
                <span>Inhalt</span>
              </button>
            )}
            <button className="btn btn-secondary" onClick={handlePdfExport} title="Als PDF exportieren">
              <FileText size={16} />
              <span>PDF</span>
            </button>
            {canDelete && (
              <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={16} />
                <span>Löschen</span>
              </button>
            )}
          </div>
        }
      />

      <div className="content-body">
        {/* Workflow-Status-Anzeige */}
        {(page as any).workflow_status && (page as any).workflow_status !== 'published' && (
          <div className="draft-banner">
            <span>
              {(page as any).workflow_status === 'draft' && <>📝 Diese Seite ist ein <strong>Entwurf</strong> und noch nicht veröffentlicht.</>}
              {(page as any).workflow_status === 'review' && <>🔍 Diese Seite befindet sich <strong>in Prüfung</strong>.</>}
              {!['draft', 'review'].includes((page as any).workflow_status) && <><strong>Status:</strong> {(page as any).workflow_status}</>}
            </span>
          </div>
        )}

        {/* Tags bar */}
        <div className="tags-bar">
          {tags.map(tag => (
            <span key={tag.id} className="tag-badge" style={{ '--tag-color': tag.color } as React.CSSProperties}>
              {tag.name}
            </span>
          ))}
          {canEdit && (
            <button className="tag-add-btn" onClick={openTagPicker}>
              <Tag size={14} /> {tags.length === 0 ? 'Tags hinzufügen' : '+'}
            </button>
          )}
        </div>

        {/* Tag picker popover */}
        {showTagPicker && (
          <div className="tag-picker-overlay" onClick={() => setShowTagPicker(false)}>
            <div className="tag-picker" onClick={e => e.stopPropagation()}>
              <h4>Tags auswählen</h4>
              <div className="tag-picker-list">
                {allTags.length === 0 && <p className="text-muted" style={{ fontSize: '0.85rem' }}>Noch keine Tags. Erstelle Tags, um Seiten zu kategorisieren.</p>}
                {allTags.map(tag => {
                  const isSelected = tags.some(t => t.id === tag.id);
                  return (
                    <div key={tag.id} className="tag-picker-row">
                      <button
                        className={`tag-picker-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => toggleTag(tag.id)}
                        style={{ '--tag-color': tag.color } as React.CSSProperties}
                      >
                        <span className="tag-dot" />
                        <span>{tag.name}</span>
                        {isSelected && <span className="tag-check">✓</span>}
                      </button>
                      <button className="icon-btn danger tag-delete-btn" title="Delete tag" onClick={() => setConfirmDeleteTag(tag)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
              <button className="btn btn-secondary" onClick={() => setShowTagPicker(false)} style={{ marginTop: 12, width: '100%' }}>
                Fertig
              </button>
            </div>
          </div>
        )}

        <div className={`page-layout ${showToc ? 'with-toc' : ''}`}>
          {/* Table of Contents */}
          {showToc && tocItems.length > 0 && (
            <nav className="toc-sidebar">
              <h4 className="toc-title">Inhaltsverzeichnis</h4>
              <ul className="toc-list">
                {tocItems.map(item => (
                  <li key={item.id} className={`toc-item toc-level-${item.level}`}>
                    <a href={`#${item.id}`} onClick={e => {
                      e.preventDefault();
                      document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}>{item.text}</a>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          <div className="page-layout-content">
            <div className="card page-view-card">
              <div className="page-view-content markdown-body" dangerouslySetInnerHTML={{ __html: htmlWithIds }} />
            </div>
          </div>
        </div>

        {/* Attachments */}
        <div className="attachments-section">
          <div className="attachments-header">
            <h3><Paperclip size={18} /> Anhänge {attachments.length > 0 && <span className="attachments-count">{attachments.length}</span>}</h3>
            {canEdit && (
              <div className="attachments-actions">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
                />
                <button className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  <Upload size={14} />
                  <span>{uploading ? 'Wird hochgeladen…' : 'Datei hochladen'}</span>
                </button>
              </div>
            )}
          </div>

          {canEdit && (
            <div
              className={`attachments-dropzone ${dragOver ? 'drag-over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files.length) handleFileUpload(e.dataTransfer.files);
              }}
            >
              <Upload size={20} />
              <span>Dateien hierher ziehen</span>
            </div>
          )}

          {attachments.length > 0 && (
            <div className="attachments-list">
              {attachments.map(att => (
                <div key={att.id} className="attachment-item">
                  <span className="attachment-icon">{getFileIcon(att.mime_type)}</span>
                  <div className="attachment-info">
                    <a
                      href={api.downloadAttachmentUrl(att.id)}
                      className="attachment-name"
                      download
                    >
                      {att.original_name}
                    </a>
                    <span className="attachment-meta">
                      {formatFileSize(att.size_bytes)}
                      {att.uploaded_by_name && ` · ${att.uploaded_by_name}`}
                      {' · '}{new Date(att.created_at).toLocaleDateString('de-DE')}
                    </span>
                  </div>
                  <div className="attachment-actions">
                    <a href={api.downloadAttachmentUrl(att.id)} className="icon-btn" title="Download" download>
                      <Download size={15} />
                    </a>
                    {canEdit && (
                      <button className="icon-btn danger" title="Delete" onClick={() => setConfirmDeleteAtt(att)}>
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="page-view-meta">
          <div className="meta-item">
            <Calendar size={14} />
            <span>Erstellt {formatDateLong(page.created_at)}</span>
          </div>
          <div className="meta-item">
            <RefreshCw size={14} />
            <span>Aktualisiert {formatDateLong(page.updated_at)}</span>
          </div>
          {(page as any).created_by_name && (
            <div className="meta-item">
              <User size={14} />
              <span>Autor: {(page as any).created_by_name}</span>
            </div>
          )}
        </div>

        <div className="btn-row" style={{ marginTop: 24 }}>
          <Link to="/pages" className="btn btn-secondary">
            <ArrowLeft size={16} />
            <span>Zurück zu Seiten</span>
          </Link>
        </div>
      </div>

      {confirmDelete && page && (
        <ConfirmDialog
          title="Seite löschen?"
          message={`"${page.title}" wird in den Papierkorb verschoben. Du kannst sie später wiederherstellen.`}
          confirmLabel="In Papierkorb verschieben"
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

      {confirmDeleteAtt && (
        <ConfirmDialog
          title="Anhang löschen?"
          message={`"${confirmDeleteAtt.original_name}" wird dauerhaft gelöscht.`}
          confirmLabel="Löschen"
          variant="danger"
          onConfirm={() => handleDeleteAttachment(confirmDeleteAtt)}
          onCancel={() => setConfirmDeleteAtt(null)}
        />
      )}

      {confirmDeleteTag && (
        <ConfirmDialog
          title="Tag löschen?"
          message={`"${confirmDeleteTag.name}" wird von allen Seiten entfernt.`}
          confirmLabel="Löschen"
          variant="danger"
          onConfirm={handleDeleteTag}
          onCancel={() => setConfirmDeleteTag(null)}
        />
      )}
    </>
  );
}
