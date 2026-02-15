import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, PlusCircle, Clock, Edit3, Trash2, Search, User } from 'lucide-react';
import { api, type WikiPage } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';

export default function Pages() {
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const { showToast } = useToast();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('pages.create');
  const canEdit = hasPermission('pages.edit');
  const canDelete = hasPermission('pages.delete');

  const loadPages = async () => {
    try {
      setLoading(true);
      const data = await api.getPages();
      setPages(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPages();
  }, []);

  const handleDelete = async (id: number, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      await api.deletePage(id);
      setPages((prev) => prev.filter((p) => p.id !== id));
      showToast('Page deleted', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const filtered = pages.filter(
    (p) =>
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.content.toLowerCase().includes(search.toLowerCase())
  );

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
          canCreate ? (
            <Link to="/pages/new" className="btn btn-primary">
              <PlusCircle size={18} />
              <span>New Page</span>
            </Link>
          ) : undefined
        }
      />

      <div className="content-body">
        {/* Search */}
        {pages.length > 0 && (
          <div className="search-bar">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Search pages…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
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
                    {page.title}
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
                        onClick={() => handleDelete(page.id, page.title)}
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
    </>
  );
}
