import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Save, X, Code, FileText, Tag } from 'lucide-react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { api, type WikiPage, type Tag as TagType } from '../api/client';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/PageHeader';
import Loading from '../components/Loading';
import EditorToolbar from '../components/EditorToolbar';

export default function EditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [contentType, setContentType] = useState<'markdown' | 'html'>('markdown');
  const [parentId, setParentId] = useState<number | null>(null);
  const [allPages, setAllPages] = useState<WikiPage[]>([]);
  const [allTags, setAllTags] = useState<TagType[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#6366f1');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [initialTitle, setInitialTitle] = useState('');
  const [initialContent, setInitialContent] = useState('');
  const contentRef = useRef<HTMLTextAreaElement>(null);

  const previewHtml = contentType === 'markdown'
    ? DOMPurify.sanitize(marked.parse(content || '') as string)
    : DOMPurify.sanitize(content || '', { ADD_TAGS: ['iframe', 'video', 'audio', 'source', 'style'], ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'target', 'controls', 'autoplay'] });

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.getPage(id).then((page) => {
        setTitle(page.title);
        setContent(page.content);
        setInitialTitle(page.title);
        setInitialContent(page.content);
        setContentType(page.content_type || 'markdown');
        setParentId(page.parent_id ?? null);
      }),
      api.getPages().then(setAllPages),
      api.getTags().then(setAllTags),
      api.getPageTags(id).then(tags => setSelectedTagIds(tags.map(t => t.id))),
    ])
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  // Track dirty state
  useEffect(() => {
    if (initialTitle && (title !== initialTitle || content !== initialContent)) {
      setIsDirty(true);
    } else {
      setIsDirty(false);
    }
  }, [title, content, initialTitle, initialContent]);

  // Unsaved changes warning
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const toggleTag = (tagId: number) => {
    setSelectedTagIds(prev =>
      prev.includes(tagId) ? prev.filter(i => i !== tagId) : [...prev, tagId]
    );
  };

  const createAndSelectTag = async () => {
    const name = newTagName.trim();
    if (!name) return;
    try {
      const tag = await api.createTag(name, newTagColor);
      setAllTags(prev => [...prev, tag]);
      setSelectedTagIds(prev => [...prev, tag.id]);
      setNewTagName('');
      setNewTagColor('#6366f1');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

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
      await api.setPageTags(id, selectedTagIds).catch(() => {});
      showToast('Page updated!', 'success');
      setIsDirty(false);
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

          <div className="form-group">
            <label>Tags</label>
            <div className="editor-tags-bar">
              {selectedTagIds.map(tagId => {
                const tag = allTags.find(t => t.id === tagId);
                if (!tag) return null;
                return (
                  <span key={tag.id} className="tag-badge" style={{ '--tag-color': tag.color } as React.CSSProperties}>
                    {tag.name}
                    <button type="button" className="tag-remove" onClick={() => toggleTag(tag.id)}>×</button>
                  </span>
                );
              })}
              <button type="button" className="tag-add-btn" onClick={() => setShowTagPicker(!showTagPicker)}>
                <Tag size={14} /> {selectedTagIds.length === 0 ? 'Add tags' : '+'}
              </button>
            </div>
            {showTagPicker && (
              <div className="editor-tag-picker">
                <div className="tag-picker-list">
                  {allTags.map(tag => {
                    const isSelected = selectedTagIds.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
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
                <div className="tag-create-row">
                  <input
                    type="color"
                    className="tag-color-input"
                    value={newTagColor}
                    onChange={e => setNewTagColor(e.target.value)}
                    title="Tag color"
                  />
                  <input
                    type="text"
                    placeholder="New tag name…"
                    value={newTagName}
                    onChange={e => setNewTagName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createAndSelectTag(); } }}
                  />
                  <button type="button" className="btn btn-sm btn-primary" onClick={createAndSelectTag} disabled={!newTagName.trim()}>Create</button>
                </div>
              </div>
            )}
          </div>

          <div className="editor-grid">
            <div className="form-group">
              <label htmlFor="content">Content ({contentType === 'markdown' ? 'Markdown' : 'HTML'})</label>
              <EditorToolbar textareaRef={contentRef} contentType={contentType} onUpdate={setContent} />
              <textarea
                ref={contentRef}
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
