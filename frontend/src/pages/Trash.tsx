import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, RotateCcw, AlertTriangle, X } from 'lucide-react';
import { api, type TrashItem } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';
import ConfirmDialog from '../components/ConfirmDialog';

export default function Trash() {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<{ id: number; title: string } | null>(null);
  const { showToast } = useToast();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('pages.edit');
  const canDelete = hasPermission('pages.delete');

  const load = async () => {
    try {
      setLoading(true);
      const data = await api.getTrash();
      setItems(data);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleRestore = async (id: number) => {
    try {
      await api.restoreFromTrash(id);
      setItems(prev => prev.filter(i => i.id !== id));
      showToast('Seite wiederhergestellt', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handlePermanentDelete = async () => {
    if (!confirm) return;
    try {
      await api.permanentDelete(confirm.id);
      setItems(prev => prev.filter(i => i.id !== confirm.id));
      showToast('Seite endgültig gelöscht', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setConfirm(null);
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
        <PageHeader title="Papierkorb" subtitle="Gelöschte Seiten" />
        <div className="content-body"><Loading /></div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Papierkorb" subtitle={`${items.length} gelöschte Seiten`} />

      <div className="content-body">
        {items.length === 0 ? (
          <EmptyState
            icon={<Trash2 size={48} />}
            title="Papierkorb ist leer"
            description="Gelöschte Seiten werden hier angezeigt und können wiederhergestellt werden."
          />
        ) : (
          <div className="trash-list">
            {items.map(item => (
              <div key={item.id} className="trash-item">
                <div className="trash-item-info">
                  <span className="trash-item-title">
                    <Trash2 size={16} />
                    {item.title}
                  </span>
                  <span className="trash-item-meta">
                    Gelöscht {formatDate(item.deleted_at)}
                    {item.deleted_by_name && ` von ${item.deleted_by_name}`}
                  </span>
                </div>
                <div className="trash-item-actions">
                  {canEdit && (
                    <button className="btn btn-sm btn-secondary" onClick={() => handleRestore(item.id)} title="Wiederherstellen">
                      <RotateCcw size={14} /> Wiederherstellen
                    </button>
                  )}
                  {canDelete && (
                    <button className="btn btn-sm btn-danger" onClick={() => setConfirm({ id: item.id, title: item.title })} title="Endgültig löschen">
                      <X size={14} /> Löschen
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {confirm && (
        <ConfirmDialog
          title="Endgültig löschen?"
          message={`"${confirm.title}" wird endgültig gelöscht. Dies kann nicht rückgängig gemacht werden.`}
          confirmLabel="Endgültig löschen"
          variant="danger"
          onConfirm={handlePermanentDelete}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}
