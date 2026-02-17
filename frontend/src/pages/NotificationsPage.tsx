/**
 * NotificationsPage – Alle Benachrichtigungen anzeigen
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck, Trash2, ExternalLink } from 'lucide-react';
import { api, type Notification } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import PageHeader from '../components/PageHeader';
import Loading from '../components/Loading';

export default function NotificationsPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { t } = useLanguage();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    try {
      const data = await api.getNotifications(100);
      setNotifications(data.items);
      setTotal(data.total);
    } catch {
      showToast(t('notifications.load_error'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id: number) => {
    try {
      await api.markNotificationRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch { /* ignore */ }
  };

  const markAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      showToast(t('notifications.all_read'), 'success');
    } catch { /* ignore */ }
  };

  const deleteNotification = async (id: number) => {
    try {
      await api.deleteNotification(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch { /* ignore */ }
  };

  const handleClick = (n: Notification) => {
    if (!n.is_read) markAsRead(n.id);
    if (n.link) navigate(n.link);
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case 'comment': return '💬';
      case 'reply': return '↩️';
      case 'publish': return '📢';
      case 'mention': return '📌';
      default: return '🔔';
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <>
      <PageHeader
        title={t('notifications.page_title')}
        subtitle={`${total} ${t('notifications.total')} · ${unreadCount} ${t('notifications.unread')}`}
      />

      <div className="content-body">
        {unreadCount > 0 && (
          <div className="notifications-actions-bar">
            <button className="btn btn-secondary btn-sm" onClick={markAllRead}>
              <CheckCheck size={14} /> {t('notifications.mark_all_read')}
            </button>
          </div>
        )}

        {loading ? (
          <Loading />
        ) : notifications.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <Bell size={40} style={{ color: 'var(--c-text-muted)', marginBottom: '1rem' }} />
            <h3>{t('notifications.empty_title')}</h3>
            <p style={{ color: 'var(--c-text-muted)' }}>{t('notifications.empty_desc')}</p>
          </div>
        ) : (
          <div className="notifications-list-page">
            {notifications.map(n => (
              <div key={n.id} className={`notification-page-item ${!n.is_read ? 'unread' : ''}`}>
                <span className="notification-page-icon">{typeIcon(n.type)}</span>
                <div className="notification-page-content" onClick={() => handleClick(n)} style={{ cursor: n.link ? 'pointer' : 'default' }}>
                  <span className="notification-page-title">{n.title}</span>
                  {n.message && <span className="notification-page-message">{n.message}</span>}
                  <span className="notification-page-time">{formatDate(n.created_at)}</span>
                </div>
                <div className="notification-page-actions">
                  {!n.is_read && (
                    <button className="icon-btn" onClick={() => markAsRead(n.id)} title={t('notifications.mark_read')}>
                      <Check size={14} />
                    </button>
                  )}
                  <button className="icon-btn danger" onClick={() => deleteNotification(n.id)} title={t('common.delete')}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
