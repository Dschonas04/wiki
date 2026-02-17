/**
 * Publishing.tsx – Veröffentlichungs-Workflow
 *
 * Admins/Auditors sehen alle offenen Anfragen und können prüfen.
 * Normale Benutzer sehen nur ihre eigenen Anfragen.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen, CheckCircle, XCircle, MessageSquare, Clock, Eye,
  ChevronDown, ChevronUp, Send, AlertTriangle,
} from 'lucide-react';
import { api, type PublishRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';

export default function Publishing() {
  const [requests, setRequests] = useState<PublishRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [actionComment, setActionComment] = useState('');
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'request_changes' | null>(null);
  const [actionRequestId, setActionRequestId] = useState<number | null>(null);
  const { isAdmin, isAuditor, user } = useAuth();
  const { showToast } = useToast();
  const { t, language } = useLanguage();

  const isReviewer = isAdmin || isAuditor;

  const load = useCallback(async () => {
    try {
      const data = await api.getPublishRequests();
      setRequests(data);
    } catch (err: any) {
      showToast(err.message || t('publishing.load_error'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
    pending: { label: t('publishing.status_pending'), color: '#f59e0b', icon: Clock },
    approved: { label: t('publishing.status_approved'), color: '#10b981', icon: CheckCircle },
    rejected: { label: t('publishing.status_rejected'), color: '#ef4444', icon: XCircle },
    changes_requested: { label: t('publishing.status_changes'), color: '#f97316', icon: AlertTriangle },
    cancelled: { label: t('publishing.status_cancelled'), color: '#6b7280', icon: XCircle },
  };

  const handleAction = async (requestId: number, action: 'approve' | 'reject' | 'request_changes') => {
    if (action !== 'approve' && !actionComment.trim()) {
      showToast(t('publishing.comment_required'), 'error');
      return;
    }
    try {
      if (action === 'approve') {
        await api.approvePublish(requestId, actionComment || undefined);
        showToast(t('publishing.approved_toast'), 'success');
      } else if (action === 'reject') {
        await api.rejectPublish(requestId, actionComment);
        showToast(t('publishing.rejected_toast'), 'success');
      } else {
        await api.requestChanges(requestId, actionComment);
        showToast(t('publishing.changes_toast'), 'success');
      }
      setActionType(null);
      setActionRequestId(null);
      setActionComment('');
      load();
    } catch (err: any) {
      showToast(err.message || 'Fehler', 'error');
    }
  };

  const handleCancel = async (requestId: number) => {
    if (!confirm(t('publishing.withdraw_confirm'))) return;
    try {
      await api.cancelPublish(requestId);
      showToast(t('publishing.withdrawn_toast'), 'success');
      load();
    } catch (err: any) {
      showToast(err.message || 'Fehler', 'error');
    }
  };

  if (loading) return <div className="content-body"><div className="loading-spinner" /></div>;

  const pending = requests.filter(r => r.status === 'pending');
  const resolved = requests.filter(r => r.status !== 'pending');

  return (
    <div className="content-body">
      <div className="page-header">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BookOpen size={28} /> {t('publishing.title')}
          </h1>
          <p className="page-subtitle">
            {isReviewer ? t('publishing.subtitle_reviewer') : t('publishing.subtitle_user')}
          </p>
        </div>
      </div>

      {/* Ausstehende Anfragen */}
      <h2 style={{ margin: '0 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Clock size={20} /> {t('publishing.section_pending', { count: pending.length })}
      </h2>

      {pending.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem', marginBottom: '2rem' }}>
          <p style={{ color: 'var(--color-text-secondary)' }}>{t('publishing.empty_pending')}</p>
        </div>
      ) : (
        pending.map(req => (
          <RequestCard
            key={req.id}
            request={req}
            expanded={expandedId === req.id}
            onToggle={() => setExpandedId(expandedId === req.id ? null : req.id)}
            isReviewer={isReviewer}
            isOwn={req.requested_by === user?.id}
            onAction={(action) => { setActionRequestId(req.id); setActionType(action); setActionComment(''); }}
            onCancel={() => handleCancel(req.id)}
            statusConfig={statusConfig}
          />
        ))
      )}

      {/* Aktions-Dialog */}
      {actionType && actionRequestId && (
        <div className="modal-overlay" onClick={() => { setActionType(null); setActionRequestId(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
            <h2>
              {actionType === 'approve' ? t('publishing.approve') : actionType === 'reject' ? t('publishing.reject') : t('publishing.request_changes')}
            </h2>
            <div className="form-group">
              <label>{actionType === 'approve' ? t('publishing.comment_optional') : t('publishing.reason_required')}</label>
              <textarea
                value={actionComment}
                onChange={e => setActionComment(e.target.value)}
                rows={3}
                placeholder={actionType === 'approve' ? t('publishing.comment_placeholder') : t('publishing.reason_placeholder')}
                required={actionType !== 'approve'}
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => { setActionType(null); setActionRequestId(null); }}>
                {t('common.cancel')}
              </button>
              <button
                className={`btn ${actionType === 'approve' ? 'btn-success' : actionType === 'reject' ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => handleAction(actionRequestId, actionType)}
              >
                {actionType === 'approve' && <><CheckCircle size={16} /> {t('publishing.approve')}</>}
                {actionType === 'reject' && <><XCircle size={16} /> {t('publishing.reject')}</>}
                {actionType === 'request_changes' && <><MessageSquare size={16} /> {t('publishing.request_changes')}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Abgeschlossene Anfragen */}
      {resolved.length > 0 && (
        <>
          <h2 style={{ margin: '2rem 0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {t('publishing.section_history', { count: resolved.length })}
          </h2>
          {resolved.map(req => (
            <RequestCard
              key={req.id}
              request={req}
              expanded={expandedId === req.id}
              onToggle={() => setExpandedId(expandedId === req.id ? null : req.id)}
              isReviewer={false}
              isOwn={req.requested_by === user?.id}
              onAction={() => {}}
              onCancel={() => {}}
              statusConfig={statusConfig}
            />
          ))}
        </>
      )}
    </div>
  );
}

/* Einzelne Anfrage-Karte */
function RequestCard({
  request: req, expanded, onToggle, isReviewer, isOwn,
  onAction, onCancel, statusConfig,
}: {
  request: PublishRequest;
  expanded: boolean;
  onToggle: () => void;
  isReviewer: boolean;
  isOwn: boolean;
  onAction: (action: 'approve' | 'reject' | 'request_changes') => void;
  onCancel: () => void;
  statusConfig: Record<string, { label: string; color: string; icon: any }>;
}) {
  const { t, language } = useLanguage();
  const sc = statusConfig[req.status] || statusConfig.pending;
  const StatusIcon = sc.icon;

  return (
    <div className="card" style={{ marginBottom: '0.75rem' }}>
      {/* Kopfzeile */}
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        onClick={onToggle}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <StatusIcon size={18} style={{ color: sc.color }} />
          <div>
            <Link to={`/pages/${req.page_id}`} style={{ fontWeight: 600, textDecoration: 'none', color: 'var(--color-text)' }} onClick={e => e.stopPropagation()}>
              {req.page_title}
            </Link>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '0.125rem' }}>
              {t('publishing.from')}{req.requested_by_name} · {t('publishing.target')}{req.target_space_name}
              {req.target_folder_name && ` / ${req.target_folder_name}`}
              {' · '}
              {new Date(req.created_at).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 500, color: sc.color, padding: '0.25rem 0.5rem', borderRadius: '4px', background: `${sc.color}15` }}>
            {sc.label}
          </span>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {/* Details */}
      {expanded && (
        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
          {req.comment && (
            <div style={{ marginBottom: '0.75rem', padding: '0.75rem', background: 'var(--color-bg-secondary, var(--color-surface))', borderRadius: '6px', fontSize: '0.875rem' }}>
              <strong>{t('publishing.note')}</strong> {req.comment}
            </div>
          )}
          {req.review_comment && (
            <div style={{ marginBottom: '0.75rem', padding: '0.75rem', background: '#fef3c715', borderRadius: '6px', fontSize: '0.875rem', borderLeft: '3px solid #f59e0b' }}>
              <strong>{t('publishing.reviewer_comment')}</strong> {req.review_comment}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <Link to={`/pages/${req.page_id}`} className="btn btn-secondary btn-sm">
              <Eye size={14} /> {t('publishing.btn_preview')}
            </Link>
            {req.status === 'pending' && isReviewer && (
              <>
                <button className="btn btn-success btn-sm" onClick={() => onAction('approve')}>
                  <CheckCircle size={14} /> {t('publishing.approve')}
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => onAction('request_changes')}>
                  <MessageSquare size={14} /> {t('publishing.btn_changes')}
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => onAction('reject')}>
                  <XCircle size={14} /> {t('publishing.reject')}
                </button>
              </>
            )}
            {req.status === 'pending' && isOwn && !isReviewer && (
              <button className="btn btn-secondary btn-sm" onClick={onCancel}>
                {t('publishing.btn_withdraw')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
