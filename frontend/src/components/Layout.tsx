import { useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
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
  Moon,
  Sun,
  Star,
  Share2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../hooks/useTheme';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { user, logout, hasPermission, isAdmin } = useAuth();
  const { theme, toggleTheme, isDark } = useTheme();

  const closeSidebar = () => setSidebarOpen(false);

  const navItems = [
    { to: '/', icon: Home, label: 'Home', end: true, show: true },
    { to: '/pages', icon: FileText, label: 'Pages', end: true, show: hasPermission('pages.read') },
    { to: '/favorites', icon: Star, label: 'Favorites', end: true, show: true },
    { to: '/shared', icon: Share2, label: 'Shared with me', end: true, show: true },
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

        <nav className="sidebar-nav">
          <div className="nav-label">Navigation</div>
          {navItems.filter(n => n.show).map(({ to, icon: Icon, label, end }) => (
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
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="sidebar-theme-toggle" onClick={toggleTheme} title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
            <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
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
