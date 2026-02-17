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
// API-Client und Typdefinitionen
import { api, type WikiPage, type HealthData } from '../api/client';
// Wiederverwendbare Seitenkopf-Komponente
import PageHeader from '../components/PageHeader';

export default function Home() {
  // Benutzer, Berechtigungen und Admin-Status aus dem Auth-Kontext holen
  const { user, hasPermission, isAdmin } = useAuth();

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
    new Date(s).toLocaleDateString('de-DE', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <>
      {/* Seitenkopf mit Titel und Untertitel */}
      <PageHeader title="Willkommen bei Nexora" subtitle="Dein modernes Wissensmanagement-System" />

      <div className="content-body">
        {/* Heldenkarte – Begrüßung und Hauptaktionen */}
        <div className="hero-card">
          <div className="hero-card-content">
            {/* Persönliche Begrüßung mit Anzeigename oder Benutzername */}
            <h2>Hallo, {user?.displayName || user?.username}!</h2>
            <p>
              Erstelle, organisiere und teile Wissen mit deinem Team.
              Nexora bietet Markdown-Bearbeitung, Volltextsuche, Versionierung und rollenbasierte Zugriffskontrolle.
            </p>
            <div className="hero-actions">
              {/* Schaltfläche "Seite erstellen" nur anzeigen, wenn Berechtigung vorhanden */}
              {hasPermission('pages.create') && (
                <Link to="/pages/new" className="btn btn-white">
                  <PlusCircle size={18} />
                  <span>Seite erstellen</span>
                </Link>
              )}
              {/* Link zum Durchsuchen aller Seiten */}
              <Link to="/pages" className="btn btn-ghost-white">
                <span>Alle Seiten</span>
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
                <div className="stat-label">Seiten</div>
              </div>
            </div>
            {/* Anzahl der registrierten Benutzer */}
            <div className="stat-card">
              <div className="stat-icon purple"><Users size={20} /></div>
              <div className="stat-info">
                <div className="stat-number">{stats.counts?.users ?? 0}</div>
                <div className="stat-label">Benutzer</div>
              </div>
            </div>
            {/* Server-Uptime in Stunden */}
            <div className="stat-card">
              <div className="stat-icon green"><Activity size={20} /></div>
              <div className="stat-info">
                <div className="stat-number">{Math.floor((stats.uptime || 0) / 3600)}h</div>
                <div className="stat-label">Betriebszeit</div>
              </div>
            </div>
            {/* Systemstatus: gesund oder fehlerhaft */}
            <div className="stat-card">
              <div className="stat-icon orange"><TrendingUp size={20} /></div>
              <div className="stat-info">
                <div className="stat-number">{stats.status === 'healthy' ? '✓' : '✗'}</div>
                <div className="stat-label">System</div>
              </div>
            </div>
          </div>
        )}

        {/* Bereich: Zuletzt bearbeitete Seiten */}
        <div className="section-title">
          <Clock size={18} /> Zuletzt bearbeitet
        </div>
        {/* Ladezustand anzeigen */}
        {loadingRecent ? (
          <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--c-text-muted)' }}>Laden…</div>
        ) : recentPages.length === 0 ? (
          /* Hinweis, wenn noch keine Seiten vorhanden sind */
          <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--c-text-muted)' }}>
            Noch keine Seiten – erstelle deine erste Seite!
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
                  {(page as any).updated_by_name && <span>{(page as any).updated_by_name}</span>}
                  {/* Formatiertes Datum der letzten Aenderung */}
                  <span>{formatDate(page.updated_at)}</span>
                </span>
              </Link>
            ))}
          </div>
        )}

        {/* Bereich: Schnellzugriff-Aktionen */}
        <div className="section-title">Schnellzugriff</div>
        <div className="action-grid">
          {/* Alle Seiten durchsuchen */}
          <Link to="/pages" className="action-card">
            <div className="action-card-icon blue">
              <FileText size={22} />
            </div>
            <div className="action-card-text">
              <h3>Alle Seiten</h3>
              <p>Wiki-Seiten durchsuchen und verwalten</p>
            </div>
            <ArrowRight size={16} className="action-arrow" />
          </Link>
          {/* Team-Bereiche verwalten */}
          <Link to="/spaces" className="action-card">
            <div className="action-card-icon teal">
              <Layers size={22} />
            </div>
            <div className="action-card-text">
              <h3>Team-Bereiche</h3>
              <p>Bereiche und Ordner verwalten</p>
            </div>
            <ArrowRight size={16} className="action-arrow" />
          </Link>
          {/* Persoenlicher Bereich */}
          <Link to="/private" className="action-card">
            <div className="action-card-icon slate">
              <Lock size={22} />
            </div>
            <div className="action-card-text">
              <h3>Mein Bereich</h3>
              <p>Persönliche Entwürfe verwalten</p>
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
                <h3>Neue Seite</h3>
                <p>Neue Wiki-Seite erstellen</p>
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
                <h3>Benutzerverwaltung</h3>
                <p>Benutzerkonten verwalten</p>
                </div>
                <ArrowRight size={16} className="action-arrow" />
              </Link>
              {/* Audit-Protokoll – nur fuer Administratoren sichtbar */}
              <Link to="/audit" className="action-card">
                <div className="action-card-icon orange">
                  <ScrollText size={22} />
                </div>
                <div className="action-card-text">
                  <h3>Audit-Protokoll</h3>
                  <p>Systemereignisse prüfen</p>
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
