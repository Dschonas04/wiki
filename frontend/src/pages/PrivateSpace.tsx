/**
 * PrivateSpace.tsx – Vollstaendiges persoenliches Wiki
 *
 * Kompletter privater Bereich: Seiten erstellen, anzeigen, bearbeiten, loeschen.
 * Kein Freigabe-Workflow noetig. Optional kann man Seiten spaeter veroeffentlichen.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Lock, FileText, Plus, Send, Edit3, Trash2, Save, X, Eye, ChevronRight,
  FolderOpen, ArrowLeft, Code, Clock,
} from 'lucide-react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { api, type WikiPage, type TeamSpace, type Folder } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import EditorToolbar from '../components/EditorToolbar';

type ViewMode = 'list' | 'view' | 'edit' | 'new';

export default function PrivateSpacePage() {
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Seiten-Ansicht / Bearbeitung
  const [currentPage, setCurrentPage] = useState<WikiPage | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editContentType, setEditContentType] = useState<'markdown' | 'html'>('markdown');
  const [editParentId, setEditParentId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  // Veroeffentlichungs-Dialog
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [publishPageId, setPublishPageId] = useState<number | null>(null);
  const [spaces, setSpaces] = useState<TeamSpace[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [targetSpaceId, setTargetSpaceId] = useState(0);
  const [targetFolderId, setTargetFolderId] = useState<number | undefined>();
  const [publishNote, setPublishNote] = useState('');

  const { showToast } = useToast();
  const { t, language } = useLanguage();

  // === Vorschau berechnen ===
  const previewHtml = useMemo(() => {
    if (!editContent.trim()) return '';
    return editContentType === 'markdown'
      ? DOMPurify.sanitize(marked.parse(editContent) as string)
      : DOMPurify.sanitize(editContent, {
          ADD_TAGS: ['iframe', 'video', 'audio', 'source', 'style'],
          ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'target', 'controls', 'autoplay'],
        });
  }, [editContent, editContentType]);

  // === Alle Seiten laden ===
  const loadPages = useCallback(async () => {
    try {
      const data = await api.getPrivateSpace();
      setPages(data.pages || []);
    } catch (err: any) {
      showToast(err.message || t('private.load_error'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast, t]);

  useEffect(() => { loadPages(); }, [loadPages]);

  // === Einzelne Seite laden ===
  const openPage = async (pageId: number) => {
    try {
      const page = await api.getPrivatePage(pageId);
      setCurrentPage(page);
      setViewMode('view');
    } catch (err: any) {
      showToast(err.message || t('private.load_error'), 'error');
    }
  };

  // === Neue Seite starten ===
  const startNewPage = (parentId?: number | null) => {
    setEditTitle('');
    setEditContent('');
    setEditContentType('markdown');
    setEditParentId(parentId || null);
    setCurrentPage(null);
    setViewMode('new');
  };

  // === Bearbeitung starten ===
  const startEdit = (page: WikiPage) => {
    setEditTitle(page.title);
    setEditContent(page.content || '');
    setEditContentType(page.content_type || 'markdown');
    setEditParentId(page.parent_id ?? null);
    setCurrentPage(page);
    setViewMode('edit');
  };

  // === Seite speichern (neu oder bearbeiten) ===
  const handleSave = async () => {
    if (!editTitle.trim()) return;
    setSaving(true);
    try {
      if (viewMode === 'new') {
        const created = await api.createPrivatePage({
          title: editTitle.trim(),
          content: editContent,
          contentType: editContentType,
          parentId: editParentId,
        });
        showToast(t('private.created_toast'), 'success');
        await loadPages();
        const page = await api.getPrivatePage(created.id);
        setCurrentPage(page);
        setViewMode('view');
      } else if (viewMode === 'edit' && currentPage) {
        await api.updatePrivatePage(currentPage.id, {
          title: editTitle.trim(),
          content: editContent,
          contentType: editContentType,
          parentId: editParentId,
        });
        showToast(t('private.saved_toast'), 'success');
        await loadPages();
        const page = await api.getPrivatePage(currentPage.id);
        setCurrentPage(page);
        setViewMode('view');
      }
    } catch (err: any) {
      showToast(err.message || 'Fehler', 'error');
    } finally {
      setSaving(false);
    }
  };

  // === Seite loeschen ===
  const handleDelete = async (pageId: number, title: string) => {
    if (!confirm(t('private.delete_confirm', { title }))) return;
    try {
      await api.deletePrivatePage(pageId);
      showToast(t('private.deleted_toast'), 'success');
      setPages(prev => prev.filter(p => p.id !== pageId));
      if (currentPage?.id === pageId) {
        setCurrentPage(null);
        setViewMode('list');
      }
    } catch (err: any) {
      showToast(err.message || 'Fehler', 'error');
    }
  };

  // === Veroeffentlichung ===
  const openPublishDialog = async (pageId: number) => {
    setPublishPageId(pageId);
    setPublishNote('');
    setTargetSpaceId(0);
    setTargetFolderId(undefined);
    try {
      const allSpaces = await api.getSpaces();
      setSpaces(allSpaces);
    } catch {}
    setShowPublishDialog(true);
  };

  const handleSpaceChange = async (spaceId: number) => {
    setTargetSpaceId(spaceId);
    setTargetFolderId(undefined);
    if (spaceId) {
      try {
        const folderData = await api.getFolders(spaceId);
        setFolders(folderData);
      } catch { setFolders([]); }
    } else {
      setFolders([]);
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publishPageId || !targetSpaceId) return;
    try {
      await api.requestPublish({ pageId: publishPageId, targetSpaceId, targetFolderId, comment: publishNote || undefined });
      showToast(t('private.publish_toast'), 'success');
      setShowPublishDialog(false);
      loadPages();
    } catch (err: any) {
      showToast(err.message || 'Fehler', 'error');
    }
  };

  // === Zurueck ===
  const goBack = () => {
    if (currentPage?.breadcrumbs && currentPage.breadcrumbs.length > 0) {
      openPage(currentPage.breadcrumbs[currentPage.breadcrumbs.length - 1].id);
    } else {
      setViewMode('list');
      setCurrentPage(null);
    }
  };

  // === Seitenbaustruktur ===
  const buildTree = (allPages: WikiPage[]) => {
    const rootPages = allPages.filter(p => !p.parent_id);
    const childMap = new Map<number, WikiPage[]>();
    allPages.forEach(p => {
      if (p.parent_id) {
        const list = childMap.get(p.parent_id) || [];
        list.push(p);
        childMap.set(p.parent_id, list);
      }
    });
    return { rootPages, childMap };
  };

  // === Markdown rendern ===
  const renderContent = (content: string, contentType: string) => {
    return contentType === 'markdown'
      ? DOMPurify.sanitize(marked.parse(content || '') as string)
      : DOMPurify.sanitize(content || '', {
          ADD_TAGS: ['iframe', 'video', 'audio', 'source', 'style'],
          ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'target', 'controls', 'autoplay'],
        });
  };

  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  if (loading) return <div className="content-body"><div className="loading-spinner" /></div>;

  // =================== EDITOR-ANSICHT (NEU / BEARBEITEN) ===================
  if (viewMode === 'new' || viewMode === 'edit') {
    return (
      <>
        <PageHeader
          title={viewMode === 'new' ? t('private.new_page') : t('private.edit_page')}
          icon={viewMode === 'new' ? <Plus size={24} /> : <Edit3 size={24} />}
          actions={
            <div className="btn-row">
              <button className="btn btn-secondary" onClick={() => currentPage ? setViewMode('view') : setViewMode('list')}>
                <X size={16} /> {t('common.cancel')}
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !editTitle.trim()}>
                <Save size={16} /> {saving ? t('private.saving') : t('common.save')}
              </button>
            </div>
          }
        />

        <div className="content-body">

        <form className="page-form" onSubmit={e => { e.preventDefault(); handleSave(); }}>
          {/* Titel */}
          <div className="form-group">
            <label htmlFor="ps-title">{t('newpage.label_title')}</label>
            <input
              id="ps-title"
              type="text"
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              placeholder={t('newpage.title_placeholder')}
              autoFocus
              maxLength={255}
            />
          </div>

          {/* Elternseite + Inhaltstyp */}
          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label htmlFor="ps-parent">{t('private.parent_page')}</label>
              <select
                id="ps-parent"
                value={editParentId || ''}
                onChange={e => setEditParentId(e.target.value ? parseInt(e.target.value) : null)}
              >
                <option value="">{t('private.no_parent')}</option>
                {pages.filter(p => p.id !== currentPage?.id).map(p => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ flex: 0 }}>
              <label>{t('newpage.label_type')}</label>
              <div className="content-type-toggle">
                <button
                  type="button"
                  className={`toggle-btn ${editContentType === 'markdown' ? 'active' : ''}`}
                  onClick={() => setEditContentType('markdown')}
                >
                  <FileText size={14} /> Markdown
                </button>
                <button
                  type="button"
                  className={`toggle-btn ${editContentType === 'html' ? 'active' : ''}`}
                  onClick={() => setEditContentType('html')}
                >
                  <Code size={14} /> HTML
                </button>
              </div>
            </div>
          </div>

          {/* Editor mit Toolbar + Vorschau */}
          <div className="editor-grid">
            <div className="form-group">
              <label>{t('newpage.label_content', { type: editContentType === 'markdown' ? 'Markdown' : 'HTML' })}</label>
              <EditorToolbar textareaRef={contentRef} contentType={editContentType} onUpdate={setEditContent} />
              <textarea
                ref={contentRef}
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                placeholder={editContentType === 'markdown' ? t('newpage.md_placeholder') : t('newpage.html_placeholder')}
                rows={16}
                maxLength={100000}
              />
            </div>

            <div className="form-group">
              <label><Eye size={14} style={{ verticalAlign: 'middle' }} /> {t('newpage.label_preview')}</label>
              <div
                className="markdown-preview markdown-body"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          </div>
        </form>
        </div>
      </>
    );
  }

  // =================== SEITEN-ANSICHT ===================
  if (viewMode === 'view' && currentPage) {
    return (
      <>
        {/* Breadcrumbs */}
        <nav className="ps-breadcrumb">
          <button onClick={() => { setViewMode('list'); setCurrentPage(null); }} className="ps-breadcrumb-link">
            <Lock size={14} /> {t('private.title')}
          </button>
          {currentPage.breadcrumbs?.map((crumb) => (
            <span key={crumb.id} className="ps-breadcrumb-sep">
              <ChevronRight size={14} />
              <button onClick={() => openPage(crumb.id)} className="ps-breadcrumb-link">
                {crumb.title}
              </button>
            </span>
          ))}
          <span className="ps-breadcrumb-sep">
            <ChevronRight size={14} />
            <span className="ps-breadcrumb-current">{currentPage.title}</span>
          </span>
        </nav>

        <PageHeader
          title={currentPage.title}
          icon={<FileText size={28} />}
          subtitle={t('private.last_modified') + formatDate(currentPage.updated_at || '')}
          actions={
            <div className="btn-row">
              <button className="btn btn-secondary" onClick={goBack}>
                <ArrowLeft size={16} /> {t('private.back')}
              </button>
              <button className="btn btn-primary" onClick={() => startEdit(currentPage)}>
                <Edit3 size={16} /> {t('private.edit_title')}
              </button>
              <button className="btn btn-secondary" onClick={() => openPublishDialog(currentPage.id)} title={t('private.publish_title')}>
                <Send size={16} />
              </button>
              <button className="btn btn-danger" onClick={() => handleDelete(currentPage.id, currentPage.title)} title={t('private.delete_title')}>
                <Trash2 size={16} />
              </button>
            </div>
          }
        />

        <div className="content-body">
          {/* Seiteninhalt */}
          <div className="card ps-content-card">
            <div
              className="wiki-content"
              dangerouslySetInnerHTML={{ __html: renderContent(currentPage.content, currentPage.content_type || 'markdown') }}
            />
          </div>

          {/* Unterseiten */}
          {currentPage.children && currentPage.children.length > 0 && (
            <div className="card ps-subpages-card">
              <h3 className="ps-subpages-heading">
                <FolderOpen size={18} /> {t('private.subpages')} ({currentPage.children.length})
              </h3>
              <div className="ps-subpages-grid">
                {currentPage.children.map(child => (
                  <button key={child.id} onClick={() => openPage(child.id)} className="ps-subpage-item">
                    <FileText size={16} className="ps-subpage-icon" />
                    <span className="ps-subpage-title">{child.title}</span>
                  </button>
                ))}
              </div>
              <button className="btn btn-secondary ps-add-subpage" onClick={() => startNewPage(currentPage.id)}>
                <Plus size={16} /> {t('private.add_subpage')}
              </button>
            </div>
          )}

          {/* Keine Unterseiten: Button zum Erstellen */}
          {(!currentPage.children || currentPage.children.length === 0) && (
            <div className="ps-add-subpage-wrap">
              <button className="btn btn-secondary" onClick={() => startNewPage(currentPage.id)}>
                <Plus size={16} /> {t('private.add_subpage')}
              </button>
            </div>
          )}
        </div>
      </>
    );
  }

  // =================== SEITENLISTE (HAUPTANSICHT) ===================
  const { rootPages, childMap } = buildTree(pages);

  const renderPageItem = (page: WikiPage, depth: number = 0) => {
    const children = childMap.get(page.id) || [];
    return (
      <div key={page.id}>
        <div className="ps-page-row" style={{ paddingLeft: `${depth * 1.5 + 1}rem` }}>
          <div className="ps-page-info">
            <button onClick={() => openPage(page.id)} className="ps-page-link">
              {children.length > 0 ? <FolderOpen size={16} className="ps-page-icon folder" /> : <FileText size={16} className="ps-page-icon" />}
              <span className="ps-page-title">{page.title}</span>
              {children.length > 0 && (
                <span className="ps-page-count">({children.length})</span>
              )}
            </button>
            <div className="ps-page-meta">
              <Clock size={12} /> {formatDate(page.updated_at || '')}
            </div>
          </div>
          <div className="ps-page-actions">
            <button className="icon-btn" onClick={() => startEdit(page)} title={t('private.edit_title')}>
              <Edit3 size={14} />
            </button>
            <button className="icon-btn" onClick={() => openPublishDialog(page.id)} title={t('private.publish_title')}>
              <Send size={14} />
            </button>
            <button className="icon-btn danger" onClick={() => handleDelete(page.id, page.title)} title={t('private.delete_title')}>
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        {children.map(child => renderPageItem(child, depth + 1))}
      </div>
    );
  };

  return (
    <>
      <PageHeader
        title={t('private.title')}
        icon={<Lock size={28} />}
        subtitle={t('private.subtitle')}
        actions={
          <button className="btn btn-primary" onClick={() => startNewPage()}>
            <Plus size={16} /> {t('private.new_page')}
          </button>
        }
      />

      <div className="content-body">
        {/* Seitenliste */}
        {pages.length > 0 ? (
          <div className="card ps-page-list">
            <h3 className="ps-list-heading">
              <FileText size={18} /> {t('private.all_pages')} ({pages.length})
            </h3>
            {rootPages.map(page => renderPageItem(page))}
            {/* Seiten ohne gueltige Eltern (verwaist) */}
            {pages.filter(p => p.parent_id && !pages.find(pp => pp.id === p.parent_id) && !rootPages.includes(p))
              .map(page => renderPageItem(page))}
          </div>
        ) : (
          <EmptyState
            icon={<Lock size={48} />}
            title={t('private.empty_heading')}
            description={t('private.empty_desc')}
            action={
              <button className="btn btn-primary" onClick={() => startNewPage()}>
                <Plus size={16} /> {t('private.empty_action')}
              </button>
            }
          />
        )}
      </div>

      {/* Veroeffentlichungs-Dialog */}
      {showPublishDialog && (
        <div className="modal-overlay" onClick={() => setShowPublishDialog(false)}>
          <div className="modal ps-publish-modal" onClick={e => e.stopPropagation()}>
            <h2>{t('private.publish_heading')}</h2>
            <form onSubmit={handlePublish}>
              <div className="form-group">
                <label>{t('private.label_space')}</label>
                <select value={targetSpaceId} onChange={e => handleSpaceChange(parseInt(e.target.value))} required>
                  <option value={0}>{t('private.space_placeholder')}</option>
                  {spaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              {folders.length > 0 && (
                <div className="form-group">
                  <label>{t('private.label_folder')}</label>
                  <select value={targetFolderId || ''} onChange={e => setTargetFolderId(e.target.value ? parseInt(e.target.value) : undefined)}>
                    <option value="">{t('private.folder_none')}</option>
                    {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label>{t('private.label_note')}</label>
                <textarea value={publishNote} onChange={e => setPublishNote(e.target.value)} rows={3} placeholder={t('private.note_placeholder')} />
              </div>
              <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowPublishDialog(false)}>{t('common.cancel')}</button>
                <button type="submit" className="btn btn-primary" disabled={!targetSpaceId}>
                  <Send size={16} /> {t('common.submit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
