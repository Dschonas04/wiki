/**
 * Home.tsx – Startseite des Wikis
 *
 * Diese Komponente rendert die Hauptseite nach dem Login.
 * Sie zeigt eine Willkommensnachricht, Systemstatistiken,
 * die zuletzt bearbeiteten Seiten und Schnellzugriff-Aktionen an.
 */

// React-Hooks und Router-Importe
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

// Icon-Importe aus der Lucide-Bibliothek
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
  Layers,
  Lock,
} from 'lucide-react';

// Authentifizierungs-Kontext für Benutzerinformationen und Berechtigungen
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
// API-Client und Typdefinitionen
import { api, type WikiPage, type HealthData } from '../api/client';
// Wiederverwendbare Seitenkopf-Komponente
import PageHeader from '../components/PageHeader';

export default function Home() {
  // Benutzer, Berechtigungen und Admin-Status aus dem Auth-Kontext holen
  const { user, hasPermission, isAdmin } = useAuth();
  const { t, language } = useLanguage();

  // Zustand für die zuletzt bearbeiteten Seiten
  const [recentPages, setRecentPages] = useState<WikiPage[]>([]);
  // Zustand für Systemstatistiken (Seitenanzahl, Benutzer, Uptime usw.)
  const [stats, setStats] = useState<HealthData | null>(null);
  // Ladezustand für die Liste der letzten Seiten
  const [loadingRecent, setLoadingRecent] = useState(true);

  // Beim ersten Rendern: Letzte Seiten und Systemstatus vom Server laden
  useEffect(() => {
    api.getRecentPages(8).then(setRecentPages).catch(() => {}).finally(() => setLoadingRecent(false));
    api.getHealth().then(setStats).catch(() => {});
  }, []);

  // Hilfsfunktion: Datum im deutschen Format formatieren
  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <>
      {/* Seitenkopf mit Titel und Untertitel */}
      <PageHeader title={t('home.title')} subtitle={t('home.subtitle')} />

      <div className="content-body">
        {/* Heldenkarte – Begrüßung und Hauptaktionen */}
        <div className="hero-card">
          <div className="hero-card-content">
            {/* Persönliche Begrüßung mit Anzeigename oder Benutzername */}
            <h2>{t('home.greeting', { name: user?.displayName || user?.username || '' })}</h2>
            <p>
              {t('home.description')}
            </p>
            <div className="hero-actions">
              {/* Schaltfläche "Seite erstellen" nur anzeigen, wenn Berechtigung vorhanden */}
              {hasPermission('pages.create') && (
                <Link to="/pages/new" className="btn btn-white">
                  <PlusCircle size={18} />
                  <span>{t('home.create_page')}</span>
                </Link>
              )}
              {/* Link zum Durchsuchen aller Seiten */}
              <Link to="/pages" className="btn btn-ghost-white">
                <span>{t('home.all_pages')}</span>
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
          {/* Dekoratives Buchsymbol auf der rechten Seite */}
          <div className="hero-card-visual">
            <BookOpen size={120} strokeWidth={0.8} />
          </div>
        </div>

        {/* Statistik-Bereich – wird nur angezeigt, wenn Daten vorhanden sind */}
        {stats && (
          <div className="stats-grid">
            {/* Anzahl der Wiki-Seiten */}
            <div className="stat-card">
              <div className="stat-icon blue"><FileText size={20} /></div>
              <div className="stat-info">
                <div className="stat-number">{stats.counts?.pages ?? 0}</div>
                <div className="stat-label">{t('home.stat_pages')}</div>
              </div>
            </div>
            {/* Anzahl der registrierten Benutzer */}
            <div className="stat-card">
              <div className="stat-icon purple"><Users size={20} /></div>
              <div className="stat-info">
                <div className="stat-number">{stats.counts?.users ?? 0}</div>
                <div className="stat-label">{t('home.stat_users')}</div>
              </div>
            </div>
            {/* Server-Uptime in Stunden */}
            <div className="stat-card">
              <div className="stat-icon green"><Activity size={20} /></div>
              <div className="stat-info">
                <div className="stat-number">{Math.floor((stats.uptime || 0) / 3600)}h</div>
                <div className="stat-label">{t('home.stat_uptime')}</div>
              </div>
            </div>
            {/* Systemstatus: gesund oder fehlerhaft */}
            <div className="stat-card">
              <div className="stat-icon orange"><TrendingUp size={20} /></div>
              <div className="stat-info">
                <div className="stat-number">{stats.status === 'healthy' ? '✓' : '✗'}</div>
                <div className="stat-label">{t('home.stat_system')}</div>
              </div>
            </div>
          </div>
        )}

        {/* Bereich: Zuletzt bearbeitete Seiten */}
        <div className="section-title">
          <Clock size={18} /> {t('home.recent_title')}
        </div>
        {/* Ladezustand anzeigen */}
        {loadingRecent ? (
          <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--c-text-muted)' }}>{t('home.recent_loading')}</div>
        ) : recentPages.length === 0 ? (
          /* Hinweis, wenn noch keine Seiten vorhanden sind */
          <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--c-text-muted)' }}>
            {t('home.recent_empty')}
          </div>
        ) : (
          /* Liste der zuletzt bearbeiteten Seiten mit Titel, Autor und Datum */
          <div className="recent-pages-list">
            {recentPages.map((page) => (
              <Link to={`/pages/${page.id}`} className="recent-page-item" key={page.id}>
                <FileText size={16} className="recent-page-icon" />
                <span className="recent-page-title">{page.title}</span>
                <span className="recent-page-meta">
                  {/* Name des letzten Bearbeiters anzeigen, falls vorhanden */}
                  {page.updated_by_name && <span>{page.updated_by_name}</span>}
                  {/* Formatiertes Datum der letzten Aenderung */}
                  <span>{formatDate(page.updated_at)}</span>
                </span>
              </Link>
            ))}
          </div>
        )}

        {/* Bereich: Schnellzugriff-Aktionen */}
        <div className="section-title">{t('home.quick_access')}</div>
        <div className="action-grid">
          {/* Alle Seiten durchsuchen */}
          <Link to="/pages" className="action-card">
            <div className="action-card-icon blue">
              <FileText size={22} />
            </div>
            <div className="action-card-text">
              <h3>{t('home.action_pages')}</h3>
              <p>{t('home.action_pages_desc')}</p>
            </div>
            <ArrowRight size={16} className="action-arrow" />
          </Link>
          {/* Team-Bereiche verwalten */}
          <Link to="/spaces" className="action-card">
            <div className="action-card-icon teal">
              <Layers size={22} />
            </div>
            <div className="action-card-text">
              <h3>{t('home.action_spaces')}</h3>
              <p>{t('home.action_spaces_desc')}</p>
            </div>
            <ArrowRight size={16} className="action-arrow" />
          </Link>
          {/* Persoenlicher Bereich */}
          <Link to="/private" className="action-card">
            <div className="action-card-icon slate">
              <Lock size={22} />
            </div>
            <div className="action-card-text">
              <h3>{t('home.action_private')}</h3>
              <p>{t('home.action_private_desc')}</p>
            </div>
            <ArrowRight size={16} className="action-arrow" />
          </Link>
          {/* Neue Seite erstellen – nur mit entsprechender Berechtigung */}
          {hasPermission('pages.create') && (
            <Link to="/pages/new" className="action-card">
              <div className="action-card-icon green">
                <PlusCircle size={22} />
              </div>
              <div className="action-card-text">
                <h3>{t('home.action_new_page')}</h3>
                <p>{t('home.action_new_page_desc')}</p>
              </div>
              <ArrowRight size={16} className="action-arrow" />
            </Link>
          )}
          {/* Admin-Aktionen: Benutzerverwaltung und Audit-Protokoll */}
          {isAdmin && (
            <>
              {/* Benutzerverwaltung – nur fuer Administratoren sichtbar */}
              <Link to="/users" className="action-card">
                <div className="action-card-icon purple">
                  <Users size={22} />
                </div>
                <div className="action-card-text">
                <h3>{t('home.action_users')}</h3>
                <p>{t('home.action_users_desc')}</p>
                </div>
                <ArrowRight size={16} className="action-arrow" />
              </Link>
              {/* Audit-Protokoll – nur fuer Administratoren sichtbar */}
              <Link to="/audit" className="action-card">
                <div className="action-card-icon orange">
                  <ScrollText size={22} />
                </div>
                <div className="action-card-text">
                  <h3>{t('home.action_audit')}</h3>
                  <p>{t('home.action_audit_desc')}</p>
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
