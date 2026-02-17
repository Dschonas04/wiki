import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Save, X, Code, FileText, Tag, Eye, EyeOff } from 'lucide-react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { api, type WikiPage, type Tag as TagType } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import EditorToolbar from '../components/EditorToolbar';

export default function NewPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [contentType, setContentType] = useState<'markdown' | 'html'>('markdown');
  const [parentId, setParentId] = useState<number | null>(null);
  const [publishNow, setPublishNow] = useState(false);
  const [allPages, setAllPages] = useState<WikiPage[]>([]);
  const [allTags, setAllTags] = useState<TagType[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#6366f1');
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api.getPages().then(setAllPages).catch(() => {});
    api.getTags().then(setAllTags).catch(() => {});
  }, []);

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

  // Track dirty state
  useEffect(() => {
    if (title.trim() || content.trim()) setIsDirty(true);
  }, [title, content]);

  const toggleTag = (tagId: number) => {
    setSelectedTagIds(prev =>
      prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
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

  const previewHtml = contentType === 'markdown'
    ? DOMPurify.sanitize(marked.parse(content || '') as string)
    : DOMPurify.sanitize(content || '', { ADD_TAGS: ['iframe', 'video', 'audio', 'source', 'style'], ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'target', 'controls', 'autoplay'] });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setSaving(true);
    try {
      const page = await api.createPage({
        title: title.trim(),
        content: content.trim(),
        parentId,
        contentType,
        visibility: isAdmin && publishNow ? 'published' : 'draft',
      });
      if (selectedTagIds.length > 0) {
        await api.setPageTags(page.id, selectedTagIds).catch(() => {});
      }
      showToast('Page created!', 'success');
      setIsDirty(false);
      navigate(`/pages/${page.id}`);
    } catch (err: any) {
      showToast(err.message, 'error');
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title="New Page" subtitle="Create a new wiki page" />

      <div className="content-body">
        <form className="page-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="title">Title</label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter a descriptive title…"
              required
              maxLength={255}
              autoFocus
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
                {allPages.map((p) => (
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

          {/* Admin: Publish toggle */}
          {isAdmin && (
            <div className="form-group">
              <label>Visibility</label>
              <div className="visibility-toggle">
                <button
                  type="button"
                  className={`toggle-btn ${!publishNow ? 'active' : ''}`}
                  onClick={() => setPublishNow(false)}
                >
                  <EyeOff size={14} /> Draft
                </button>
                <button
                  type="button"
                  className={`toggle-btn ${publishNow ? 'active' : ''}`}
                  onClick={() => setPublishNow(true)}
                >
                  <Eye size={14} /> Publish Now
                </button>
              </div>
              <span className="form-hint">
                {publishNow
                  ? 'Page will be immediately visible to all users.'
                  : 'Page will be saved as draft. You can publish it later.'}
              </span>
            </div>
          )}
          {!isAdmin && (
            <div className="form-group">
              <span className="form-hint" style={{ color: 'var(--c-text-muted)' }}>
                <EyeOff size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                Page will be created as a draft. Request admin approval to publish.
              </span>
            </div>
          )}

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
                placeholder={contentType === 'markdown' ? 'Write your content in Markdown…' : 'Write your HTML content…'}
                required
                maxLength={100000}
                rows={14}
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
              <span>{saving ? 'Creating…' : 'Create Page'}</span>
            </button>
            <Link to="/pages" className="btn btn-secondary">
              <X size={16} />
              <span>Cancel</span>
            </Link>
          </div>
        </form>
      </div>
    </>
  );
}
