import { Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Home from './pages/Home';
import Pages from './pages/Pages';
import PageView from './pages/PageView';
import PageHistory from './pages/PageHistory';
import NewPage from './pages/NewPage';
import EditPage from './pages/EditPage';
import Favorites from './pages/Favorites';
import Health from './pages/Health';
import Login from './pages/Login';
import UsersPage from './pages/Users';
import AuditLog from './pages/AuditLog';
import ChangePassword from './pages/ChangePassword';
import NotFound from './pages/NotFound';
import SharedWithMe from './pages/SharedWithMe';
import Loading from './components/Loading';
import CookieBanner from './components/CookieBanner';
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
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // Force password change if required
  if (user.mustChangePassword) {
    return (
      <Routes>
        <Route path="*" element={<ChangePassword forced />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/favorites" element={<Favorites />} />
        <Route path="/shared" element={<SharedWithMe />} />
        <Route path="/pages" element={<RequireAuth permission="pages.read"><Pages /></RequireAuth>} />
        <Route path="/pages/new" element={<RequireAuth permission="pages.create"><NewPage /></RequireAuth>} />
        <Route path="/pages/:id" element={<RequireAuth permission="pages.read"><PageView /></RequireAuth>} />
        <Route path="/pages/:id/history" element={<RequireAuth permission="pages.read"><PageHistory /></RequireAuth>} />
        <Route path="/pages/:id/edit" element={<RequireAuth permission="pages.edit"><EditPage /></RequireAuth>} />
        <Route path="/users" element={<RequireAuth permission="users.read"><UsersPage /></RequireAuth>} />
        <Route path="/audit" element={<RequireAuth permission="audit.read"><AuditLog /></RequireAuth>} />
        <Route path="/health" element={<RequireAuth permission="health.read"><Health /></RequireAuth>} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="*" element={<NotFound />} />
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
