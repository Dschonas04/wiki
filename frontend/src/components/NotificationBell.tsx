/**
 * NotificationBell – Benachrichtigungs-Glocke für die Sidebar
 *
 * Zeigt ungelesene Benachrichtigungen als Badge an.
 * Dropdown mit den neuesten Benachrichtigungen.
 */

import { useState, useEffect, useRef } from 'react';
import { Bell, Check, CheckCheck, ExternalLink, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, type Notification } from '../api/client';
import { useLanguage } from '../context/LanguageContext';

export default function NotificationBell() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  // Poll unread count every 30s
  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, []);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const fetchUnread = async () => {
    try {
      const data = await api.getUnreadCount();
      setUnreadCount(data.count);
    } catch { /* ignore */ }
  };

  const loadNotifications = async () => {
    try {
      const data = await api.getNotifications(20);
      setNotifications(data.items);
    } catch { /* ignore */ }
  };

  const toggleOpen = () => {
    if (!open) loadNotifications();
    setOpen(!open);
  };

  const markAsRead = async (id: number) => {
    try {
      await api.markNotificationRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch { /* ignore */ }
  };

  const markAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch { /* ignore */ }
  };

  const handleClick = (n: Notification) => {
    if (!n.is_read) markAsRead(n.id);
    if (n.link) {
      navigate(n.link);
      setOpen(false);
    }
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return 'Jetzt';
    if (mins < 60) return `${mins}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
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

  return (
    <div className="notification-bell" ref={ref}>
      <button className="notification-bell-btn" onClick={toggleOpen} title={t('notifications.title')}>
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="notification-dropdown">
          <div className="notification-dropdown-header">
            <span>{t('notifications.title')}</span>
            {unreadCount > 0 && (
              <button className="notification-mark-all" onClick={markAllRead} title={t('notifications.mark_all_read')}>
                <CheckCheck size={14} />
              </button>
            )}
          </div>

          <div className="notification-list">
            {notifications.length === 0 ? (
              <div className="notification-empty">{t('notifications.empty')}</div>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  className={`notification-item ${!n.is_read ? 'unread' : ''}`}
                  onClick={() => handleClick(n)}
                >
                  <span className="notification-type-icon">{typeIcon(n.type)}</span>
                  <div className="notification-content">
                    <span className="notification-title">{n.title}</span>
                    {n.message && <span className="notification-message">{n.message}</span>}
                  </div>
                  <span className="notification-time">{formatTime(n.created_at)}</span>
                  {!n.is_read && <span className="notification-dot" />}
                </button>
              ))
            )}
          </div>

          <button className="notification-dropdown-footer" onClick={() => { navigate('/notifications'); setOpen(false); }}>
            {t('notifications.view_all')}
            <ExternalLink size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
