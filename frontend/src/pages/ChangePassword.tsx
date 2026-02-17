import { useState, type FormEvent } from 'react';
import { Lock, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function ChangePassword({ forced = false }: { forced?: boolean }) {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Alle Felder sind erforderlich.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Die neuen Passwörter stimmen nicht überein.');
      return;
    }

    if (newPassword.length < 8) {
      setError('Das Passwort muss mindestens 8 Zeichen lang sein.');
      return;
    }

    if (!/[a-zA-Z]/.test(newPassword)) {
      setError('Das Passwort muss mindestens einen Buchstaben enthalten.');
      return;
    }

    if (!/[0-9]/.test(newPassword)) {
      setError('Das Passwort muss mindestens eine Zahl enthalten.');
      return;
    }

    if (!/[^a-zA-Z0-9]/.test(newPassword)) {
      setError('Das Passwort muss mindestens ein Sonderzeichen enthalten.');
      return;
    }

    setLoading(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      showToast('Passwort erfolgreich geändert!', 'success');
      await refreshUser();
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Passwort konnte nicht geändert werden');
    } finally {
      setLoading(false);
    }
  };

  if (user?.authSource === 'ldap') {
    return (
      <div className="content-header">
        <h1>Passwort ändern</h1>
        <p className="text-muted">LDAP-Benutzer müssen ihr Passwort über den Verzeichnisdienst ändern.</p>
      </div>
    );
  }

  return (
    <div className={forced ? 'login-page' : ''}>
      <div className={forced ? 'login-card' : 'content-body'} style={forced ? {} : { maxWidth: 480 }}>
        {forced ? (
          <div className="login-header">
            <div className="login-logo"><Lock size={32} /></div>
            <h1>Passwortänderung erforderlich</h1>
            <p>Sie müssen Ihr Passwort ändern, bevor Sie fortfahren können.</p>
          </div>
        ) : (
          <div className="content-header" style={{ marginBottom: '1.5rem' }}>
            <button className="btn btn-secondary" onClick={() => navigate(-1)} style={{ marginBottom: '1rem' }}>
              <ArrowLeft size={16} /> Zurück
            </button>
            <h1><Lock size={22} /> Passwort ändern</h1>
          </div>
        )}

        {error && (
          <div className="login-error" style={{ marginBottom: '1rem' }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className={forced ? 'login-form' : ''}>
          <div className="form-group">
            <label htmlFor="currentPassword">Aktuelles Passwort</label>
            <input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Aktuelles Passwort eingeben"
              autoComplete="current-password"
              autoFocus
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="newPassword">Neues Passwort</label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mind. 8 Zeichen, Buchstabe + Zahl + Sonderzeichen"
              autoComplete="new-password"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Neues Passwort bestätigen</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Neues Passwort wiederholen"
              autoComplete="new-password"
              disabled={loading}
            />
          </div>

          <div className="password-requirements" style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', margin: '0.5rem 0 1rem' }}>
            <p style={{ margin: '0.25rem 0' }}>
              {newPassword.length >= 8 ? <CheckCircle size={12} style={{ color: 'var(--color-success)' }} /> : '○'}{' '}
              Mindestens 8 Zeichen
            </p>
            <p style={{ margin: '0.25rem 0' }}>
              {/[a-zA-Z]/.test(newPassword) ? <CheckCircle size={12} style={{ color: 'var(--color-success)' }} /> : '○'}{' '}
              Enthält einen Buchstaben
            </p>
            <p style={{ margin: '0.25rem 0' }}>
              {/[0-9]/.test(newPassword) ? <CheckCircle size={12} style={{ color: 'var(--color-success)' }} /> : '○'}{' '}
              Enthält eine Zahl
            </p>
            <p style={{ margin: '0.25rem 0' }}>
              {/[^a-zA-Z0-9]/.test(newPassword) ? <CheckCircle size={12} style={{ color: 'var(--color-success)' }} /> : '○'}{' '}
              Enthält ein Sonderzeichen
            </p>
          </div>

          <button type="submit" className="btn btn-primary login-btn" disabled={loading}>
            <Lock size={18} />
            <span>{loading ? 'Wird geändert…' : 'Passwort ändern'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
