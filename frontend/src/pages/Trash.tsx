import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, RotateCcw, AlertTriangle, X } from 'lucide-react';
import { api, type TrashItem } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
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
  const { t, language } = useLanguage();
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
      showToast(t('trash.restored_toast'), 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handlePermanentDelete = async () => {
    if (!confirm) return;
    try {
      await api.permanentDelete(confirm.id);
      setItems(prev => prev.filter(i => i.id !== confirm.id));
      showToast(t('trash.deleted_toast'), 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setConfirm(null);
    }
  };

  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  if (loading) {
    return (
      <>
        <PageHeader title={t('trash.title')} subtitle={t('trash.subtitle_loading')} />
        <div className="content-body"><Loading /></div>
      </>
    );
  }

  return (
    <>
      <PageHeader title={t('trash.title')} subtitle={t('trash.subtitle', { count: items.length })} />

      <div className="content-body">
        {items.length === 0 ? (
          <EmptyState
            icon={<Trash2 size={48} />}
            title={t('trash.empty_title')}
            description={t('trash.empty_desc')}
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
                    {t('trash.deleted_at', { date: formatDate(item.deleted_at) })}
                    {item.deleted_by_name && ` — ${t('trash.deleted_by', { name: item.deleted_by_name })}`}
                  </span>
                </div>
                <div className="trash-item-actions">
                  {canEdit && (
                    <button className="btn btn-sm btn-secondary" onClick={() => handleRestore(item.id)} title={t('trash.restore_title')}>
                      <RotateCcw size={14} /> {t('common.restore')}
                    </button>
                  )}
                  {canDelete && (
                    <button className="btn btn-sm btn-danger" onClick={() => setConfirm({ id: item.id, title: item.title })} title={t('trash.permanent_delete_title')}>
                      <X size={14} /> {t('common.delete')}
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
          title={t('trash.delete_dialog_title')}
          message={t('trash.delete_dialog_message', { title: confirm.title })}
          confirmLabel={t('trash.delete_dialog_confirm')}
          variant="danger"
          onConfirm={handlePermanentDelete}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}
