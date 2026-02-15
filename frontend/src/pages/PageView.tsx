import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Edit3, Trash2, ArrowLeft, Calendar, RefreshCw, User } from 'lucide-react';
import { api, type WikiPage } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import Loading from '../components/Loading';

export default function PageView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [page, setPage] = useState<WikiPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { showToast } = useToast();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('pages.edit');
  const canDelete = hasPermission('pages.delete');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .getPage(id)
      .then(setPage)
      .catch((err) => setError(err.status === 404 ? 'Page not found.' : err.message))
      .finally(() => setLoading(false));
  }, [id]);

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

  const formatDateLong = (s: string) =>
    new Date(s).toLocaleDateString('de-DE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

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
            {canEdit && (
              <Link to={`/pages/${page.id}/edit`} className="btn btn-primary">
                <Edit3 size={16} />
                <span>Edit</span>
              </Link>
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
        <div className="card page-view-card">
          <div className="page-view-content">
            {page.content.split('\n').map((line, i) => (
              <p key={i}>{line || '\u00A0'}</p>
            ))}
          </div>
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
    </>
  );
}
