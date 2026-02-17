import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Loading from './components/Loading';
import CookieBanner from './components/CookieBanner';

// Lazy load pages
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
const SharedWithMe = lazy(() => import('./pages/SharedWithMe'));
const Trash = lazy(() => import('./pages/Trash'));
const Approvals = lazy(() => import('./pages/Approvals'));
function RequireAuth({ children, permission }: { children: JSX.Element; permission?: string }) {
  const { user, loading, hasPermission } = useAuth();
  if (loading) return <div className="content-body"><Loading /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (permission && !hasPermission(permission)) return <Navigate to="/" replace />;
  return children;
}

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

  // Force password change if required
  if (user.mustChangePassword) {
    return (
      <Routes>
        <Route path="*" element={<Suspense fallback={<div className="login-page"><Loading /></div>}><ChangePassword forced /></Suspense>} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Suspense fallback={<div className="content-body"><Loading /></div>}><Home /></Suspense>} />
        <Route path="/favorites" element={<Suspense fallback={<div className="content-body"><Loading /></div>}><Favorites /></Suspense>} />
        <Route path="/shared" element={<Suspense fallback={<div className="content-body"><Loading /></div>}><SharedWithMe /></Suspense>} />
        <Route path="/trash" element={<RequireAuth permission="pages.read"><Suspense fallback={<div className="content-body"><Loading /></div>}><Trash /></Suspense></RequireAuth>} />
        <Route path="/approvals" element={<RequireAuth permission="users.manage"><Suspense fallback={<div className="content-body"><Loading /></div>}><Approvals /></Suspense></RequireAuth>} />
        <Route path="/pages" element={<RequireAuth permission="pages.read"><Suspense fallback={<div className="content-body"><Loading /></div>}><Pages /></Suspense></RequireAuth>} />
        <Route path="/pages/new" element={<RequireAuth permission="pages.create"><Suspense fallback={<div className="content-body"><Loading /></div>}><NewPage /></Suspense></RequireAuth>} />
        <Route path="/pages/:id" element={<RequireAuth permission="pages.read"><Suspense fallback={<div className="content-body"><Loading /></div>}><PageView /></Suspense></RequireAuth>} />
        <Route path="/pages/:id/history" element={<RequireAuth permission="pages.read"><Suspense fallback={<div className="content-body"><Loading /></div>}><PageHistory /></Suspense></RequireAuth>} />
        <Route path="/pages/:id/edit" element={<RequireAuth permission="pages.edit"><Suspense fallback={<div className="content-body"><Loading /></div>}><EditPage /></Suspense></RequireAuth>} />
        <Route path="/users" element={<RequireAuth permission="users.read"><Suspense fallback={<div className="content-body"><Loading /></div>}><UsersPage /></Suspense></RequireAuth>} />
        <Route path="/audit" element={<RequireAuth permission="audit.read"><Suspense fallback={<div className="content-body"><Loading /></div>}><AuditLog /></Suspense></RequireAuth>} />
        <Route path="/health" element={<RequireAuth permission="health.read"><Suspense fallback={<div className="content-body"><Loading /></div>}><Health /></Suspense></RequireAuth>} />
        <Route path="/change-password" element={<Suspense fallback={<div className="content-body"><Loading /></div>}><ChangePassword /></Suspense>} />
        <Route path="*" element={<Suspense fallback={<div className="content-body"><Loading /></div>}><NotFound /></Suspense>} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppRoutes />
        <CookieBanner />
      </AuthProvider>
    </ToastProvider>
  );
}
