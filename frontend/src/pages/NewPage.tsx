import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Save, X } from 'lucide-react';
import { api } from '../api/client';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/PageHeader';

export default function NewPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setSaving(true);
    try {
      const page = await api.createPage({
        title: title.trim(),
        content: content.trim(),
      });
      showToast('Page created!', 'success');
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

          <div className="form-group">
            <label htmlFor="content">Content</label>
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your content here…"
              required
              maxLength={100000}
              rows={14}
            />
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
