import { useEffect, useState } from 'react';
import { ScrollText, ChevronLeft, ChevronRight } from 'lucide-react';
import { api, type AuditEntry } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import PageHeader from '../components/PageHeader';
import Loading from '../components/Loading';

const ACTION_COLORS: Record<string, string> = {
  login: 'green',
  logout: 'gray',
  login_failed: 'red',
  create_page: 'blue',
  update_page: 'orange',
  delete_page: 'red',
  restore_page: 'purple',
  create_user: 'blue',
  update_user: 'orange',
  delete_user: 'red',
};

export default function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const limit = 30;
  const { showToast } = useToast();
  const { t, language } = useLanguage();

  const load = async (newOffset: number) => {
    try {
      setLoading(true);
      const data = await api.getAudit(limit, newOffset);
      setEntries(data.items);
      setTotal(data.total);
      setOffset(newOffset);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(0); }, []);

  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });

  if (loading && entries.length === 0) return (<><PageHeader title={t('audit.title')} /><div className="content-body"><Loading /></div></>);

  return (
    <>
      <PageHeader
        title={t('audit.title')}
        subtitle={t('audit.subtitle', { count: total })}
      />

      <div className="content-body">
        <div className="users-table-wrap">
          <table className="users-table audit-table">
            <thead>
              <tr>
                <th>{t('audit.th_time')}</th>
                <th>{t('audit.th_user')}</th>
                <th>{t('audit.th_action')}</th>
                <th>{t('audit.th_resource')}</th>
                <th>{t('audit.th_ip')}</th>
                <th>{t('audit.th_details')}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="meta-text nowrap">{formatDate(e.created_at)}</td>
                  <td>{e.username || '—'}</td>
                  <td>
                    <span className={`action-badge action-${ACTION_COLORS[e.action] || 'gray'}`}>
                      {e.action.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td>{e.resource_type ? `${e.resource_type} #${e.resource_id || '—'}` : '—'}</td>
                  <td className="meta-text">{e.ip_address || '—'}</td>
                  <td className="meta-text">{e.details ? JSON.stringify(e.details).substring(0, 60) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {total > limit && (
          <div className="pagination">
            <button
              className="btn btn-secondary btn-sm"
              disabled={offset === 0}
              onClick={() => load(Math.max(0, offset - limit))}
            >
              <ChevronLeft size={16} /> {t('audit.prev')}
            </button>
            <span className="pagination-info">
              {t('audit.page_info', { page: `${offset + 1}–${Math.min(offset + limit, total)}`, total })}
            </span>
            <button
              className="btn btn-secondary btn-sm"
              disabled={offset + limit >= total}
              onClick={() => load(offset + limit)}
            >
              {t('audit.next')} <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
