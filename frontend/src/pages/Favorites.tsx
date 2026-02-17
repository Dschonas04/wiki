import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star, FileText } from 'lucide-react';
import { api, type FavoritePage } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import PageHeader from '../components/PageHeader';
import Loading from '../components/Loading';

export default function Favorites() {
  const [pages, setPages] = useState<FavoritePage[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();
  const { t, language } = useLanguage();

  useEffect(() => {
    api.getFavorites()
      .then(setPages)
      .catch(() => showToast(t('favorites.load_error'), 'error'))
      .finally(() => setLoading(false));
  }, []);

  const removeFavorite = async (pageId: number) => {
    try {
      await api.toggleFavorite(pageId);
      setPages(prev => prev.filter(p => p.id !== pageId));
      showToast(t('favorites.removed_toast'), 'success');
    } catch {
      showToast(t('favorites.remove_error'), 'error');
    }
  };

  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  if (loading) return <div className="content-body"><Loading /></div>;

  return (
    <>
      <PageHeader title={t('favorites.title')} subtitle={t('favorites.subtitle', { count: pages.length })} />
      <div className="content-body">
        {pages.length === 0 ? (
          <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--c-text-muted)' }}>
            <Star size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
            <p>{t('favorites.empty')}</p>
          </div>
        ) : (
          <div className="recent-pages-list">
            {pages.map((page) => (
              <div className="recent-page-item" key={page.id} style={{ cursor: 'default' }}>
                <Link to={`/pages/${page.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, textDecoration: 'none', color: 'inherit' }}>
                  <FileText size={16} className="recent-page-icon" />
                  <span className="recent-page-title">{page.title}</span>
                  <span className="recent-page-meta">
                    <span>{formatDate(page.updated_at)}</span>
                  </span>
                </Link>
                <button
                  className="btn btn-ghost"
                  onClick={() => removeFavorite(page.id)}
                  title={t('favorites.remove_title')}
                  style={{ padding: 6, color: '#f59e0b' }}
                >
                  <Star size={18} fill="currentColor" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
