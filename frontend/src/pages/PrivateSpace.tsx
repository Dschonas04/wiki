/**
 * PrivateSpace.tsx – Privater Bereich des Benutzers
 *
 * Zeigt eigene Entwürfe und ermöglicht das Erstellen/Bearbeiten
 * von privaten Seiten sowie deren Veröffentlichung.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Lock, FileText, Plus, Send, Edit3, Trash2, Clock,
} from 'lucide-react';
import { api, type WikiPage, type TeamSpace, type Folder } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function PrivateSpacePage() {
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [publishPageId, setPublishPageId] = useState<number | null>(null);
  const [spaces, setSpaces] = useState<TeamSpace[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [targetSpaceId, setTargetSpaceId] = useState(0);
  const [targetFolderId, setTargetFolderId] = useState<number | undefined>();
  const [publishNote, setPublishNote] = useState('');
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const data = await api.getPrivateSpace();
      setPages(data.pages || []);
    } catch (err: any) {
      showToast(err.message || 'Fehler beim Laden', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const statusLabel = (status?: string) => {
    const labels: Record<string, string> = {
      draft: 'Entwurf', in_review: 'In Prüfung', changes_requested: 'Änderungen angefragt',
      approved: 'Genehmigt', published: 'Veröffentlicht', archived: 'Archiviert',
    };
    return labels[status || ''] || status || '';
  };

  const statusColor = (status?: string) => {
    const colors: Record<string, string> = {
      draft: '#6b7280', in_review: '#f59e0b', changes_requested: '#ef4444',
      approved: '#10b981', published: '#3b82f6', archived: '#9ca3af',
    };
    return colors[status || ''] || '#6b7280';
  };

  // Veröffentlichung starten
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

  // Ordner beim Space-Wechsel laden
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
      showToast('Veröffentlichung beantragt', 'success');
      setShowPublishDialog(false);
      load();
    } catch (err: any) {
      showToast(err.message || 'Fehler', 'error');
    }
  };

  // Seite löschen
  const handleDelete = async (pageId: number, title: string) => {
    if (!confirm(`"${title}" wirklich löschen?`)) return;
    try {
      await api.deletePrivatePage(pageId);
      showToast('Seite gelöscht', 'success');
      setPages(prev => prev.filter(p => p.id !== pageId));
    } catch (err: any) {
      showToast(err.message || 'Fehler', 'error');
    }
  };

  if (loading) return <div className="content-body"><div className="loading-spinner" /></div>;

  const drafts = pages.filter(p => p.workflow_status === 'draft' || p.workflow_status === 'changes_requested');
  const inReview = pages.filter(p => p.workflow_status === 'in_review');
  const published = pages.filter(p => p.workflow_status === 'published' || p.workflow_status === 'approved');

  return (
    <div className="content-body">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Lock size={28} /> Mein Bereich
          </h1>
          <p className="page-subtitle">Persönliche Entwürfe und Notizen – nur für dich sichtbar</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/pages/new?private=1')}>
          <Plus size={16} /> Neuer Entwurf
        </button>
      </div>

      {/* Entwürfe */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem' }}>
          <Edit3 size={18} /> Entwürfe ({drafts.length})
        </h3>
        {drafts.length === 0 ? (
          <p style={{ color: 'var(--color-text-secondary)' }}>Keine Entwürfe vorhanden. Erstelle einen neuen, um loszulegen.</p>
        ) : (
          drafts.map(page => (
            <div key={page.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 0', borderBottom: '1px solid var(--color-border)' }}>
              <div>
                <Link to={`/pages/${page.id}`} style={{ textDecoration: 'none', color: 'var(--color-text)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FileText size={14} /> {page.title}
                </Link>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
                  {page.workflow_status === 'changes_requested' && (
                    <span style={{ color: '#ef4444', fontWeight: 500 }}>Änderungen angefragt · </span>
                  )}
                  Zuletzt geändert: {new Date(page.updated_at || '').toLocaleDateString('de-DE')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => navigate(`/pages/${page.id}/edit`)}
                  title="Bearbeiten"
                >
                  <Edit3 size={14} />
                </button>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => openPublishDialog(page.id)}
                  title="Zur Veröffentlichung einreichen"
                >
                  <Send size={14} />
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => handleDelete(page.id, page.title)}
                  title="Löschen"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* In Prüfung */}
      {inReview.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem' }}>
            <Clock size={18} /> In Prüfung ({inReview.length})
          </h3>
          {inReview.map(page => (
            <div key={page.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 0', borderBottom: '1px solid var(--color-border)' }}>
              <Link to={`/pages/${page.id}`} style={{ textDecoration: 'none', color: 'var(--color-text)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileText size={14} /> {page.title}
              </Link>
              <span style={{ fontSize: '0.75rem', color: '#f59e0b', fontWeight: 500 }}>
                Warte auf Prüfung
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Veröffentlicht */}
      {published.length > 0 && (
        <div className="card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem' }}>
            <FileText size={18} /> Veröffentlicht ({published.length})
          </h3>
          {published.map(page => (
            <div key={page.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 0', borderBottom: '1px solid var(--color-border)' }}>
              <Link to={`/pages/${page.id}`} style={{ textDecoration: 'none', color: 'var(--color-text)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileText size={14} /> {page.title}
              </Link>
              <span style={{ fontSize: '0.75rem', color: statusColor(page.workflow_status), fontWeight: 500 }}>
                {statusLabel(page.workflow_status)}
              </span>
            </div>
          ))}
        </div>
      )}

      {pages.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <Lock size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
          <h3>Dein privater Bereich</h3>
          <p style={{ color: 'var(--color-text-secondary)' }}>Hier kannst du Entwürfe erstellen und später zur Veröffentlichung einreichen.</p>
          <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => navigate('/pages/new?private=1')}>
            <Plus size={16} /> Ersten Entwurf erstellen
          </button>
        </div>
      )}

      {/* Veröffentlichungs-Dialog */}
      {showPublishDialog && (
        <div className="modal-overlay" onClick={() => setShowPublishDialog(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <h2>Veröffentlichung beantragen</h2>
            <form onSubmit={handlePublish}>
              <div className="form-group">
                <label>Ziel-Bereich *</label>
                <select value={targetSpaceId} onChange={e => handleSpaceChange(parseInt(e.target.value))} required>
                  <option value={0}>Bereich auswählen…</option>
                  {spaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              {folders.length > 0 && (
                <div className="form-group">
                  <label>Ordner (optional)</label>
                  <select value={targetFolderId || ''} onChange={e => setTargetFolderId(e.target.value ? parseInt(e.target.value) : undefined)}>
                    <option value="">Kein Ordner</option>
                    {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label>Notiz (optional)</label>
                <textarea value={publishNote} onChange={e => setPublishNote(e.target.value)} rows={3} placeholder="Anmerkungen für die Prüfer…" />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowPublishDialog(false)}>Abbrechen</button>
                <button type="submit" className="btn btn-primary" disabled={!targetSpaceId}>
                  <Send size={16} /> Einreichen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
