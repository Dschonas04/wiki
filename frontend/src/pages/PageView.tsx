import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Edit3, Trash2, ArrowLeft, Calendar, RefreshCw, User, History, Download, Star, Tag } from 'lucide-react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { api, type WikiPage, type Tag as TagType } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import Loading from '../components/Loading';

export default function PageView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [page, setPage] = useState<WikiPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [favorited, setFavorited] = useState(false);
  const [tags, setTags] = useState<TagType[]>([]);
  const [allTags, setAllTags] = useState<TagType[]>([]);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const { showToast } = useToast();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('pages.edit');
  const canDelete = hasPermission('pages.delete');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      api.getPage(id).then(setPage).catch((err) => setError(err.status === 404 ? 'Page not found.' : err.message)),
      api.checkFavorite(id).then(r => setFavorited(r.favorited)).catch(() => {}),
      api.getPageTags(id).then(setTags).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [id]);

  const toggleFavorite = async () => {
    if (!id) return;
    try {
      const result = await api.toggleFavorite(id);
      setFavorited(result.favorited);
      showToast(result.favorited ? 'Added to favorites' : 'Removed from favorites', 'success');
    } catch { showToast('Failed to toggle favorite', 'error'); }
  };

  const openTagPicker = async () => {
    try {
      const all = await api.getTags();
      setAllTags(all);
      setShowTagPicker(true);
    } catch { showToast('Failed to load tags', 'error'); }
  };

  const toggleTag = async (tagId: number) => {
    if (!id) return;
    const currentIds = tags.map(t => t.id);
    const newIds = currentIds.includes(tagId)
      ? currentIds.filter(i => i !== tagId)
      : [...currentIds, tagId];
    try {
      const updated = await api.setPageTags(id, newIds);
      setTags(updated);
    } catch { showToast('Failed to update tags', 'error'); }
  };

  const handleDelete = async () => {
    if (!page) return;
    if (!confirm(`Delete "${page.title}"? This cannot be undone.`)) return;
    try {
      await api.deletePage(page.id);
      showToast('Page deleted', 'success');
      navigate('/pages');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const formatDateLong = (s: string) =>
    new Date(s).toLocaleDateString('de-DE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const markdownHtml = page ? DOMPurify.sanitize(marked.parse(page.content || '') as string) : '';

  if (loading) {
    return (
      <>
        <PageHeader title="Loading…" />
        <div className="content-body"><Loading /></div>
      </>
    );
  }

  if (error || !page) {
    return (
      <>
        <PageHeader title="Error" />
        <div className="content-body">
          <div className="card">
            <p className="error-text">{error || 'Page not found.'}</p>
            <div className="btn-row">
              <Link to="/pages" className="btn btn-secondary">
                <ArrowLeft size={16} /> Back to Pages
              </Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={page.title}
        actions={
          <div className="btn-row">
            <button
              className={`btn ${favorited ? 'btn-warning' : 'btn-secondary'}`}
              onClick={toggleFavorite}
              title={favorited ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Star size={16} fill={favorited ? 'currentColor' : 'none'} />
            </button>
            {canEdit && (
              <Link to={`/pages/${page.id}/edit`} className="btn btn-primary">
                <Edit3 size={16} />
                <span>Edit</span>
              </Link>
            )}
            {canEdit && (
              <Link to={`/pages/${page.id}/history`} className="btn btn-secondary">
                <History size={16} />
                <span>History</span>
              </Link>
            )}
            <a href={api.exportPage(page.id)} className="btn btn-secondary" download>
              <Download size={16} />
              <span>Export</span>
            </a>
            {canDelete && (
              <button className="btn btn-danger" onClick={handleDelete}>
                <Trash2 size={16} />
                <span>Delete</span>
              </button>
            )}
          </div>
        }
      />

      <div className="content-body">
        {/* Tags bar */}
        <div className="tags-bar">
          {tags.map(tag => (
            <span key={tag.id} className="tag-badge" style={{ '--tag-color': tag.color } as React.CSSProperties}>
              {tag.name}
            </span>
          ))}
          {canEdit && (
            <button className="tag-add-btn" onClick={openTagPicker}>
              <Tag size={14} /> {tags.length === 0 ? 'Add tags' : '+'}
            </button>
          )}
        </div>

        {/* Tag picker popover */}
        {showTagPicker && (
          <div className="tag-picker-overlay" onClick={() => setShowTagPicker(false)}>
            <div className="tag-picker" onClick={e => e.stopPropagation()}>
              <h4>Select Tags</h4>
              <div className="tag-picker-list">
                {allTags.length === 0 && <p className="text-muted" style={{ fontSize: '0.85rem' }}>No tags yet. Create tags to categorize pages.</p>}
                {allTags.map(tag => {
                  const isSelected = tags.some(t => t.id === tag.id);
                  return (
                    <button
                      key={tag.id}
                      className={`tag-picker-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => toggleTag(tag.id)}
                      style={{ '--tag-color': tag.color } as React.CSSProperties}
                    >
                      <span className="tag-dot" />
                      <span>{tag.name}</span>
                      {isSelected && <span className="tag-check">✓</span>}
                    </button>
                  );
                })}
              </div>
              <button className="btn btn-secondary" onClick={() => setShowTagPicker(false)} style={{ marginTop: 12, width: '100%' }}>
                Done
              </button>
            </div>
          </div>
        )}

        <div className="card page-view-card">
          <div className="page-view-content markdown-body" dangerouslySetInnerHTML={{ __html: markdownHtml }} />
        </div>

        <div className="page-view-meta">
          <div className="meta-item">
            <Calendar size={14} />
            <span>Created {formatDateLong(page.created_at)}</span>
          </div>
          <div className="meta-item">
            <RefreshCw size={14} />
            <span>Updated {formatDateLong(page.updated_at)}</span>
          </div>
          {(page as any).created_by_name && (
            <div className="meta-item">
              <User size={14} />
              <span>Author: {(page as any).created_by_name}</span>
            </div>
          )}
        </div>

        <div className="btn-row" style={{ marginTop: 24 }}>
          <Link to="/pages" className="btn btn-secondary">
            <ArrowLeft size={16} />
            <span>Back to Pages</span>
          </Link>
        </div>
      </div>
    </>
  );
}
