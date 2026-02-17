import { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  FileText,
  Activity,
  PlusCircle,
  BookOpen,
  Menu,
  X,
  Users,
  ScrollText,
  LogOut,
  Shield,
  Lock,
  Palette,
  Star,
  Share2,
  Search,
  Trash2,
  CheckSquare,
  Network,
  ChevronUp,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../hooks/useTheme';
import { api, type WikiPage } from '../api/client';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, hasPermission, isAdmin } = useAuth();
  const { theme, setTheme, isDark, themes } = useTheme();

  // Theme picker
  const [themeOpen, setThemeOpen] = useState(false);
  const themeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (themeRef.current && !themeRef.current.contains(e.target as Node)) setThemeOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Pending approval count for admins
  const [approvalCount, setApprovalCount] = useState(0);

  useEffect(() => {
    if (isAdmin) {
      api.getApprovalCount().then(r => setApprovalCount(r.count)).catch(() => {});
      const interval = setInterval(() => {
        api.getApprovalCount().then(r => setApprovalCount(r.count)).catch(() => {});
      }, 30000); // poll every 30s
      return () => clearInterval(interval);
    }
  }, [isAdmin]);

  // Global search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<WikiPage[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcut: Ctrl/Cmd+K to focus search
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

  // Click outside to close search
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Debounced search
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

  // Close search on navigation
  useEffect(() => {
    setSearchOpen(false);
    setSearchQuery('');
  }, [location.pathname]);

  const closeSidebar = () => setSidebarOpen(false);

  const navItems: { to: string; icon: any; label: string; end: boolean; show: boolean; badge?: number }[] = [
    { to: '/', icon: Home, label: 'Home', end: true, show: true },
    { to: '/pages', icon: FileText, label: 'Pages', end: true, show: hasPermission('pages.read') },
    { to: '/favorites', icon: Star, label: 'Favorites', end: true, show: true },
    { to: '/shared', icon: Share2, label: 'Shared with me', end: true, show: true },
    { to: '/trash', icon: Trash2, label: 'Trash', end: true, show: hasPermission('pages.read') },
    { to: '/graph', icon: Network, label: 'Knowledge Graph', end: true, show: hasPermission('pages.read') },
    { to: '/approvals', icon: CheckSquare, label: 'Approvals', end: true, show: isAdmin, badge: approvalCount > 0 ? approvalCount : undefined },
    { to: '/pages/new', icon: PlusCircle, label: 'New Page', end: true, show: hasPermission('pages.create') },
    { to: '/users', icon: Users, label: 'Users', end: true, show: isAdmin },
    { to: '/audit', icon: ScrollText, label: 'Audit Log', end: true, show: isAdmin },
    { to: '/health', icon: Activity, label: 'System Health', end: true, show: hasPermission('health.read') },
    { to: '/change-password', icon: Lock, label: 'Change Password', end: true, show: user?.authSource === 'local' },
  ];

  const handleLogout = async () => {
    closeSidebar();
    await logout();
  };

  const roleColor = user?.role === 'admin' ? 'var(--color-danger)' : user?.role === 'editor' ? 'var(--color-primary)' : 'var(--color-text-secondary)';

  return (
    <div className="app">
      {/* Mobile toggle */}
      <button
        className={`mobile-toggle ${sidebarOpen ? 'active' : ''}`}
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle navigation"
      >
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Overlay */}
      {sidebarOpen && <div className="overlay" onClick={closeSidebar} />}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <NavLink to="/" className="brand-link" onClick={closeSidebar}>
            <div className="brand-icon">
              <BookOpen size={22} />
            </div>
            <span className="brand-text">Wiki</span>
          </NavLink>
        </div>

        {/* User info */}
        {user && (
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">{user.username[0].toUpperCase()}</div>
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">{user.displayName || user.username}</span>
              <span className="sidebar-user-role" style={{ color: roleColor }}>
                <Shield size={11} /> {user.role}
              </span>
            </div>
          </div>
        )}

        {/* Global Search */}
        <div className="sidebar-search" ref={searchRef}>
          <div className="sidebar-search-input" onClick={() => setSearchOpen(true)}>
            <Search size={15} />
            <input
              type="text"
              placeholder="Search… ⌘K"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
            />
          </div>
          {searchOpen && searchQuery.trim() && (
            <div className="sidebar-search-results">
              {searchLoading ? (
                <div className="search-result-empty">Searching…</div>
              ) : searchResults.length === 0 ? (
                <div className="search-result-empty">No results found</div>
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
                    <span>View all results</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <nav className="sidebar-nav">
          <div className="nav-label">Navigation</div>
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

        <div className="sidebar-footer">
          <div className="theme-picker-wrap" ref={themeRef}>
            {themeOpen && (
              <div className="theme-picker-dropdown">
                {themes.map(t => (
                  <button
                    key={t.id}
                    className={`theme-option ${theme === t.id ? 'active' : ''}`}
                    onClick={() => { setTheme(t.id); setThemeOpen(false); }}
                  >
                    <span className="theme-option-icon">{t.icon}</span>
                    <span>{t.label}</span>
                    <span className="theme-option-check">✓</span>
                  </button>
                ))}
              </div>
            )}
            <button className="theme-picker-btn" onClick={() => setThemeOpen(!themeOpen)} title="Change Theme">
              <Palette size={16} />
              <span>{themes.find(t => t.id === theme)?.label ?? 'Theme'}</span>
              <ChevronUp size={14} style={{ marginLeft: 'auto', opacity: 0.5, transform: themeOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>
          </div>
          <button className="sidebar-logout" onClick={handleLogout}>
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
          <div className="sidebar-footer-text">
            <span className="status-dot" />
            <span>System Online</span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
