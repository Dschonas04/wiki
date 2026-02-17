import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, PlusCircle, Clock, Edit3, Trash2, Search, User, Download, ChevronRight, Upload, Tag as TagIcon, X } from 'lucide-react';
import { api, type WikiPage, type Tag } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
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
  const { showToast } = useToast();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('pages.create');
  const canEdit = hasPermission('pages.edit');
  const canDelete = hasPermission('pages.delete');

  // Load available tags once
  useEffect(() => {
    api.getTags().then(setAllTags).catch(() => {});
  }, []);

  const loadPages = async (tagId?: number | null) => {
    try {
      setLoading(true);
      const data = await api.getPages(tagId ?? undefined);
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
      showToast('Page moved to trash', 'success');
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
        <PageHeader title="Pages" />
        <div className="content-body"><Loading /></div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader title="Pages" />
        <div className="content-body">
          <div className="card error-card">
            <p>Could not load pages: {error}</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Pages"
        subtitle={`${pages.length} page${pages.length !== 1 ? 's' : ''} in your wiki`}
        actions={
          <div className="btn-row">
            <button className="btn btn-secondary" onClick={() => setShowImport(true)}>
              <Upload size={16} />
              <span>Import</span>
            </button>
            <a href={api.exportAll()} className="btn btn-secondary" download>
              <Download size={16} />
              <span>Export All</span>
            </a>
            {canCreate && (
              <Link to="/pages/new" className="btn btn-primary">
                <PlusCircle size={18} />
                <span>New Page</span>
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
            placeholder="Search pages…"
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

        {/* Pages List */}
        {filtered.length === 0 && !search ? (
          <EmptyState
            icon={<FileText size={48} />}
            title="No pages yet"
            description="Create your first page to get started!"
            action={
              <Link to="/pages/new" className="btn btn-primary">
                <PlusCircle size={18} />
                <span>Create Page</span>
              </Link>
            }
          />
        ) : filtered.length === 0 && search ? (
          <EmptyState
            icon={<Search size={48} />}
            title="No results"
            description={`No pages matching "${search}"`}
          />
        ) : (
          <div className="pages-grid">
            {filtered.map((page, i) => (
              <div
                className="page-card"
                key={page.id}
                style={{ animationDelay: `${i * 0.04}s` }}
              >
                <div className="page-card-header">
                  <Link to={`/pages/${page.id}`} className="page-card-title">
                    <FileText size={18} className="page-card-icon" />
                    {page.parent_id && pageMap.get(page.parent_id) && (
                      <span className="page-parent-crumb">
                        {pageMap.get(page.parent_id)!.title} <ChevronRight size={12} />
                      </span>
                    )}
                    {page.title}
                    {page.content_type === 'html' && <span className="badge badge-html">HTML</span>}
                    {page.visibility === 'draft' && <span className="badge badge-draft">Draft</span>}
                  </Link>
                  <div className="page-card-actions">
                    {canEdit && (
                      <Link
                        to={`/pages/${page.id}/edit`}
                        className="icon-btn"
                        title="Edit"
                      >
                        <Edit3 size={15} />
                      </Link>
                    )}
                    {canDelete && (
                      <button
                        className="icon-btn danger"
                        title="Delete"
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
          title="Delete Page?"
          message={`"${confirmDelete.title}" will be moved to trash. You can restore it later.`}
          confirmLabel="Move to Trash"
          variant="danger"
          onConfirm={() => handleDelete(confirmDelete.id, confirmDelete.title)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </>
  );
}
