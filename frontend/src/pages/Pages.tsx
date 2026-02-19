import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { FileText, PlusCircle, Clock, Edit3, Trash2, Search, User, Download, ChevronRight, Upload, Tag as TagIcon, X, CheckSquare, Square, MinusSquare } from 'lucide-react';
import { api, type WikiPage, type Tag } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import PageHeader from '../components/PageHeader';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';
import ImportDialog from '../components/ImportDialog';
import ConfirmDialog from '../components/ConfirmDialog';

export default function Pages() {
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; title: string } | null>(null);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [activeTagId, setActiveTagId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const { showToast } = useToast();
  const { hasPermission } = useAuth();
  const { t } = useLanguage();
  const canCreate = hasPermission('pages.create');
  const canEdit = hasPermission('pages.edit');
  const canDelete = hasPermission('pages.delete');

  // === Bulk selection helpers ===
  const toggleSelect = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === pages.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pages.map(p => p.id)));
    }
  }, [selectedIds.size, pages]);

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    let deleted = 0;
    for (const id of selectedIds) {
      try {
        await api.deletePage(id);
        deleted++;
      } catch {}
    }
    setPages(prev => prev.filter(p => !selectedIds.has(p.id)));
    setSelectedIds(new Set());
    setConfirmBulkDelete(false);
    setBulkDeleting(false);
    showToast(t('pages.bulk_deleted_toast', { count: deleted }), 'success');
  };

  // Load available tags once
  useEffect(() => {
    api.getTags().then(setAllTags).catch(() => {});
  }, []);

  const loadPages = async (tagId?: number | null) => {
    try {
      setLoading(true);
      const data = await api.getPages(tagId ? { tagId } : undefined);
      setPages(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const q = search.trim();
    setError('');

    if (!q) {
      loadPages(activeTagId);
      return;
    }

    const handle = setTimeout(async () => {
      try {
        setLoading(true);
        const data = await api.searchPages(q);
        // Client-side tag filter when searching + filtering by tag
        if (activeTagId) {
          setPages(data.filter((p: any) => p.tags?.some((t: any) => t.id === activeTagId)));
        } else {
          setPages(data);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(handle);
  }, [search, activeTagId]);

  const handleDelete = async (id: number, title: string) => {
    try {
      await api.deletePage(id);
      setPages((prev) => prev.filter((p) => p.id !== id));
      showToast(t('pages.deleted_toast'), 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setConfirmDelete(null);
    }
  };

  const filtered = pages;

  // Build parent lookup for breadcrumbs
  const pageMap = new Map(pages.map(p => [p.id, p]));

  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString('de-DE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  if (loading) {
    return (
      <>
        <PageHeader title={t('pages.title')} />
        <div className="content-body"><Loading /></div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader title={t('pages.title')} />
        <div className="content-body">
          <div className="card error-card">
            <p>{t('pages.load_error')}{error}</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t('pages.title')}
        subtitle={t('pages.subtitle', { count: pages.length })}
        actions={
          <div className="btn-row">
            <button className="btn btn-secondary" onClick={() => setShowImport(true)}>
              <Upload size={16} />
              <span>{t('pages.import')}</span>
            </button>
            <a href={api.exportAll()} className="btn btn-secondary" download>
              <Download size={16} />
              <span>{t('pages.export_all')}</span>
            </a>
            {canCreate && (
              <Link to="/pages/new" className="btn btn-primary">
                <PlusCircle size={18} />
                <span>{t('pages.new_page')}</span>
              </Link>
            )}
          </div>
        }
      />

      <div className="content-body">
        {/* Search */}
        <div className="search-bar">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder={t('pages.search_placeholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Tag Filter */}
        {allTags.length > 0 && (
          <div className="tag-filter-bar">
            <TagIcon size={15} className="tag-filter-icon" />
            <div className="tag-filter-chips">
              {allTags.map(tag => (
                <button
                  key={tag.id}
                  className={`tag-chip ${activeTagId === tag.id ? 'active' : ''}`}
                  style={{
                    '--tag-color': tag.color,
                    '--tag-bg': tag.color + '18',
                  } as React.CSSProperties}
                  onClick={() => setActiveTagId(activeTagId === tag.id ? null : tag.id)}
                >
                  <span className="tag-chip-dot" style={{ background: tag.color }} />
                  {tag.name}
                  {activeTagId === tag.id && <X size={12} />}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Bulk Action Bar */}
        {canDelete && selectedIds.size > 0 && (
          <div className="bulk-action-bar">
            <div className="bulk-action-info">
              <CheckSquare size={18} />
              <span>{t('pages.selected_count', { count: selectedIds.size })}</span>
            </div>
            <div className="bulk-action-buttons">
              <button className="btn btn-secondary btn-sm" onClick={() => setSelectedIds(new Set())}>
                <X size={14} /> {t('pages.deselect_all')}
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => setConfirmBulkDelete(true)} disabled={bulkDeleting}>
                <Trash2 size={14} /> {t('pages.bulk_delete')}
              </button>
            </div>
          </div>
        )}

        {/* Pages List */}
        {filtered.length === 0 && !search ? (
          <EmptyState
            icon={<FileText size={48} />}
            title={t('pages.empty_title')}
            description={t('pages.empty_desc')}
            action={
              <Link to="/pages/new" className="btn btn-primary">
                <PlusCircle size={18} />
                <span>{t('pages.empty_action')}</span>
              </Link>
            }
          />
        ) : filtered.length === 0 && search ? (
          <EmptyState
            icon={<Search size={48} />}
            title={t('pages.no_results_title')}
            description={t('pages.no_results_desc', { query: search })}
          />
        ) : (
          <div className="pages-grid">
            {/* Select All */}
            {canDelete && filtered.length > 1 && (
              <div className="pages-select-all">
                <button className="page-checkbox" onClick={toggleSelectAll} title={selectedIds.size === filtered.length ? t('pages.deselect_all') : t('pages.select_all')}>
                  {selectedIds.size === filtered.length ? <CheckSquare size={18} /> : selectedIds.size > 0 ? <MinusSquare size={18} /> : <Square size={18} />}
                </button>
                <span className="pages-select-label">
                  {selectedIds.size === filtered.length ? t('pages.deselect_all') : t('pages.select_all')}
                </span>
              </div>
            )}
            {filtered.map((page, i) => (
              <div
                className={`page-card ${selectedIds.has(page.id) ? 'selected' : ''}`}
                key={page.id}
                style={{ animationDelay: `${i * 0.04}s` }}
              >
                <div className="page-card-header">
                  {canDelete && (
                    <button className="page-checkbox" onClick={() => toggleSelect(page.id)} title={t('pages.toggle_select')}>
                      {selectedIds.has(page.id) ? <CheckSquare size={18} /> : <Square size={18} />}
                    </button>
                  )}
                  <Link to={`/pages/${page.id}`} className="page-card-title">
                    <FileText size={18} className="page-card-icon" />
                    {page.parent_id && pageMap.get(page.parent_id) && (
                      <span className="page-parent-crumb">
                        {pageMap.get(page.parent_id)!.title} <ChevronRight size={12} />
                      </span>
                    )}
                    {page.title}
                    {page.content_type === 'html' && <span className="badge badge-html">HTML</span>}
                    {page.workflow_status && page.workflow_status !== 'published' && <span className="badge badge-draft">{({'draft':t('workflow.draft'),'in_review':t('workflow.in_review'),'changes_requested':t('pages.badge_changes'),'approved':t('workflow.approved'),'archived':t('workflow.archived')} as Record<string,string>)[page.workflow_status] || page.workflow_status}</span>}
                  </Link>
                  <div className="page-card-actions">
                    {canEdit && (
                      <Link
                        to={`/pages/${page.id}/edit`}
                        className="icon-btn"
                        title={t('common.edit')}
                      >
                        <Edit3 size={15} />
                      </Link>
                    )}
                    {canDelete && (
                      <button
                        className="icon-btn danger"
                        title={t('common.delete')}
                        onClick={() => setConfirmDelete({ id: page.id, title: page.title })}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
                {page.content && (
                  <p className="page-card-excerpt">
                    {page.content.substring(0, 180)}
                    {page.content.length > 180 ? '…' : ''}
                  </p>
                )}
                {(page as any).tags?.length > 0 && (
                  <div className="page-card-tags">
                    {(page as any).tags.map((t: any) => (
                      <span
                        key={t.id}
                        className="page-card-tag"
                        style={{ background: t.color + '20', color: t.color, borderColor: t.color + '40' }}
                        onClick={(e) => { e.preventDefault(); setActiveTagId(activeTagId === t.id ? null : t.id); }}
                      >
                        {t.name}
                      </span>
                    ))}
                  </div>
                )}
                <div className="page-card-meta">
                  <span>
                    <Clock size={13} />
                    {formatDate(page.updated_at)}
                  </span>
                  {(page as any).updated_by_name && (
                    <span><User size={13} /> {(page as any).updated_by_name}</span>
                  )}
                  <span>{page.content?.length || 0} chars</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showImport && (
        <ImportDialog
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); loadPages(); }}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={t('pages.delete_title')}
          message={t('pages.delete_message', { title: confirmDelete.title })}
          confirmLabel={t('pages.delete_confirm')}
          variant="danger"
          onConfirm={() => handleDelete(confirmDelete.id, confirmDelete.title)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {confirmBulkDelete && (
        <ConfirmDialog
          title={t('pages.bulk_delete_title')}
          message={t('pages.bulk_delete_message', { count: selectedIds.size })}
          confirmLabel={bulkDeleting ? t('pages.bulk_deleting') : t('pages.bulk_delete_confirm')}
          variant="danger"
          onConfirm={handleBulkDelete}
          onCancel={() => setConfirmBulkDelete(false)}
        />
      )}
    </>
  );
}
