/**
 * App.tsx – Hauptkomponente der Nexora-Anwendung
 *
 * Definiert die zentrale App-Komponente mit dem gesamten Routing.
 * Enthält:
 * - Lazy-Loading aller Seitenkomponenten für bessere Performance
 * - Authentifizierungsschutz für geschützte Routen (RequireAuth)
 * - Weiterleitung nicht angemeldeter Benutzer zur Login-Seite
 * - Erzwungene Passwortänderung wenn vom System gefordert
 * - Bereitstellung der globalen Kontext-Provider (Toast, Auth)
 */

import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/Layout';
import Loading from './components/Loading';
import CookieBanner from './components/CookieBanner';

// ===== Lazy-geladene Seitenkomponenten =====
const Home = lazy(() => import('./pages/Home'));
const Pages = lazy(() => import('./pages/Pages'));
const PageView = lazy(() => import('./pages/PageView'));
const PageHistory = lazy(() => import('./pages/PageHistory'));
const NewPage = lazy(() => import('./pages/NewPage'));
const EditPage = lazy(() => import('./pages/EditPage'));
const Favorites = lazy(() => import('./pages/Favorites'));
const Health = lazy(() => import('./pages/Health'));
const Login = lazy(() => import('./pages/Login'));
const UsersPage = lazy(() => import('./pages/Users'));
const AuditLog = lazy(() => import('./pages/AuditLog'));
const ChangePassword = lazy(() => import('./pages/ChangePassword'));
const NotFound = lazy(() => import('./pages/NotFound'));
const Trash = lazy(() => import('./pages/Trash'));
const KnowledgeGraph = lazy(() => import('./pages/KnowledgeGraph'));
const Settings = lazy(() => import('./pages/Settings'));

// Neue Nexora-Seiten
const Spaces = lazy(() => import('./pages/Spaces'));
const SpaceView = lazy(() => import('./pages/SpaceView'));
const PrivateSpacePage = lazy(() => import('./pages/PrivateSpace'));
const Publishing = lazy(() => import('./pages/Publishing'));
// AdminDashboard is now embedded in Health.tsx
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));

/**
 * RequireAuth – Wrapper zum Schutz von Routen
 */
function RequireAuth({ children, permission }: { children: JSX.Element; permission?: string }) {
  const { user, loading, hasPermission } = useAuth();
  if (loading) return <div className="content-body"><Loading /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (permission && !hasPermission(permission)) return <Navigate to="/" replace />;
  return children;
}

/**
 * AppRoutes – Definiert alle Routen der Nexora-Anwendung
 */
function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="login-page"><Loading /></div>;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Suspense fallback={<div className="login-page"><Loading /></div>}><Login /></Suspense>} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (user.mustChangePassword) {
    return (
      <Routes>
        <Route path="*" element={<Suspense fallback={<div className="login-page"><Loading /></div>}><ChangePassword forced /></Suspense>} />
      </Routes>
    );
  }

  // Suspense-Wrapper-Hilfsfunktion
  const S = ({ children }: { children: React.ReactNode }) => (
    <Suspense fallback={<div className="content-body"><Loading /></div>}>{children}</Suspense>
  );

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<Layout />}>
        {/* Startseite */}
        <Route path="/" element={<S><Home /></S>} />

        {/* Team-Bereiche */}
        <Route path="/spaces" element={<RequireAuth permission="spaces.read"><S><Spaces /></S></RequireAuth>} />
        <Route path="/spaces/:id" element={<RequireAuth permission="spaces.read"><S><SpaceView /></S></RequireAuth>} />

        {/* Privater Bereich */}
        <Route path="/private" element={<RequireAuth permission="private.manage"><S><PrivateSpacePage /></S></RequireAuth>} />

        {/* Veröffentlichungs-Workflow */}
        <Route path="/publishing" element={<S><Publishing /></S>} />

        {/* Seiten */}
        <Route path="/pages" element={<RequireAuth permission="pages.read"><S><Pages /></S></RequireAuth>} />
        <Route path="/pages/new" element={<RequireAuth permission="pages.create"><S><NewPage /></S></RequireAuth>} />
        <Route path="/pages/:id" element={<RequireAuth permission="pages.read"><S><PageView /></S></RequireAuth>} />
        <Route path="/pages/:id/history" element={<RequireAuth permission="pages.read"><S><PageHistory /></S></RequireAuth>} />
        <Route path="/pages/:id/edit" element={<RequireAuth permission="pages.create"><S><EditPage /></S></RequireAuth>} />

        {/* Favoriten */}
        <Route path="/favorites" element={<S><Favorites /></S>} />

        {/* Papierkorb */}
        <Route path="/trash" element={<RequireAuth permission="pages.read"><S><Trash /></S></RequireAuth>} />

        {/* Wissensgraph */}
        <Route path="/graph" element={<RequireAuth permission="pages.read"><S><KnowledgeGraph /></S></RequireAuth>} />

        {/* Administration */}
        <Route path="/notifications" element={<S><NotificationsPage /></S>} />
        <Route path="/users" element={<RequireAuth permission="users.read"><S><UsersPage /></S></RequireAuth>} />
        <Route path="/audit" element={<RequireAuth permission="audit.read"><S><AuditLog /></S></RequireAuth>} />
        <Route path="/health" element={<RequireAuth permission="health.read"><S><Health /></S></RequireAuth>} />

        {/* Einstellungen */}
        <Route path="/settings" element={<S><Settings /></S>} />
        <Route path="/change-password" element={<S><ChangePassword /></S>} />

        {/* 404 */}
        <Route path="*" element={<S><NotFound /></S>} />
      </Route>
    </Routes>
  );
}

/**
 * App – Wurzelkomponente der Nexora-Anwendung
 */
export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <LanguageProvider>
          <AuthProvider>
            <AppRoutes />
            <CookieBanner />
          </AuthProvider>
        </LanguageProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
