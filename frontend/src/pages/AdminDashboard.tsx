/**
 * AdminDashboard – Analytics und Statistiken (nur für Administratoren)
 *
 * Features:
 * - Gesamtstatistiken (Seiten, Benutzer, Spaces, Kommentare)
 * - Aktivitäts-Timeline (letzte 30 Tage)
 * - Meistbearbeitete Seiten
 * - Aktivste Benutzer
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3, Users, FileText, MessageSquare, Layers, TrendingUp,
  Activity, Crown, BookOpen, PenTool, Calendar, ArrowUpRight
} from 'lucide-react';
import { api } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import PageHeader from '../components/PageHeader';
import Loading from '../components/Loading';

interface DashboardStats {
  totalPages: number;
  activeUsers: number;
  teamSpaces: number;
  totalComments: number;
  draftPages: number;
  publishedPages: number;
  templateCount: number;
}

interface ActivityData {
  pagesPerDay: { date: string; count: string }[];
  editsPerDay: { date: string; count: string }[];
  commentsPerDay: { date: string; count: string }[];
  loginsPerDay: { date: string; count: string }[];
}

interface TopPage {
  id: number;
  title: string;
  workflow_status: string;
  version_count: string;
  comment_count: string;
  created_by_name: string;
}

interface TopUser {
  id: number;
  username: string;
  display_name: string;
  global_role: string;
  page_count: string;
  edit_count: string;
  comment_count: string;
  last_login: string;
}

export default function AdminDashboard({ embedded = false }: { embedded?: boolean }) {
  const { t } = useLanguage();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [topPages, setTopPages] = useState<TopPage[]>([]);
  const [topUsers, setTopUsers] = useState<TopUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getDashboardStats().then(setStats),
      api.getDashboardActivity().then(setActivity),
      api.getDashboardTopPages().then(setTopPages),
      api.getDashboardTopUsers().then(setTopUsers),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <>
        {!embedded && <PageHeader title={t('dashboard.title')} subtitle={t('dashboard.subtitle')} />}
        <div className="content-body"><Loading /></div>
      </>
    );
  }

  // Build activity chart data (last 30 days)
  const buildChartData = () => {
    if (!activity) return [];
    const days: { date: string; pages: number; edits: number; comments: number; logins: number }[] = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      days.push({
        date: dateStr,
        pages: parseInt(activity.pagesPerDay.find(x => x.date?.startsWith(dateStr))?.count || '0'),
        edits: parseInt(activity.editsPerDay.find(x => x.date?.startsWith(dateStr))?.count || '0'),
        comments: parseInt(activity.commentsPerDay.find(x => x.date?.startsWith(dateStr))?.count || '0'),
        logins: parseInt(activity.loginsPerDay.find(x => x.date?.startsWith(dateStr))?.count || '0'),
      });
    }
    return days;
  };

  const chartData = buildChartData();
  const maxActivity = Math.max(1, ...chartData.map(d => d.pages + d.edits + d.comments));

  return (
    <>
      {!embedded && <PageHeader title={t('dashboard.title')} subtitle={t('dashboard.subtitle')} />}

      <div className="content-body">
        {/* Stats Cards */}
        <div className="dashboard-stats-grid">
          <div className="dash-stat-card">
            <div className="dash-stat-icon pages"><FileText size={22} /></div>
            <div className="dash-stat-info">
              <span className="dash-stat-value">{stats?.totalPages ?? 0}</span>
              <span className="dash-stat-label">{t('dashboard.stat_pages')}</span>
            </div>
            <div className="dash-stat-sub">
              <span className="dash-stat-detail">{stats?.publishedPages ?? 0} {t('dashboard.published')}</span>
              <span className="dash-stat-detail">{stats?.draftPages ?? 0} {t('dashboard.drafts')}</span>
            </div>
          </div>

          <div className="dash-stat-card">
            <div className="dash-stat-icon users"><Users size={22} /></div>
            <div className="dash-stat-info">
              <span className="dash-stat-value">{stats?.activeUsers ?? 0}</span>
              <span className="dash-stat-label">{t('dashboard.stat_users')}</span>
            </div>
          </div>

          <div className="dash-stat-card">
            <div className="dash-stat-icon spaces"><Layers size={22} /></div>
            <div className="dash-stat-info">
              <span className="dash-stat-value">{stats?.teamSpaces ?? 0}</span>
              <span className="dash-stat-label">{t('dashboard.stat_spaces')}</span>
            </div>
          </div>

          <div className="dash-stat-card">
            <div className="dash-stat-icon comments"><MessageSquare size={22} /></div>
            <div className="dash-stat-info">
              <span className="dash-stat-value">{stats?.totalComments ?? 0}</span>
              <span className="dash-stat-label">{t('dashboard.stat_comments')}</span>
            </div>
          </div>
        </div>

        {/* Activity Chart */}
        <div className="card dashboard-activity-card">
          <h3><Activity size={18} /> {t('dashboard.activity_title')}</h3>
          <div className="dash-chart">
            <div className="dash-chart-bars">
              {chartData.map((day, i) => {
                const total = day.pages + day.edits + day.comments;
                const height = Math.max(2, (total / maxActivity) * 100);
                const isToday = i === chartData.length - 1;
                return (
                  <div key={day.date} className="dash-chart-bar-wrapper" title={`${day.date}\nSeiten: ${day.pages}\nBearbeitungen: ${day.edits}\nKommentare: ${day.comments}`}>
                    <div
                      className={`dash-chart-bar ${isToday ? 'today' : ''}`}
                      style={{ height: `${height}%` }}
                    >
                      {day.edits > 0 && <div className="dash-bar-segment edits" style={{ flex: day.edits }} />}
                      {day.pages > 0 && <div className="dash-bar-segment pages" style={{ flex: day.pages }} />}
                      {day.comments > 0 && <div className="dash-bar-segment comments" style={{ flex: day.comments }} />}
                    </div>
                    {(i % 7 === 0 || isToday) && (
                      <span className="dash-chart-label">
                        {new Date(day.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="dash-chart-legend">
              <span className="dash-legend-item"><span className="dash-legend-dot edits" />{t('dashboard.legend_edits')}</span>
              <span className="dash-legend-item"><span className="dash-legend-dot pages" />{t('dashboard.legend_pages')}</span>
              <span className="dash-legend-item"><span className="dash-legend-dot comments" />{t('dashboard.legend_comments')}</span>
            </div>
          </div>
        </div>

        {/* Two columns: Top Pages + Top Users */}
        <div className="dashboard-two-col">
          {/* Top Pages */}
          <div className="card">
            <h3><TrendingUp size={18} /> {t('dashboard.top_pages')}</h3>
            <div className="dash-table">
              {topPages.length === 0 ? (
                <div className="dash-table-empty">{t('dashboard.no_data')}</div>
              ) : (
                topPages.map((page, i) => (
                  <Link key={page.id} to={`/pages/${page.id}`} className="dash-table-row">
                    <span className="dash-table-rank">#{i + 1}</span>
                    <div className="dash-table-info">
                      <span className="dash-table-title">{page.title}</span>
                      <span className="dash-table-meta">
                        {page.created_by_name} · {parseInt(page.version_count)} {t('dashboard.versions')} · {parseInt(page.comment_count)} {t('dashboard.comments_label')}
                      </span>
                    </div>
                    <ArrowUpRight size={14} className="dash-table-arrow" />
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Top Users */}
          <div className="card">
            <h3><Crown size={18} /> {t('dashboard.top_users')}</h3>
            <div className="dash-table">
              {topUsers.length === 0 ? (
                <div className="dash-table-empty">{t('dashboard.no_data')}</div>
              ) : (
                topUsers.map((u, i) => (
                  <div key={u.id} className="dash-table-row">
                    <span className="dash-table-rank">#{i + 1}</span>
                    <div className="dash-user-avatar">{(u.display_name || u.username)?.[0]?.toUpperCase()}</div>
                    <div className="dash-table-info">
                      <span className="dash-table-title">{u.display_name || u.username}</span>
                      <span className="dash-table-meta">
                        {parseInt(u.page_count)} {t('dashboard.pages_label')} · {parseInt(u.edit_count)} {t('dashboard.edits_label')} · {parseInt(u.comment_count)} {t('dashboard.comments_label')}
                      </span>
                    </div>
                    <span className={`dash-role-badge ${u.global_role}`}>{u.global_role}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
