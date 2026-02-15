import { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Edit3, Trash2, ArrowLeft, Calendar, RefreshCw, User, History, Download, Star, Tag, FileText, Share2, Eye, EyeOff, Paperclip, Upload, X } from 'lucide-react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { api, type WikiPage, type Tag as TagType, type Attachment } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import Loading from '../components/Loading';
import ShareDialog from '../components/ShareDialog';

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
  const [showShare, setShowShare] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();
  const { hasPermission, user } = useAuth();
  const canEdit = hasPermission('pages.edit');
  const canDelete = hasPermission('pages.delete');
  const isOwner = page ? page.created_by === user?.id : false;
  const isAdmin = user?.role === 'admin';
  const canChangeVisibility = isOwner || isAdmin;

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      api.getPage(id).then(setPage).catch((err) => setError(err.status === 404 ? 'Page not found.' : err.message)),
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
      showToast(result.favorited ? 'Added to favorites' : 'Removed from favorites', 'success');
    } catch { showToast('Failed to toggle favorite', 'error'); }
  };

  const openTagPicker = async () => {
    try {
      const all = await api.getTags();
      setAllTags(all);
      setShowTagPicker(true);
    } catch { showToast('Failed to load tags', 'error'); }
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
    } catch { showToast('Failed to update tags', 'error'); }
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
      showToast('PDF exported', 'success');
    } catch {
      showToast('PDF export failed', 'error');
    }
  };

  const handleDelete = async () => {
    if (!page) return;
    if (!confirm(`Delete "${page.title}"? This cannot be undone.`)) return;
    try {
      await api.deletePage(page.id);
      showToast('Page deleted', 'success');
      navigate('/pages');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const toggleVisibility = async () => {
    if (!page) return;
    const newVis = page.visibility === 'published' ? 'draft' : 'published';
    try {
      const updated = await api.setPageVisibility(page.id, newVis);
      setPage(updated);
      showToast(newVis === 'published' ? 'Page published — now visible to all users' : 'Page set to draft — only visible to you', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
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
        showToast(`Failed to upload "${file.name}": ${err.message}`, 'error');
      }
    }
    if (successCount > 0) showToast(`${successCount} file${successCount > 1 ? 's' : ''} uploaded`, 'success');
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeleteAttachment = async (att: Attachment) => {
    if (!confirm(`Delete "${att.original_name}"?`)) return;
    try {
      await api.deleteAttachment(att.id);
      setAttachments(prev => prev.filter(a => a.id !== att.id));
      showToast('Attachment deleted', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
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

  if (loading) {
    return (
      <>
        <PageHeader title="Loading…" />
        <div className="content-body"><Loading /></div>
      </>
    );
  }

  if (error || !page) {
    return (
      <>
        <PageHeader title="Error" />
        <div className="content-body">
          <div className="card">
            <p className="error-text">{error || 'Page not found.'}</p>
            <div className="btn-row">
              <Link to="/pages" className="btn btn-secondary">
                <ArrowLeft size={16} /> Back to Pages
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
            {canChangeVisibility && (
              <button
                className={`btn ${page.visibility === 'published' ? 'btn-secondary' : 'btn-success'}`}
                onClick={toggleVisibility}
                title={page.visibility === 'published' ? 'Set to draft (hide from others)' : 'Publish (make visible to all)'}
              >
                {page.visibility === 'published' ? <EyeOff size={16} /> : <Eye size={16} />}
                <span>{page.visibility === 'published' ? 'Unpublish' : 'Publish'}</span>
              </button>
            )}
            <button
              className={`btn ${favorited ? 'btn-warning' : 'btn-secondary'}`}
              onClick={toggleFavorite}
              title={favorited ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Star size={16} fill={favorited ? 'currentColor' : 'none'} />
            </button>
            {canEdit && (
              <Link to={`/pages/${page.id}/edit`} className="btn btn-primary">
                <Edit3 size={16} />
                <span>Edit</span>
              </Link>
            )}
            {canEdit && (
              <Link to={`/pages/${page.id}/history`} className="btn btn-secondary">
                <History size={16} />
                <span>History</span>
              </Link>
            )}
            <a href={api.exportPage(page.id)} className="btn btn-secondary" download>
              <Download size={16} />
              <span>Export</span>
            </a>
            <button className="btn btn-secondary" onClick={handlePdfExport} title="Als PDF exportieren">
              <FileText size={16} />
              <span>PDF</span>
            </button>
            {canEdit && (
              <button className="btn btn-secondary" onClick={() => setShowShare(true)} title="Share">
                <Share2 size={16} />
                <span>Share</span>
              </button>
            )}
            {canDelete && (
              <button className="btn btn-danger" onClick={handleDelete}>
                <Trash2 size={16} />
                <span>Delete</span>
              </button>
            )}
          </div>
        }
      />

      <div className="content-body">
        {/* Draft notice */}
        {page.visibility !== 'published' && (
          <div className="draft-banner">
            <EyeOff size={16} />
            <span>This page is a <strong>draft</strong> — only visible to you{isAdmin ? ' (admin)' : ''} and admins.</span>
            {canChangeVisibility && (
              <button className="btn btn-sm btn-success" onClick={toggleVisibility}>
                <Eye size={14} /> Publish
              </button>
            )}
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
              <Tag size={14} /> {tags.length === 0 ? 'Add tags' : '+'}
            </button>
          )}
        </div>

        {/* Tag picker popover */}
        {showTagPicker && (
          <div className="tag-picker-overlay" onClick={() => setShowTagPicker(false)}>
            <div className="tag-picker" onClick={e => e.stopPropagation()}>
              <h4>Select Tags</h4>
              <div className="tag-picker-list">
                {allTags.length === 0 && <p className="text-muted" style={{ fontSize: '0.85rem' }}>No tags yet. Create tags to categorize pages.</p>}
                {allTags.map(tag => {
                  const isSelected = tags.some(t => t.id === tag.id);
                  return (
                    <button
                      key={tag.id}
                      className={`tag-picker-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => toggleTag(tag.id)}
                      style={{ '--tag-color': tag.color } as React.CSSProperties}
                    >
                      <span className="tag-dot" />
                      <span>{tag.name}</span>
                      {isSelected && <span className="tag-check">✓</span>}
                    </button>
                  );
                })}
              </div>
              <button className="btn btn-secondary" onClick={() => setShowTagPicker(false)} style={{ marginTop: 12, width: '100%' }}>
                Done
              </button>
            </div>
          </div>
        )}

        <div className="card page-view-card">
          <div className="page-view-content markdown-body" dangerouslySetInnerHTML={{ __html: markdownHtml }} />
        </div>

        {/* Attachments */}
        <div className="attachments-section">
          <div className="attachments-header">
            <h3><Paperclip size={18} /> Attachments {attachments.length > 0 && <span className="attachments-count">{attachments.length}</span>}</h3>
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
                  <span>{uploading ? 'Uploading…' : 'Upload File'}</span>
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
              <span>Drag & drop files here</span>
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
                      <button className="icon-btn danger" title="Delete" onClick={() => handleDeleteAttachment(att)}>
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
            <span>Created {formatDateLong(page.created_at)}</span>
          </div>
          <div className="meta-item">
            <RefreshCw size={14} />
            <span>Updated {formatDateLong(page.updated_at)}</span>
          </div>
          {(page as any).created_by_name && (
            <div className="meta-item">
              <User size={14} />
              <span>Author: {(page as any).created_by_name}</span>
            </div>
          )}
        </div>

        <div className="btn-row" style={{ marginTop: 24 }}>
          <Link to="/pages" className="btn btn-secondary">
            <ArrowLeft size={16} />
            <span>Back to Pages</span>
          </Link>
        </div>
      </div>

      {showShare && page && (
        <ShareDialog pageId={page.id} pageTitle={page.title} onClose={() => setShowShare(false)} />
      )}
    </>
  );
}
