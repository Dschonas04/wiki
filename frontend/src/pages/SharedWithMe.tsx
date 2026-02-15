import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Clock, User, Share2 } from 'lucide-react';
import { api } from '../api/client';
import PageHeader from '../components/PageHeader';
import Loading from '../components/Loading';
import EmptyState from '../components/EmptyState';

interface SharedPage {
  id: number;
  title: string;
  content: string;
  content_type?: string;
  updated_at: string;
  permission: string;
  shared_by_name: string;
  shared_at: string;
}

export default function SharedWithMe() {
  const [pages, setPages] = useState<SharedPage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getSharedWithMe()
      .then(setPages)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString('de-DE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  if (loading) {
    return (
      <>
        <PageHeader title="Shared with me" />
        <div className="content-body">
          <Loading />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Shared with me"
        subtitle={`${pages.length} shared page${pages.length !== 1 ? 's' : ''}`}
      />
      <div className="content-body">
        {pages.length === 0 ? (
          <EmptyState
            icon={<Share2 size={48} />}
            title="Nothing shared yet"
            description="When someone shares a page with you, it will appear here."
          />
        ) : (
          <div className="pages-grid">
            {pages.map((page, i) => (
              <div
                className="page-card"
                key={page.id}
                style={{ animationDelay: `${i * 0.04}s` }}
              >
                <div className="page-card-header">
                  <Link to={`/pages/${page.id}`} className="page-card-title">
                    <FileText size={18} className="page-card-icon" />
                    {page.title}
                    <span className="badge badge-share">{page.permission}</span>
                  </Link>
                </div>
                {page.content && (
                  <p className="page-card-excerpt">
                    {page.content.substring(0, 180)}
                    {page.content.length > 180 ? '…' : ''}
                  </p>
                )}
                <div className="page-card-meta">
                  <span>
                    <Clock size={13} />
                    {formatDate(page.updated_at)}
                  </span>
                  <span>
                    <User size={13} />
                    Shared by {page.shared_by_name}
                  </span>
                  <span>
                    <Share2 size={13} />
                    {page.permission}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
