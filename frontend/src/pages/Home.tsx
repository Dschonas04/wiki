import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  PlusCircle,
  ArrowRight,
  Users,
  ScrollText,
  Clock,
  TrendingUp,
  BookOpen,
  Activity,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api, type WikiPage, type HealthData } from '../api/client';
import PageHeader from '../components/PageHeader';

export default function Home() {
  const { user, hasPermission, isAdmin } = useAuth();
  const [recentPages, setRecentPages] = useState<WikiPage[]>([]);
  const [stats, setStats] = useState<HealthData | null>(null);
  const [loadingRecent, setLoadingRecent] = useState(true);

  useEffect(() => {
    api.getRecentPages(8).then(setRecentPages).catch(() => {}).finally(() => setLoadingRecent(false));
    api.getHealth().then(setStats).catch(() => {});
  }, []);

  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString('de-DE', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <>
      <PageHeader title="Welcome to Wiki" subtitle="A modern knowledge base for your team" />

      <div className="content-body">
        {/* Hero Card */}
        <div className="hero-card">
          <div className="hero-card-content">
            <h2>Hello, {user?.displayName || user?.username}!</h2>
            <p>
              Create, organize and share knowledge with your team.
              Your wiki with Markdown editing, full-text search, version history and role-based access control.
            </p>
            <div className="hero-actions">
              {hasPermission('pages.create') && (
                <Link to="/pages/new" className="btn btn-white">
                  <PlusCircle size={18} />
                  <span>Create Page</span>
                </Link>
              )}
              <Link to="/pages" className="btn btn-ghost-white">
                <span>Browse Pages</span>
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
          <div className="hero-card-visual">
            <BookOpen size={120} strokeWidth={0.8} />
          </div>
        </div>

        {/* Stats Row */}
        {stats && (
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon blue"><FileText size={20} /></div>
              <div className="stat-info">
                <div className="stat-number">{stats.counts?.pages ?? 0}</div>
                <div className="stat-label">Pages</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon purple"><Users size={20} /></div>
              <div className="stat-info">
                <div className="stat-number">{stats.counts?.users ?? 0}</div>
                <div className="stat-label">Users</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon green"><Activity size={20} /></div>
              <div className="stat-info">
                <div className="stat-number">{Math.floor((stats.uptime || 0) / 3600)}h</div>
                <div className="stat-label">Uptime</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon orange"><TrendingUp size={20} /></div>
              <div className="stat-info">
                <div className="stat-number">{stats.status === 'healthy' ? '✓' : '✗'}</div>
                <div className="stat-label">System</div>
              </div>
            </div>
          </div>
        )}

        {/* Recent Pages Widget */}
        <div className="section-title">
          <Clock size={18} /> Recent Pages
        </div>
        {loadingRecent ? (
          <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--c-text-muted)' }}>Loading…</div>
        ) : recentPages.length === 0 ? (
          <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--c-text-muted)' }}>
            No pages yet — create your first page!
          </div>
        ) : (
          <div className="recent-pages-list">
            {recentPages.map((page) => (
              <Link to={`/pages/${page.id}`} className="recent-page-item" key={page.id}>
                <FileText size={16} className="recent-page-icon" />
                <span className="recent-page-title">{page.title}</span>
                <span className="recent-page-meta">
                  {(page as any).updated_by_name && <span>{(page as any).updated_by_name}</span>}
                  <span>{formatDate(page.updated_at)}</span>
                </span>
              </Link>
            ))}
          </div>
        )}

        {/* Quick Actions */}
        <div className="section-title">Quick Actions</div>
        <div className="action-grid">
          <Link to="/pages" className="action-card">
            <div className="action-card-icon blue">
              <FileText size={22} />
            </div>
            <div className="action-card-text">
              <h3>All Pages</h3>
              <p>Browse and manage wiki pages</p>
            </div>
            <ArrowRight size={16} className="action-arrow" />
          </Link>
          {hasPermission('pages.create') && (
            <Link to="/pages/new" className="action-card">
              <div className="action-card-icon green">
                <PlusCircle size={22} />
              </div>
              <div className="action-card-text">
                <h3>New Page</h3>
                <p>Create a new wiki page</p>
              </div>
              <ArrowRight size={16} className="action-arrow" />
            </Link>
          )}
          {isAdmin && (
            <>
              <Link to="/users" className="action-card">
                <div className="action-card-icon purple">
                  <Users size={22} />
                </div>
                <div className="action-card-text">
                  <h3>Manage Users</h3>
                  <p>Add, edit or remove accounts</p>
                </div>
                <ArrowRight size={16} className="action-arrow" />
              </Link>
              <Link to="/audit" className="action-card">
                <div className="action-card-icon orange">
                  <ScrollText size={22} />
                </div>
                <div className="action-card-text">
                  <h3>Audit Log</h3>
                  <p>Review system events</p>
                </div>
                <ArrowRight size={16} className="action-arrow" />
              </Link>
            </>
          )}
        </div>
      </div>
    </>
  );
}
