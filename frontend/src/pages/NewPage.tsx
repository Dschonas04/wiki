import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Save, X, Code, FileText, Tag, Upload, Trash2, Paperclip } from 'lucide-react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { api, type WikiPage, type Tag as TagType } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import PageHeader from '../components/PageHeader';
import EditorToolbar from '../components/EditorToolbar';

export default function NewPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();
  const { t } = useLanguage();
  const isAdmin = user?.globalRole === 'admin';
  const [searchParams] = useSearchParams();
  const urlSpaceId = searchParams.get('spaceId');
  const isPrivate = searchParams.get('private') === '1';
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
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const addFiles = (files: FileList | File[]) => {
    setPendingFiles(prev => [...prev, ...Array.from(files)]);
    setIsDirty(true);
  };

  const removeFile = (idx: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

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
        ...(urlSpaceId ? { spaceId: parseInt(urlSpaceId) } : {}),
        ...(isPrivate ? { privateSpaceId: user?.id } : {}),
      });
      if (selectedTagIds.length > 0) {
        await api.setPageTags(page.id, selectedTagIds).catch(() => {});
      }
      // Upload pending files
      let uploadFails = 0;
      for (const file of pendingFiles) {
        try {
          await api.uploadAttachment(page.id, file);
        } catch {
          uploadFails++;
        }
      }
      if (uploadFails > 0) {
        showToast(t('newpage.created_partial', { count: uploadFails }), 'error');
      } else {
        showToast(t('newpage.created_toast'), 'success');
      }
      setIsDirty(false);
      navigate(`/pages/${page.id}`);
    } catch (err: any) {
      showToast(err.message, 'error');
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title={t('newpage.title')} subtitle={t('newpage.subtitle')} />

      <div className="content-body">
        <form className="page-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="title">{t('newpage.label_title')}</label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('newpage.title_placeholder')}
              required
              maxLength={255}
              autoFocus
            />
          </div>

          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label htmlFor="parentId">{t('newpage.label_parent')}</label>
              <select
                id="parentId"
                value={parentId ?? ''}
                onChange={(e) => setParentId(e.target.value ? parseInt(e.target.value) : null)}
              >
                <option value="">{t('newpage.parent_none')}</option>
                {allPages.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ flex: 0 }}>
              <label>{t('newpage.label_type')}</label>
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
            <span className="form-hint" style={{ color: 'var(--c-text-muted)' }}>
              {t('newpage.draft_hint')}
            </span>
          </div>

          <div className="form-group">
            <label>{t('newpage.label_tags')}</label>
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
                <Tag size={14} /> {selectedTagIds.length === 0 ? t('newpage.tags_add') : '+'}
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
                    title={t('newpage.tag_color')}
                  />
                  <input
                    type="text"
                    placeholder={t('newpage.tag_name_placeholder')}
                    value={newTagName}
                    onChange={e => setNewTagName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createAndSelectTag(); } }}
                  />
                  <button type="button" className="btn btn-sm btn-primary" onClick={createAndSelectTag} disabled={!newTagName.trim()}>{t('common.create')}</button>
                </div>
              </div>
            )}
          </div>

          <div className="form-group">
            <label><Paperclip size={14} style={{ verticalAlign: 'middle' }} /> {t('newpage.label_attachments')}</label>
            <div className="newpage-files-area"
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
            >
              <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
              {pendingFiles.length === 0 ? (
                <button type="button" className="newpage-files-placeholder" onClick={() => fileInputRef.current?.click()}>
                  <Upload size={18} />
                  <span>{t('newpage.attachments_drop')}</span>
                </button>
              ) : (
                <>
                  <div className="newpage-files-list">
                    {pendingFiles.map((f, i) => (
                      <div key={i} className="newpage-file-item">
                        <Paperclip size={13} />
                        <span className="newpage-file-name">{f.name}</span>
                        <span className="newpage-file-size">{formatFileSize(f.size)}</span>
                        <button type="button" className="icon-btn danger" onClick={() => removeFile(i)} title={t('common.remove')}><Trash2 size={13} /></button>
                      </div>
                    ))}
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()} style={{ marginTop: 6 }}>
                    <Upload size={14} /> {t('newpage.attachments_add_more')}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="editor-grid">
            <div className="form-group">
              <label htmlFor="content">{t('newpage.label_content', { type: contentType === 'markdown' ? 'Markdown' : 'HTML' })}</label>
              <EditorToolbar textareaRef={contentRef} contentType={contentType} onUpdate={setContent} />
              <textarea
                ref={contentRef}
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={contentType === 'markdown' ? t('newpage.md_placeholder') : t('newpage.html_placeholder')}
                required
                maxLength={100000}
                rows={14}
              />
            </div>

            <div className="form-group">
              <label>{t('newpage.label_preview')}</label>
              <div className="markdown-preview markdown-body" dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <Save size={16} />
              <span>{saving ? t('newpage.saving') : t('newpage.submit')}</span>
            </button>
            <Link to="/pages" className="btn btn-secondary">
              <X size={16} />
              <span>{t('common.cancel')}</span>
            </Link>
          </div>
        </form>
      </div>
    </>
  );
}
