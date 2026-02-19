import { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Edit3, Trash2, ArrowLeft, Calendar, RefreshCw, User, History, Download, Star, Tag, FileText, Paperclip, Upload, X, List, ChevronRight, Layers, FolderOpen, GitBranch } from 'lucide-react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { api, type WikiPage, type Tag as TagType, type Attachment } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import PageHeader from '../components/PageHeader';
import Loading from '../components/Loading';
import ConfirmDialog from '../components/ConfirmDialog';
import CommentSection from '../components/CommentSection';

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
  const { t, language } = useLanguage();
  const canEdit = hasPermission('pages.edit');
  const canDelete = hasPermission('pages.delete');
  const isOwner = page ? page.created_by === user?.id : false;
  const isAdmin = user?.globalRole === 'admin';

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      api.getPage(id).then(setPage).catch((err) => setError(err.status === 404 ? t('pageview.not_found') : err.message)),
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
      showToast(result.favorited ? t('pageview.fav_added') : t('pageview.fav_removed'), 'success');
    } catch { showToast(t('pageview.fav_error'), 'error'); }
  };

  const openTagPicker = async () => {
    try {
      const all = await api.getTags();
      setAllTags(all);
      setShowTagPicker(true);
    } catch { showToast(t('pageview.tags_error'), 'error'); }
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
    } catch { showToast(t('pageview.tags_update_error'), 'error'); }
  };

  const handleDeleteTag = async () => {
    if (!confirmDeleteTag) return;
    try {
      await api.deleteTag(confirmDeleteTag.id);
      setTags(prev => prev.filter(t => t.id !== confirmDeleteTag.id));
      setAllTags(prev => prev.filter(t => t.id !== confirmDeleteTag.id));
      showToast(t('pageview.tag_deleted_toast', { name: confirmDeleteTag.name }), 'success');
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
      showToast(t('pageview.pdf_exported'), 'success');
    } catch {
      showToast(t('pageview.pdf_error'), 'error');
    }
  };

  const handleDelete = async () => {
    if (!page) return;
    try {
      await api.deletePage(page.id);
      showToast(t('pageview.page_deleted_toast'), 'success');
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
        showToast(`${err.message}`, 'error');
      }
    }
    if (successCount > 0) showToast(t('pageview.files_uploaded', { count: successCount }), 'success');
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeleteAttachment = async (att: Attachment) => {
    try {
      await api.deleteAttachment(att.id);
      setAttachments(prev => prev.filter(a => a.id !== att.id));
      showToast(t('pageview.att_deleted'), 'success');
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
    new Date(s).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const markdownHtml = page
    ? page.content_type === 'html'
      ? DOMPurify.sanitize(page.content || '', { ADD_TAGS: ['video', 'audio', 'source'], ADD_ATTR: ['controls', 'autoplay', 'target'] })
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
        <PageHeader title={t('pageview.loading')} />
        <div className="content-body"><Loading /></div>
      </>
    );
  }

  if (error || !page) {
    return (
      <>
        <PageHeader title={t('pageview.error')} />
        <div className="content-body">
          <div className="card">
            <p className="error-text">{error || t('pageview.not_found')}</p>
            <div className="btn-row">
              <Link to="/pages" className="btn btn-secondary">
                <ArrowLeft size={16} /> {t('pageview.back')}
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
            {page.workflow_status && (
              <span className="btn btn-secondary" style={{ cursor: 'default', opacity: 0.85 }}>
                {page.workflow_status === 'published' ? t('pageview.status_published') :
                 page.workflow_status === 'draft' ? t('pageview.status_draft') :
                 page.workflow_status === 'in_review' ? t('pageview.status_review') :
                 page.workflow_status}
              </span>
            )}
            <button
              className={`btn ${favorited ? 'btn-warning' : 'btn-secondary'}`}
              onClick={toggleFavorite}
              title={favorited ? t('pageview.fav_remove_title') : t('pageview.fav_add_title')}
            >
              <Star size={16} fill={favorited ? 'currentColor' : 'none'} />
            </button>
            {canEdit && (
              <Link to={`/pages/${page.id}/edit`} className="btn btn-primary">
                <Edit3 size={16} />
                <span>{t('pageview.btn_edit')}</span>
              </Link>
            )}
            {canEdit && (
              <Link to={`/pages/${page.id}/history`} className="btn btn-secondary">
                <History size={16} />
                <span>{t('pageview.btn_history')}</span>
              </Link>
            )}
            <a href={api.exportPage(page.id)} className="btn btn-secondary" download>
              <Download size={16} />
              <span>{t('pageview.btn_export')}</span>
            </a>
            {tocItems.length > 0 && (
              <button className={`btn ${showToc ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setShowToc(!showToc)} title={t('pageview.btn_toc_title')}>
                <List size={16} />
                <span>{t('pageview.btn_toc')}</span>
              </button>
            )}
            <button className="btn btn-secondary" onClick={handlePdfExport} title="Als PDF exportieren">
              <FileText size={16} />
              <span>PDF</span>
            </button>
            {canDelete && (
              <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={16} />
                <span>{t('pageview.btn_delete')}</span>
              </button>
            )}
          </div>
        }
      />

      <div className="content-body">
        {/* Breadcrumb Navigation */}
        {(page.breadcrumbs && page.breadcrumbs.length > 0 || page.space_name || page.parent_title) && (
          <nav className="page-breadcrumb-nav">
            {page.space_name && (
              <>
                <Link to={`/spaces/${page.space_id}`} className="breadcrumb-item breadcrumb-space">
                  <Layers size={14} />
                  <span>{page.space_name}</span>
                </Link>
                <ChevronRight size={12} className="breadcrumb-sep" />
              </>
            )}
            {page.folder_name && (
              <>
                <span className="breadcrumb-item breadcrumb-folder">
                  <FolderOpen size={14} />
                  <span>{page.folder_name}</span>
                </span>
                <ChevronRight size={12} className="breadcrumb-sep" />
              </>
            )}
            {page.breadcrumbs?.map((crumb: { id: number; title: string }) => (
              <span key={crumb.id} style={{ display: 'contents' }}>
                <Link to={`/pages/${crumb.id}`} className="breadcrumb-item breadcrumb-page">
                  <FileText size={13} />
                  <span>{crumb.title}</span>
                </Link>
                <ChevronRight size={12} className="breadcrumb-sep" />
              </span>
            ))}
            <span className="breadcrumb-item breadcrumb-current">
              {page.title}
            </span>
          </nav>
        )}

        {/* Workflow-Status-Anzeige */}
        {page.workflow_status && page.workflow_status !== 'published' && (
          <div className="draft-banner">
            <span>
              {page.workflow_status === 'draft' && <>{t('pageview.banner_draft')}</>}
              {page.workflow_status === 'in_review' && <>{t('pageview.banner_review')}</>}
              {!['draft', 'in_review'].includes(page.workflow_status) && <><strong>{t('pageview.status_label')}</strong> {page.workflow_status}</>}
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
              <Tag size={14} /> {tags.length === 0 ? t('pageview.tags_add') : '+'}
            </button>
          )}
        </div>

        {/* Tag picker popover */}
        {showTagPicker && (
          <div className="tag-picker-overlay" onClick={() => setShowTagPicker(false)}>
            <div className="tag-picker" onClick={e => e.stopPropagation()}>
              <h4>{t('pageview.tags_select')}</h4>
              <div className="tag-picker-list">
                {allTags.length === 0 && <p className="text-muted" style={{ fontSize: '0.85rem' }}>{t('pageview.tags_empty')}</p>}
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
                      <button className="icon-btn danger tag-delete-btn" title={t('common.delete')} onClick={() => setConfirmDeleteTag(tag)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
              <button className="btn btn-secondary" onClick={() => setShowTagPicker(false)} style={{ marginTop: 12, width: '100%' }}>
                {t('common.done')}
              </button>
            </div>
          </div>
        )}

        <div className="page-content-with-comments">
          {/* Left: Main Content */}
          <div className="page-main-column">
            <div className={`page-layout ${showToc ? 'with-toc' : ''}`}>
              {/* Table of Contents */}
              {showToc && tocItems.length > 0 && (
                <nav className="toc-sidebar">
                  <h4 className="toc-title">{t('pageview.toc_title')}</h4>
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

        {/* Unterseiten */}
        {page.children && page.children.length > 0 && (
          <div className="child-pages-section">
            <h3 className="child-pages-title">
              <GitBranch size={18} />
              {t('pageview.child_pages')} <span className="child-pages-count">{page.children.length}</span>
            </h3>
            <div className="child-pages-grid">
              {page.children.map((child: { id: number; title: string }) => (
                <Link key={child.id} to={`/pages/${child.id}`} className="child-page-card">
                  <FileText size={16} className="child-page-icon" />
                  <span className="child-page-title">{child.title}</span>
                  <ChevronRight size={14} className="child-page-arrow" />
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Attachments */}
        <div className="attachments-section">
          <div className="attachments-header">
            <h3><Paperclip size={18} /> {t('pageview.attachments')} {attachments.length > 0 && <span className="attachments-count">{attachments.length}</span>}</h3>
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
                  <span>{uploading ? t('pageview.upload_loading') : t('pageview.upload_btn')}</span>
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
              <span>{t('pageview.upload_drop')}</span>
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
                      {' · '}{new Date(att.created_at).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US')}
                    </span>
                  </div>
                  <div className="attachment-actions">
                    <a href={api.downloadAttachmentUrl(att.id)} className="icon-btn" title={t('common.download')} download>
                      <Download size={15} />
                    </a>
                    {canEdit && (
                      <button className="icon-btn danger" title={t('common.delete')} onClick={() => setConfirmDeleteAtt(att)}>
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
            <span>{t('pageview.meta_created')} {formatDateLong(page.created_at)}</span>
          </div>
          <div className="meta-item">
            <RefreshCw size={14} />
            <span>{t('pageview.meta_updated')} {formatDateLong(page.updated_at)}</span>
          </div>
          {page.created_by_name && (
            <div className="meta-item">
              <User size={14} />
              <span>{t('pageview.meta_author')} {page.created_by_name}</span>
            </div>
          )}
        </div>

        <div className="btn-row" style={{ marginTop: 24 }}>
          <Link to="/pages" className="btn btn-secondary">
            <ArrowLeft size={16} />
            <span>{t('pageview.back')}</span>
          </Link>
        </div>
          </div>

          {/* Right: Comment Sidebar */}
          <aside className="comment-sidebar">
            {page && <CommentSection pageId={page.id} />}
          </aside>
        </div>
      </div>

      {confirmDelete && page && (
        <ConfirmDialog
          title={t('pageview.delete_title')}
          message={t('pageview.delete_message', { title: page.title })}
          confirmLabel={t('pageview.delete_confirm')}
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

      {confirmDeleteAtt && (
        <ConfirmDialog
          title={t('pageview.att_delete_title')}
          message={t('pageview.att_delete_message', { name: confirmDeleteAtt.original_name })}
          confirmLabel={t('common.delete')}
          variant="danger"
          onConfirm={() => handleDeleteAttachment(confirmDeleteAtt)}
          onCancel={() => setConfirmDeleteAtt(null)}
        />
      )}

      {confirmDeleteTag && (
        <ConfirmDialog
          title={t('pageview.tag_delete_title')}
          message={t('pageview.tag_delete_message', { name: confirmDeleteTag.name })}
          confirmLabel={t('common.delete')}
          variant="danger"
          onConfirm={handleDeleteTag}
          onCancel={() => setConfirmDeleteTag(null)}
        />
      )}
    </>
  );
}
