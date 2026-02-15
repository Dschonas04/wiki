import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Save, X, Code, FileText } from 'lucide-react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { api, type WikiPage } from '../api/client';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/PageHeader';
import Loading from '../components/Loading';

export default function EditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [contentType, setContentType] = useState<'markdown' | 'html'>('markdown');
  const [parentId, setParentId] = useState<number | null>(null);
  const [allPages, setAllPages] = useState<WikiPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const previewHtml = contentType === 'markdown'
    ? DOMPurify.sanitize(marked.parse(content || '') as string)
    : DOMPurify.sanitize(content || '', { ADD_TAGS: ['iframe', 'video', 'audio', 'source', 'style'], ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'target', 'controls', 'autoplay'] });

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.getPage(id).then((page) => {
        setTitle(page.title);
        setContent(page.content);
        setContentType(page.content_type || 'markdown');
        setParentId(page.parent_id ?? null);
      }),
      api.getPages().then(setAllPages),
    ])
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !title.trim() || !content.trim()) return;

    setSaving(true);
    try {
      await api.updatePage(id, {
        title: title.trim(),
        content: content.trim(),
        parentId,
        contentType,
      });
      showToast('Page updated!', 'success');
      navigate(`/pages/${id}`);
    } catch (err: any) {
      showToast(err.message, 'error');
      setSaving(false);
    }
  };

  // Filter out current page from parent options (can't be own parent)
  const parentOptions = allPages.filter(p => p.id !== parseInt(id || '0'));

  if (loading) {
    return (
      <>
        <PageHeader title="Edit Page" />
        <div className="content-body"><Loading /></div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader title="Error" />
        <div className="content-body">
          <div className="card">
            <p className="error-text">{error}</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Edit Page" subtitle={title} />

      <div className="content-body">
        <form className="page-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="title">Title</label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={255}
            />
          </div>

          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label htmlFor="parentId">Parent Page (optional)</label>
              <select
                id="parentId"
                value={parentId ?? ''}
                onChange={(e) => setParentId(e.target.value ? parseInt(e.target.value) : null)}
              >
                <option value="">— No parent (top-level) —</option>
                {parentOptions.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ flex: 0 }}>
              <label>Content Type</label>
              <div className="content-type-toggle">
                <button
                  type="button"
                  className={`toggle-btn ${contentType === 'markdown' ? 'active' : ''}`}
                  onClick={() => setContentType('markdown')}
                >
                  <FileText size={14} /> Markdown
                </button>
                <button
                  type="button"
                  className={`toggle-btn ${contentType === 'html' ? 'active' : ''}`}
                  onClick={() => setContentType('html')}
                >
                  <Code size={14} /> HTML
                </button>
              </div>
            </div>
          </div>

          <div className="editor-grid">
            <div className="form-group">
              <label htmlFor="content">Content ({contentType === 'markdown' ? 'Markdown' : 'HTML'})</label>
              <textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
                maxLength={100000}
                rows={16}
              />
            </div>

            <div className="form-group">
              <label>Live Preview</label>
              <div className="markdown-preview markdown-body" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <Save size={16} />
              <span>{saving ? 'Saving…' : 'Save Changes'}</span>
            </button>
            <Link to={`/pages/${id}`} className="btn btn-secondary">
              <X size={16} />
              <span>Cancel</span>
            </Link>
          </div>
        </form>
      </div>
    </>
  );
}
