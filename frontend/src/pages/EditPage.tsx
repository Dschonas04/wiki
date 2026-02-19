import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Save, X, Code, FileText, Tag, AlertCircle } from 'lucide-react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { api, type WikiPage, type Tag as TagType } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import PageHeader from '../components/PageHeader';
import Loading from '../components/Loading';
import EditorToolbar from '../components/EditorToolbar';
import BlockEditor from '../components/BlockEditor';

export default function EditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { t } = useLanguage();
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
  const [pageUpdatedAt, setPageUpdatedAt] = useState<string>('');
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const [editorMode, setEditorMode] = useState<'wysiwyg' | 'raw'>('wysiwyg');
  const [draftRecovered, setDraftRecovered] = useState(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const DRAFT_KEY = `nexora_draft_${id}`;

  // Autosave to localStorage every 10 seconds when dirty
  const saveDraft = useCallback(() => {
    if (!id || !title) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, content, contentType, savedAt: Date.now() }));
    } catch { /* quota exceeded – ignore */ }
  }, [id, title, content, contentType, DRAFT_KEY]);

  useEffect(() => {
    if (!isDirty) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(saveDraft, 10000);
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
  }, [isDirty, saveDraft]);

  // Remove draft after successful save
  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
  }, [DRAFT_KEY]);

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
        setPageUpdatedAt(page.updated_at);
        const ct = page.content_type || 'markdown';
        setContentType(ct);
        setParentId(page.parent_id ?? null);
        setEditorMode(ct === 'html' ? 'wysiwyg' : 'raw');

        // Check for saved draft
        try {
          const raw = localStorage.getItem(`nexora_draft_${id}`);
          if (raw) {
            const draft = JSON.parse(raw);
            // Only recover if draft is newer than last save (within 24h)
            if (draft.savedAt && Date.now() - draft.savedAt < 24 * 60 * 60 * 1000) {
              if (draft.content !== page.content || draft.title !== page.title) {
                setDraftRecovered(true);
                setTitle(draft.title || page.title);
                setContent(draft.content || page.content);
                if (draft.contentType) setContentType(draft.contentType);
              }
            } else {
              localStorage.removeItem(`nexora_draft_${id}`);
            }
          }
        } catch { /* ignore */ }
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
        expectedUpdatedAt: pageUpdatedAt || undefined,
      } as any);
      await api.setPageTags(id, selectedTagIds).catch(() => {});
      showToast(t('editpage.updated_toast'), 'success');
      setIsDirty(false);
      clearDraft();
      navigate(`/pages/${id}`);
    } catch (err: any) {
      if (err.status === 409 && err.data?.error === 'conflict') {
        showToast(t('editpage.conflict_error'), 'error');
      } else {
        showToast(err.message, 'error');
      }
      setSaving(false);
    }
  };

  // Filter out current page from parent options (can't be own parent)
  const parentOptions = allPages.filter(p => p.id !== parseInt(id || '0'));

  if (loading) {
    return (
      <>
        <PageHeader title={t('editpage.title')} />
        <div className="content-body"><Loading /></div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader title={t('editpage.error')} />
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
      <PageHeader title={t('editpage.title')} subtitle={title} />

      <div className="content-body">
        <form className="page-form" onSubmit={handleSubmit}>
          {draftRecovered && (
            <div className="settings-error" style={{ background: 'var(--c-warning-bg, #fef3cd)', borderColor: 'var(--c-warning, #f59e0b)', color: 'var(--c-warning-text, #856404)', marginBottom: '1rem' }}>
              <AlertCircle size={14} />
              <span>{t('editpage.draft_recovered')}</span>
              <button type="button" className="btn btn-sm btn-secondary" style={{ marginLeft: 'auto' }}
                onClick={() => {
                  setTitle(initialTitle);
                  setContent(initialContent);
                  setDraftRecovered(false);
                  clearDraft();
                }}
              >{t('editpage.draft_discard')}</button>
            </div>
          )}
          <div className="form-group">
            <label htmlFor="title">{t('editpage.label_title')}</label>
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
              <label htmlFor="parentId">{t('editpage.label_parent')}</label>
              <select
                id="parentId"
                value={parentId ?? ''}
                onChange={(e) => setParentId(e.target.value ? parseInt(e.target.value) : null)}
              >
                <option value="">{t('editpage.parent_none')}</option>
                {parentOptions.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ flex: 0 }}>
              <label>{t('editpage.label_type')}</label>
              <div className="content-type-toggle">
                <button
                  type="button"
                  className={`toggle-btn ${editorMode === 'wysiwyg' ? 'active' : ''}`}
                  onClick={() => { setEditorMode('wysiwyg'); setContentType('html'); }}
                >
                  <FileText size={14} /> WYSIWYG
                </button>
                <button
                  type="button"
                  className={`toggle-btn ${editorMode === 'raw' && contentType === 'markdown' ? 'active' : ''}`}
                  onClick={() => { setEditorMode('raw'); setContentType('markdown'); }}
                >
                  <FileText size={14} /> Markdown
                </button>
                <button
                  type="button"
                  className={`toggle-btn ${editorMode === 'raw' && contentType === 'html' ? 'active' : ''}`}
                  onClick={() => { setEditorMode('raw'); setContentType('html'); }}
                >
                  <Code size={14} /> HTML
                </button>
              </div>
            </div>
          </div>

          <div className="form-group">
            <label>{t('editpage.label_tags')}</label>
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
                <Tag size={14} /> {selectedTagIds.length === 0 ? t('editpage.tags_add') : '+'}
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
                    title={t('editpage.tag_color')}
                  />
                  <input
                    type="text"
                    placeholder={t('editpage.tag_name_placeholder')}
                    value={newTagName}
                    onChange={e => setNewTagName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createAndSelectTag(); } }}
                  />
                  <button type="button" className="btn btn-sm btn-primary" onClick={createAndSelectTag} disabled={!newTagName.trim()}>{t('common.create')}</button>
                </div>
              </div>
            )}
          </div>

          {editorMode === 'wysiwyg' ? (
            <div className="form-group">
              <label>{t('editpage.label_content', { type: 'WYSIWYG' })}</label>
              <BlockEditor
                content={content}
                onChange={(html) => { setContent(html); }}
                pageId={id}
              />
            </div>
          ) : (
            <div className="editor-grid">
              <div className="form-group">
                <label htmlFor="content">{t('editpage.label_content', { type: contentType === 'markdown' ? 'Markdown' : 'HTML' })}</label>
                <EditorToolbar textareaRef={contentRef} contentType={contentType} onUpdate={setContent} pageId={id} />
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
                <label>{t('editpage.label_preview')}</label>
                <div className="markdown-preview markdown-body" dangerouslySetInnerHTML={{ __html: previewHtml }} />
              </div>
            </div>
          )}

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <Save size={16} />
              <span>{saving ? t('editpage.saving') : t('editpage.submit')}</span>
            </button>
            <Link to={`/pages/${id}`} className="btn btn-secondary">
              <X size={16} />
              <span>{t('common.cancel')}</span>
            </Link>
          </div>
        </form>
      </div>
    </>
  );
}
