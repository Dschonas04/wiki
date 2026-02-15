import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Save, X } from 'lucide-react';
import { api } from '../api/client';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/PageHeader';
import Loading from '../components/Loading';

export default function EditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    api
      .getPage(id)
      .then((page) => {
        setTitle(page.title);
        setContent(page.content);
      })
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
      });
      showToast('Page updated!', 'success');
      navigate(`/pages/${id}`);
    } catch (err: any) {
      showToast(err.message, 'error');
      setSaving(false);
    }
  };

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

          <div className="form-group">
            <label htmlFor="content">Content</label>
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              maxLength={100000}
              rows={16}
            />
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
