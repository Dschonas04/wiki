import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Clock, RotateCcw, ArrowLeft } from 'lucide-react';
import { api, type PageVersion } from '../api/client';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/PageHeader';
import Loading from '../components/Loading';

export default function PageHistory() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [versions, setVersions] = useState<PageVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data = await api.getPageVersions(id);
      setVersions(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const handleRestore = async (versionId: number) => {
    if (!id) return;
    if (!confirm('Restore this version? The current content will be saved to history.')) return;
    try {
      await api.restorePageVersion(id, versionId);
      showToast('Version restored', 'success');
      navigate(`/pages/${id}`);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

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
        <PageHeader title="Page History" />
        <div className="content-body"><Loading /></div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader title="Page History" />
        <div className="content-body">
          <div className="card error-card">
            <p>Could not load history: {error}</p>
            <div className="btn-row" style={{ marginTop: 12 }}>
              <Link to={`/pages/${id}`} className="btn btn-secondary">
                <ArrowLeft size={16} /> Back to Page
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Page History" subtitle={`${versions.length} version${versions.length !== 1 ? 's' : ''}`} />

      <div className="content-body">
        {versions.length === 0 ? (
          <div className="card">
            <p>No history yet.</p>
          </div>
        ) : (
          <div className="history-list">
            {versions.map((v) => (
              <div className="history-item" key={v.id}>
                <div className="history-meta">
                  <div className="history-version">v{v.version_number}</div>
                  <div className="history-time">
                    <Clock size={14} /> {formatDate(v.created_at)}
                  </div>
                  <div className="history-user">{v.created_by_name || '—'}</div>
                </div>
                <div className="history-title">{v.title}</div>
                <div className="history-actions">
                  <button className="btn btn-secondary" onClick={() => handleRestore(v.id)}>
                    <RotateCcw size={14} /> Restore
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="btn-row" style={{ marginTop: 18 }}>
          <Link to={`/pages/${id}`} className="btn btn-secondary">
            <ArrowLeft size={16} /> Back to Page
          </Link>
        </div>
      </div>
    </>
  );
}
