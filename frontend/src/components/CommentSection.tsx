/**
 * CommentSection – Kommentarbereich für Wiki-Seiten
 *
 * Features:
 * - Verschachtelte Kommentare (Threads)
 * - Bearbeiten und Löschen eigener Kommentare
 * - Echtzeit-ähnliche Updates
 */

import { useState, useEffect, useRef } from 'react';
import { MessageSquare, Reply, Edit3, Trash2, Send, X, ChevronDown, ChevronUp } from 'lucide-react';
import { api, type Comment } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';

interface CommentSectionProps {
  pageId: number;
}

export default function CommentSection({ pageId }: CommentSectionProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { t } = useLanguage();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadComments();
  }, [pageId]);

  const loadComments = async () => {
    try {
      const data = await api.getComments(pageId);
      setComments(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!newComment.trim() || sending) return;
    setSending(true);
    try {
      const comment = await api.createComment(pageId, newComment.trim());
      setComments(prev => [...prev, comment]);
      setNewComment('');
      showToast(t('comments.created'), 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSending(false);
    }
  };

  const handleReply = async () => {
    if (!replyContent.trim() || !replyTo || sending) return;
    setSending(true);
    try {
      const comment = await api.createComment(pageId, replyContent.trim(), replyTo);
      setComments(prev => [...prev, comment]);
      setReplyTo(null);
      setReplyContent('');
      showToast(t('comments.created'), 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSending(false);
    }
  };

  const handleEdit = async (id: number) => {
    if (!editContent.trim()) return;
    try {
      const updated = await api.updateComment(id, editContent.trim());
      setComments(prev => prev.map(c => c.id === id ? updated : c));
      setEditId(null);
      setEditContent('');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(t('comments.delete_confirm'))) return;
    try {
      await api.deleteComment(id);
      setComments(prev => prev.filter(c => c.id !== id && c.parent_id !== id));
      showToast(t('comments.deleted'), 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Build tree structure
  const rootComments = comments.filter(c => !c.parent_id);
  const getReplies = (parentId: number) => comments.filter(c => c.parent_id === parentId);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return t('comments.just_now');
    if (mins < 60) return `${mins}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };

  const CommentItem = ({ comment, depth = 0 }: { comment: Comment; depth?: number }) => {
    const isOwn = user?.id === comment.user_id;
    const isAdmin = user?.globalRole === 'admin';
    const replies = getReplies(comment.id);
    const isEditing = editId === comment.id;

    return (
      <div className={`comment-item ${depth > 0 ? 'comment-reply' : ''}`}>
        <div className="comment-header">
          <div className="comment-avatar">{(comment.display_name || comment.username)?.[0]?.toUpperCase()}</div>
          <div className="comment-meta">
            <span className="comment-author">{comment.display_name || comment.username}</span>
            <span className="comment-time">{formatDate(comment.created_at)}</span>
            {comment.updated_at !== comment.created_at && (
              <span className="comment-edited">({t('comments.edited')})</span>
            )}
          </div>
          <div className="comment-actions">
            {depth === 0 && (
              <button className="comment-action-btn" onClick={() => { setReplyTo(comment.id); setTimeout(() => replyRef.current?.focus(), 50); }} title={t('comments.reply')}>
                <Reply size={13} />
              </button>
            )}
            {(isOwn || isAdmin) && (
              <>
                <button className="comment-action-btn" onClick={() => { setEditId(comment.id); setEditContent(comment.content); }} title={t('common.edit')}>
                  <Edit3 size={13} />
                </button>
                <button className="comment-action-btn danger" onClick={() => handleDelete(comment.id)} title={t('common.delete')}>
                  <Trash2 size={13} />
                </button>
              </>
            )}
          </div>
        </div>

        {isEditing ? (
          <div className="comment-edit-form">
            <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={2} />
            <div className="comment-edit-actions">
              <button className="btn btn-sm btn-primary" onClick={() => handleEdit(comment.id)} disabled={!editContent.trim()}>
                {t('common.save')}
              </button>
              <button className="btn btn-sm btn-secondary" onClick={() => { setEditId(null); setEditContent(''); }}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        ) : (
          <div className="comment-body">{comment.content}</div>
        )}

        {/* Reply form */}
        {replyTo === comment.id && (
          <div className="comment-reply-form">
            <textarea
              ref={replyRef}
              value={replyContent}
              onChange={e => setReplyContent(e.target.value)}
              placeholder={t('comments.reply_placeholder')}
              rows={2}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleReply(); }}
            />
            <div className="comment-reply-actions">
              <button className="btn btn-sm btn-primary" onClick={handleReply} disabled={!replyContent.trim() || sending}>
                <Send size={12} /> {t('comments.send')}
              </button>
              <button className="btn btn-sm btn-secondary" onClick={() => { setReplyTo(null); setReplyContent(''); }}>
                <X size={12} /> {t('common.cancel')}
              </button>
            </div>
          </div>
        )}

        {/* Nested replies */}
        {replies.length > 0 && (
          <div className="comment-replies">
            {replies.map(reply => (
              <CommentItem key={reply.id} comment={reply} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="comment-section">
      <button className="comment-section-header" onClick={() => setCollapsed(!collapsed)}>
        <MessageSquare size={18} />
        <span>{t('comments.title')} ({comments.length})</span>
        {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
      </button>

      {!collapsed && (
        <div className="comment-section-body">
          {/* New comment form */}
          <div className="comment-form">
            <div className="comment-form-avatar">{user?.username?.[0]?.toUpperCase()}</div>
            <div className="comment-form-input">
              <textarea
                ref={inputRef}
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                placeholder={t('comments.placeholder')}
                rows={2}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(); }}
              />
              <div className="comment-form-actions">
                <span className="comment-form-hint">Ctrl+Enter</span>
                <button className="btn btn-sm btn-primary" onClick={handleSubmit} disabled={!newComment.trim() || sending}>
                  <Send size={13} /> {t('comments.send')}
                </button>
              </div>
            </div>
          </div>

          {/* Comments list */}
          {loading ? (
            <div className="comment-loading">{t('common.loading')}</div>
          ) : rootComments.length === 0 ? (
            <div className="comment-empty">{t('comments.empty')}</div>
          ) : (
            <div className="comment-list">
              {rootComments.map(comment => (
                <CommentItem key={comment.id} comment={comment} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
