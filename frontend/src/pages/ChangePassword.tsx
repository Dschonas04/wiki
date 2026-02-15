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
      setError('All fields are required.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (!/[a-zA-Z]/.test(newPassword)) {
      setError('Password must contain at least one letter.');
      return;
    }

    if (!/[0-9]/.test(newPassword)) {
      setError('Password must contain at least one number.');
      return;
    }

    if (!/[^a-zA-Z0-9]/.test(newPassword)) {
      setError('Password must contain at least one special character.');
      return;
    }

    setLoading(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      showToast('Password changed successfully!', 'success');
      await refreshUser();
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  if (user?.authSource === 'ldap') {
    return (
      <div className="content-header">
        <h1>Change Password</h1>
        <p className="text-muted">LDAP users must change their password through the directory service.</p>
      </div>
    );
  }

  return (
    <div className={forced ? 'login-page' : ''}>
      <div className={forced ? 'login-card' : 'content-body'} style={forced ? {} : { maxWidth: 480 }}>
        {forced ? (
          <div className="login-header">
            <div className="login-logo"><Lock size={32} /></div>
            <h1>Password Change Required</h1>
            <p>You must change your password before continuing.</p>
          </div>
        ) : (
          <div className="content-header" style={{ marginBottom: '1.5rem' }}>
            <button className="btn btn-secondary" onClick={() => navigate(-1)} style={{ marginBottom: '1rem' }}>
              <ArrowLeft size={16} /> Back
            </button>
            <h1><Lock size={22} /> Change Password</h1>
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
            <label htmlFor="currentPassword">Current Password</label>
            <input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              autoComplete="current-password"
              autoFocus
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="newPassword">New Password</label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min. 8 chars, letter + number + special"
              autoComplete="new-password"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm New Password</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat new password"
              autoComplete="new-password"
              disabled={loading}
            />
          </div>

          <div className="password-requirements" style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', margin: '0.5rem 0 1rem' }}>
            <p style={{ margin: '0.25rem 0' }}>
              {newPassword.length >= 8 ? <CheckCircle size={12} style={{ color: 'var(--color-success)' }} /> : '○'}{' '}
              At least 8 characters
            </p>
            <p style={{ margin: '0.25rem 0' }}>
              {/[a-zA-Z]/.test(newPassword) ? <CheckCircle size={12} style={{ color: 'var(--color-success)' }} /> : '○'}{' '}
              Contains a letter
            </p>
            <p style={{ margin: '0.25rem 0' }}>
              {/[0-9]/.test(newPassword) ? <CheckCircle size={12} style={{ color: 'var(--color-success)' }} /> : '○'}{' '}
              Contains a number
            </p>
            <p style={{ margin: '0.25rem 0' }}>
              {/[^a-zA-Z0-9]/.test(newPassword) ? <CheckCircle size={12} style={{ color: 'var(--color-success)' }} /> : '○'}{' '}
              Contains a special character
            </p>
          </div>

          <button type="submit" className="btn btn-primary login-btn" disabled={loading}>
            <Lock size={18} />
            <span>{loading ? 'Changing…' : 'Change Password'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
