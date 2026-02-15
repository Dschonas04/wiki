import { Link } from 'react-router-dom';
import {
  FileText,
  PlusCircle,
  Shield,
  Zap,
  Database,
  ArrowRight,
  Layers,
  Users,
  ScrollText,
  Lock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';

export default function Home() {
  const { user, hasPermission, isAdmin } = useAuth();

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
              Built on a modern, secure architecture with React, Node.js, PostgreSQL, RBAC and LDAP.
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
            <Layers size={120} strokeWidth={0.8} />
          </div>
        </div>

        {/* Quick Actions */}
        <div className="section-title">Quick Actions</div>
        <div className="action-grid">
          <Link to="/pages" className="action-card">
            <div className="action-card-icon blue">
              <FileText size={22} />
            </div>
            <div className="action-card-text">
              <h3>All Pages</h3>
              <p>Browse and manage your wiki pages</p>
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
                  <p>Add, edit or remove user accounts</p>
                </div>
                <ArrowRight size={16} className="action-arrow" />
              </Link>
              <Link to="/audit" className="action-card">
                <div className="action-card-icon orange">
                  <ScrollText size={22} />
                </div>
                <div className="action-card-text">
                  <h3>Audit Log</h3>
                  <p>Review system activity and events</p>
                </div>
                <ArrowRight size={16} className="action-arrow" />
              </Link>
            </>
          )}
        </div>

        {/* Architecture */}
        <div className="section-title">Architecture</div>
        <div className="arch-grid">
          <div className="arch-card">
            <div className="arch-card-icon purple">
              <Shield size={28} />
            </div>
            <h3>Nginx</h3>
            <p>Reverse proxy with security headers, rate limiting, gzip compression and static file serving</p>
          </div>
          <div className="arch-card">
            <div className="arch-card-icon blue">
              <Zap size={28} />
            </div>
            <h3>React + Node.js</h3>
            <p>React SPA frontend with REST API backend, JWT sessions, RBAC authorization and CSRF protection</p>
          </div>
          <div className="arch-card">
            <div className="arch-card-icon green">
              <Database size={28} />
            </div>
            <h3>PostgreSQL</h3>
            <p>Persistent storage with connection pooling, user management, audit logging and health monitoring</p>
          </div>
          <div className="arch-card">
            <div className="arch-card-icon orange">
              <Lock size={28} />
            </div>
            <h3>RBAC + LDAP</h3>
            <p>Role-based access control with admin, editor and viewer roles. Optional LDAP/Active Directory authentication</p>
          </div>
        </div>
      </div>
    </>
  );
}
