import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Clock, RotateCcw, ArrowLeft, GitCompare } from 'lucide-react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { api, type PageVersion } from '../api/client';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/PageHeader';
import Loading from '../components/Loading';
import ConfirmDialog from '../components/ConfirmDialog';

export default function PageHistory() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [versions, setVersions] = useState<PageVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmRestore, setConfirmRestore] = useState<number | null>(null);
  const [diffVersions, setDiffVersions] = useState<[number, number] | null>(null);

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

  const handleRestore = async () => {
    if (!id || confirmRestore === null) return;
    try {
      await api.restorePageVersion(id, confirmRestore);
      showToast('Version restored', 'success');
      navigate(`/pages/${id}`);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setConfirmRestore(null);
    }
  };

  // Simple diff: line-by-line comparison
  const computeDiff = (oldText: string, newText: string) => {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    const result: { type: 'same' | 'added' | 'removed'; text: string }[] = [];
    const maxLen = Math.max(oldLines.length, newLines.length);
    let oi = 0, ni = 0;
    while (oi < oldLines.length || ni < newLines.length) {
      if (oi < oldLines.length && ni < newLines.length && oldLines[oi] === newLines[ni]) {
        result.push({ type: 'same', text: oldLines[oi] });
        oi++; ni++;
      } else if (oi < oldLines.length && (ni >= newLines.length || !newLines.slice(ni, ni + 3).includes(oldLines[oi]))) {
        result.push({ type: 'removed', text: oldLines[oi] });
        oi++;
      } else {
        result.push({ type: 'added', text: newLines[ni] });
        ni++;
      }
    }
    return result;
  };

  const getDiffData = () => {
    if (!diffVersions) return null;
    const [oldIdx, newIdx] = diffVersions;
    const oldV = versions.find(v => v.id === oldIdx);
    const newV = versions.find(v => v.id === newIdx);
    if (!oldV || !newV) return null;
    return {
      oldVersion: oldV,
      newVersion: newV,
      lines: computeDiff(oldV.content, newV.content),
    };
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
          <>
            {/* Diff view */}
            {diffVersions && (() => {
              const diff = getDiffData();
              if (!diff) return null;
              return (
                <div className="diff-section">
                  <div className="diff-header">
                    <h3><GitCompare size={16} /> Comparing v{diff.oldVersion.version_number} → v{diff.newVersion.version_number}</h3>
                    <button className="btn btn-sm btn-secondary" onClick={() => setDiffVersions(null)}>Close</button>
                  </div>
                  <div className="diff-content">
                    {diff.lines.map((line, i) => (
                      <div key={i} className={`diff-line diff-${line.type}`}>
                        <span className="diff-indicator">{line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}</span>
                        <span className="diff-text">{line.text || '\u00A0'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div className="history-list">
              {versions.map((v, i) => (
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
                    {i < versions.length - 1 && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setDiffVersions([versions[i + 1].id, v.id])}
                        title="Compare with previous version"
                      >
                        <GitCompare size={14} /> Diff
                      </button>
                    )}
                    <button className="btn btn-secondary btn-sm" onClick={() => setConfirmRestore(v.id)}>
                      <RotateCcw size={14} /> Restore
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="btn-row" style={{ marginTop: 18 }}>
          <Link to={`/pages/${id}`} className="btn btn-secondary">
            <ArrowLeft size={16} /> Back to Page
          </Link>
        </div>
      </div>

      {confirmRestore !== null && (
        <ConfirmDialog
          title="Restore Version?"
          message="The current content will be saved to history before restoring this version."
          confirmLabel="Restore"
          variant="warning"
          onConfirm={handleRestore}
          onCancel={() => setConfirmRestore(null)}
        />
      )}
    </>
  );
}
