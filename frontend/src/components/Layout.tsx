/**
 * Layout-Komponente (Hauptlayout der Nexora-Anwendung)
 *
 * Bildet das Grundgerüst der gesamten Nexora-Anwendung.
 * Enthält die Seitenleiste mit Navigation, Benutzerinformationen,
 * globaler Suche und den Hauptinhaltsbereich (Outlet).
 *
 * Funktionen:
 * - Responsive Seitenleiste mit mobiler Umschaltung
 * - Globale Suchfunktion mit Tastaturkürzel (Cmd/Ctrl+K)
 * - Navigationsmenü mit rollenbasierter Sichtbarkeit
 * - Benutzeranzeige mit Rollenfarbe
 * - Abmelden-Funktion
 * - Veröffentlichungsanfragen-Zähler für Auditoren/Admins
 */

import { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';

import {
  Home,
  FileText,
  Activity,
  BookOpen,
  Menu,
  X,
  Users,
  ScrollText,
  LogOut,
  Shield,
  Star,
  Search,
  Trash2,
  CheckSquare,
  Network,
  Settings as SettingsIcon,
  Layers,
  FolderOpen,
  Lock,
  Send,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { api, type WikiPage } from '../api/client';
import NotificationBell from './NotificationBell';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, hasPermission, isAdmin, isAuditor } = useAuth();
  const { t } = useLanguage();

  // Anzahl der offenen Veröffentlichungsanträge (für Auditoren/Admins)
  const [publishCount, setPublishCount] = useState(0);

  useEffect(() => {
    if (isAdmin || isAuditor) {
      api.getPublishRequests('pending').then(r => setPublishCount(r.length)).catch(() => {});
      const interval = setInterval(() => {
        api.getPublishRequests('pending').then(r => setPublishCount(r.length)).catch(() => {});
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [isAdmin, isAuditor]);

  // Globale Suchfunktion
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<WikiPage[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Tastaturkürzel: Strg/Cmd+K öffnet die Suche
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Klick außerhalb der Suche schließt die Ergebnisse
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Verzögerte Suche (250ms Debounce)
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) { setSearchResults([]); return; }
    setSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const results = await api.searchPages(q);
        setSearchResults(results.slice(0, 8));
      } catch { setSearchResults([]); }
      finally { setSearchLoading(false); }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Suche beim Navigieren zurücksetzen
  useEffect(() => {
    setSearchOpen(false);
    setSearchQuery('');
  }, [location.pathname]);

  const closeSidebar = () => setSidebarOpen(false);

  // Navigationsstruktur mit Nexora-spezifischen Bereichen
  const navItems: { to: string; icon: any; label: string; end: boolean; show: boolean; badge?: number }[] = [
    { to: '/', icon: Home, label: t('layout.nav.home'), end: true, show: true },
    { to: '/spaces', icon: Layers, label: t('layout.nav.spaces'), end: false, show: hasPermission('spaces.read') },
    { to: '/private', icon: Lock, label: t('layout.nav.private'), end: true, show: hasPermission('private.manage') },
    { to: '/pages', icon: FileText, label: t('layout.nav.pages'), end: true, show: hasPermission('pages.read') },
    { to: '/favorites', icon: Star, label: t('layout.nav.favorites'), end: true, show: true },
    { to: '/publishing', icon: Send, label: t('layout.nav.publishing'), end: false, show: true, badge: publishCount > 0 ? publishCount : undefined },
    { to: '/trash', icon: Trash2, label: t('layout.nav.trash'), end: true, show: hasPermission('pages.read') },
    { to: '/graph', icon: Network, label: t('layout.nav.graph'), end: true, show: hasPermission('pages.read') },
    { to: '/users', icon: Users, label: t('layout.nav.users'), end: true, show: isAdmin },
    { to: '/audit', icon: ScrollText, label: t('layout.nav.audit'), end: true, show: isAdmin || isAuditor },
    { to: '/health', icon: Activity, label: t('layout.nav.health'), end: true, show: hasPermission('health.read') },
    { to: '/settings', icon: SettingsIcon, label: t('layout.nav.settings'), end: true, show: true },
  ];

  const handleLogout = async () => {
    closeSidebar();
    await logout();
  };

  // Rollenfarbe: Admin = Rot, Auditor = Orange, Benutzer = Sekundär
  const roleColor = user?.globalRole === 'admin'
    ? 'var(--color-danger)'
    : user?.globalRole === 'auditor'
      ? 'var(--color-warning, #f59e0b)'
      : 'var(--color-text-secondary)';

  return (
    <div className="app">
      {/* Mobiler Umschalter */}
      <button
        className={`mobile-toggle ${sidebarOpen ? 'active' : ''}`}
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label={t('layout.toggle_nav')}
      >
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Overlay bei geöffneter mobiler Seitenleiste */}
      {sidebarOpen && <div className="overlay" onClick={closeSidebar} />}

      {/* Seitenleiste */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        {/* Nexora-Markenlogo */}
        <div className="sidebar-brand">
          <NavLink to="/" className="brand-link" onClick={closeSidebar}>
            <div className="brand-icon">
              <BookOpen size={22} />
            </div>
            <span className="brand-text">Nexora</span>
          </NavLink>
        </div>

        {/* Benutzerinformationen */}
        {user && (
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">{user.username[0].toUpperCase()}</div>
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">{user.displayName || user.username}</span>
              <span className="sidebar-user-role" style={{ color: roleColor }}>
                <Shield size={11} /> {t(`role.${user.globalRole}`) || user.globalRole}
              </span>
            </div>
            <NotificationBell />
          </div>
        )}

        {/* Globale Suche */}
        <div className="sidebar-search" ref={searchRef}>
          <div className="sidebar-search-input" onClick={() => setSearchOpen(true)}>
            <Search size={15} />
            <input
              type="text"
              placeholder={t('layout.search_placeholder')}
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
            />
          </div>
          {searchOpen && searchQuery.trim() && (
            <div className="sidebar-search-results">
              {searchLoading ? (
                <div className="search-result-empty">{t('layout.search_running')}</div>
              ) : searchResults.length === 0 ? (
                <div className="search-result-empty">{t('layout.search_no_results')}</div>
              ) : (
                <>
                  {searchResults.map(page => (
                    <button
                      key={page.id}
                      className="search-result-item"
                      onClick={() => {
                        navigate(`/pages/${page.id}`);
                        setSearchOpen(false);
                        setSearchQuery('');
                        closeSidebar();
                      }}
                    >
                      <FileText size={14} />
                      <span className="search-result-title">{page.title}</span>
                    </button>
                  ))}
                  <button
                    className="search-result-item search-result-all"
                    onClick={() => {
                      navigate(`/pages?q=${encodeURIComponent(searchQuery)}`);
                      setSearchOpen(false);
                      setSearchQuery('');
                      closeSidebar();
                    }}
                  >
                    <Search size={14} />
                    <span>{t('layout.search_show_all')}</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Hauptnavigation */}
        <nav className="sidebar-nav">
          <div className="nav-label">{t('layout.nav_label')}</div>
          {navItems.filter(n => n.show).map(({ to, icon: Icon, label, end, badge }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `nav-link ${isActive ? 'active' : ''}`
              }
              onClick={closeSidebar}
            >
              <Icon size={18} />
              <span>{label}</span>
              {badge !== undefined && <span className="nav-badge">{badge}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Fußzeile */}
        <div className="sidebar-footer">
          <button className="sidebar-logout" onClick={handleLogout}>
            <LogOut size={16} />
            <span>{t('layout.logout')}</span>
          </button>
          <div className="sidebar-footer-text">
            <span className="status-dot" />
            <span>{t('layout.system_online')}</span>
          </div>
        </div>
      </aside>

      {/* Hauptinhaltsbereich */}
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
