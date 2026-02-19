import { useState, type FormEvent } from 'react';
import { Lock, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';

export default function ChangePassword({ forced = false }: { forced?: boolean }) {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();
  const { t } = useLanguage();
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
      setError(t('changepw.error_required'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t('changepw.error_mismatch'));
      return;
    }

    if (newPassword.length < 8) {
      setError(t('changepw.error_length'));
      return;
    }

    if (!/[a-zA-Z]/.test(newPassword)) {
      setError(t('changepw.error_letter'));
      return;
    }

    if (!/[0-9]/.test(newPassword)) {
      setError(t('changepw.error_number'));
      return;
    }

    if (!/[^a-zA-Z0-9]/.test(newPassword)) {
      setError(t('changepw.error_special'));
      return;
    }

    setLoading(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      showToast(t('changepw.success'), 'success');
      await refreshUser();
      navigate('/');
    } catch (err: any) {
      setError(err.message || t('changepw.error_fallback'));
    } finally {
      setLoading(false);
    }
  };

  if (user?.authSource === 'ldap') {
    return (
      <div className="content-header">
        <h1>{t('changepw.title')}</h1>
        <p className="text-muted">{t('changepw.ldap_notice')}</p>
      </div>
    );
  }

  return (
    <div className={forced ? 'login-page' : ''}>
      <div className={forced ? 'login-card' : 'content-body'} style={forced ? {} : { maxWidth: 480 }}>
        {forced ? (
          <div className="login-header">
            <div className="login-logo"><img src="/logo.png" alt="Nexora" className="login-logo-img" /></div>
            <h1>{t('changepw.forced_title')}</h1>
            <p>{t('changepw.forced_desc')}</p>
          </div>
        ) : (
          <div className="content-header" style={{ marginBottom: '1.5rem' }}>
            <button className="btn btn-secondary" onClick={() => navigate(-1)} style={{ marginBottom: '1rem' }}>
              <ArrowLeft size={16} /> {t('common.back')}
            </button>
            <h1><Lock size={22} /> {t('changepw.title')}</h1>
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
            <label htmlFor="currentPassword">{t('changepw.label_current')}</label>
            <input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder={t('changepw.current_placeholder')}
              autoComplete="current-password"
              autoFocus
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="newPassword">{t('changepw.label_new')}</label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t('changepw.new_placeholder')}
              autoComplete="new-password"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">{t('changepw.label_confirm')}</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('changepw.confirm_placeholder')}
              autoComplete="new-password"
              disabled={loading}
            />
          </div>

          <div className="password-requirements" style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', margin: '0.5rem 0 1rem' }}>
            <p style={{ margin: '0.25rem 0' }}>
              {newPassword.length >= 8 ? <CheckCircle size={12} style={{ color: 'var(--color-success)' }} /> : '○'}{' '}
              {t('changepw.req_length')}
            </p>
            <p style={{ margin: '0.25rem 0' }}>
              {/[a-zA-Z]/.test(newPassword) ? <CheckCircle size={12} style={{ color: 'var(--color-success)' }} /> : '○'}{' '}
              {t('changepw.req_letter')}
            </p>
            <p style={{ margin: '0.25rem 0' }}>
              {/[0-9]/.test(newPassword) ? <CheckCircle size={12} style={{ color: 'var(--color-success)' }} /> : '○'}{' '}
              {t('changepw.req_number')}
            </p>
            <p style={{ margin: '0.25rem 0' }}>
              {/[^a-zA-Z0-9]/.test(newPassword) ? <CheckCircle size={12} style={{ color: 'var(--color-success)' }} /> : '○'}{' '}
              {t('changepw.req_special')}
            </p>
          </div>

          <button type="submit" className="btn btn-primary login-btn" disabled={loading}>
            <Lock size={18} />
            <span>{loading ? t('changepw.submitting') : t('changepw.submit')}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
