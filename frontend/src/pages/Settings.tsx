import { useState, type FormEvent } from 'react';
import { Settings as SettingsIcon, Palette, Lock, Tag, Trash2, AlertCircle, CheckCircle, User } from 'lucide-react';
import { api, type Tag as TagType } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useTheme } from '../hooks/useTheme';
import PageHeader from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';

export default function Settings() {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();
  const { theme, setTheme, themes } = useTheme();
  const isLdap = user?.authSource === 'ldap';

  // Password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');

  // Tags
  const [tags, setTags] = useState<TagType[]>([]);
  const [tagsLoaded, setTagsLoaded] = useState(false);
  const [deleteTagConfirm, setDeleteTagConfirm] = useState<TagType | null>(null);

  const loadTags = async () => {
    if (tagsLoaded) return;
    try {
      const data = await api.getTags();
      setTags(data);
      setTagsLoaded(true);
    } catch {
      showToast('Failed to load tags', 'error');
    }
  };

  const handleDeleteTag = async () => {
    if (!deleteTagConfirm) return;
    try {
      await api.deleteTag(deleteTagConfirm.id);
      setTags(prev => prev.filter(t => t.id !== deleteTagConfirm.id));
      showToast(`Tag "${deleteTagConfirm.name}" deleted`, 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setDeleteTagConfirm(null);
    }
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPwError('');
    if (!currentPassword || !newPassword || !confirmPassword) { setPwError('All fields are required.'); return; }
    if (newPassword !== confirmPassword) { setPwError('New passwords do not match.'); return; }
    if (newPassword.length < 8) { setPwError('Password must be at least 8 characters.'); return; }
    if (!/[a-zA-Z]/.test(newPassword)) { setPwError('Password must contain at least one letter.'); return; }
    if (!/[0-9]/.test(newPassword)) { setPwError('Password must contain at least one number.'); return; }
    if (!/[^a-zA-Z0-9]/.test(newPassword)) { setPwError('Password must contain at least one special character.'); return; }

    setPwLoading(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      showToast('Password changed successfully!', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await refreshUser();
    } catch (err: any) {
      setPwError(err.message || 'Failed to change password');
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <>
      <PageHeader title="Settings" />
      <div className="content-body">
        <div className="settings-grid">

          {/* ── Profile ── */}
          <section className="settings-card">
            <div className="settings-card-header">
              <User size={18} />
              <h2>Profile</h2>
            </div>
            <div className="settings-card-body">
              <div className="settings-profile-grid">
                <div className="settings-profile-avatar">{user?.username?.[0]?.toUpperCase() ?? '?'}</div>
                <div className="settings-profile-info">
                  <div className="settings-profile-row">
                    <span className="settings-label">Username</span>
                    <span className="settings-value">{user?.username}</span>
                  </div>
                  <div className="settings-profile-row">
                    <span className="settings-label">Display Name</span>
                    <span className="settings-value">{user?.displayName || '—'}</span>
                  </div>
                  <div className="settings-profile-row">
                    <span className="settings-label">Email</span>
                    <span className="settings-value">{user?.email || '—'}</span>
                  </div>
                  <div className="settings-profile-row">
                    <span className="settings-label">Role</span>
                    <span className={`settings-role-badge ${user?.role}`}>{user?.role}</span>
                  </div>
                  <div className="settings-profile-row">
                    <span className="settings-label">Auth</span>
                    <span className="settings-value">{user?.authSource === 'ldap' ? 'LDAP' : 'Local'}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── Appearance ── */}
          <section className="settings-card">
            <div className="settings-card-header">
              <Palette size={18} />
              <h2>Appearance</h2>
            </div>
            <div className="settings-card-body">
              <p className="settings-desc">Choose a theme for the interface.</p>
              <div className="settings-theme-grid">
                {themes.map(t => (
                  <button
                    key={t.id}
                    className={`settings-theme-option ${theme === t.id ? 'active' : ''}`}
                    onClick={() => setTheme(t.id)}
                  >
                    <span className="settings-theme-icon">{t.icon}</span>
                    <span className="settings-theme-label">{t.label}</span>
                    {theme === t.id && <CheckCircle size={14} className="settings-theme-check" />}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* ── Password ── */}
          {!isLdap && (
            <section className="settings-card">
              <div className="settings-card-header">
                <Lock size={18} />
                <h2>Change Password</h2>
              </div>
              <div className="settings-card-body">
                {pwError && (
                  <div className="settings-error">
                    <AlertCircle size={14} />
                    <span>{pwError}</span>
                  </div>
                )}
                <form onSubmit={handlePasswordSubmit} className="settings-pw-form">
                  <div className="form-group">
                    <label htmlFor="currentPw">Current Password</label>
                    <input id="currentPw" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="Enter current password" autoComplete="current-password" disabled={pwLoading} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="newPw">New Password</label>
                    <input id="newPw" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min. 8 chars, letter + number + special" autoComplete="new-password" disabled={pwLoading} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="confirmPw">Confirm New Password</label>
                    <input id="confirmPw" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repeat new password" autoComplete="new-password" disabled={pwLoading} />
                  </div>
                  <div className="settings-pw-checks">
                    <span className={newPassword.length >= 8 ? 'check-ok' : ''}>{newPassword.length >= 8 ? <CheckCircle size={12} /> : '○'} 8+ characters</span>
                    <span className={/[a-zA-Z]/.test(newPassword) ? 'check-ok' : ''}>{/[a-zA-Z]/.test(newPassword) ? <CheckCircle size={12} /> : '○'} Letter</span>
                    <span className={/[0-9]/.test(newPassword) ? 'check-ok' : ''}>{/[0-9]/.test(newPassword) ? <CheckCircle size={12} /> : '○'} Number</span>
                    <span className={/[^a-zA-Z0-9]/.test(newPassword) ? 'check-ok' : ''}>{/[^a-zA-Z0-9]/.test(newPassword) ? <CheckCircle size={12} /> : '○'} Special char</span>
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={pwLoading}>
                    <Lock size={16} />
                    <span>{pwLoading ? 'Changing…' : 'Change Password'}</span>
                  </button>
                </form>
              </div>
            </section>
          )}

          {isLdap && (
            <section className="settings-card">
              <div className="settings-card-header">
                <Lock size={18} />
                <h2>Password</h2>
              </div>
              <div className="settings-card-body">
                <p className="settings-desc">LDAP users must change their password through the directory service.</p>
              </div>
            </section>
          )}

          {/* ── Tags Management ── */}
          <section className="settings-card">
            <div className="settings-card-header">
              <Tag size={18} />
              <h2>My Tags</h2>
            </div>
            <div className="settings-card-body">
              <p className="settings-desc">Manage your personal tags. Tags assigned to pages will be unlinked when deleted.</p>
              {!tagsLoaded ? (
                <button className="btn btn-secondary" onClick={loadTags}>
                  <Tag size={16} /> Load Tags
                </button>
              ) : tags.length === 0 ? (
                <p className="text-muted" style={{ fontSize: '0.85rem' }}>No tags yet.</p>
              ) : (
                <div className="settings-tags-list">
                  {tags.map(tag => (
                    <div key={tag.id} className="settings-tag-item">
                      <span className="tag-badge" style={{ '--tag-color': tag.color } as React.CSSProperties}>
                        {tag.name}
                      </span>
                      <span className="settings-tag-count">{tag.page_count ?? 0} pages</span>
                      <button className="icon-btn danger" title="Delete tag" onClick={() => setDeleteTagConfirm(tag)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

        </div>
      </div>

      {deleteTagConfirm && (
        <ConfirmDialog
          title="Delete Tag?"
          message={`"${deleteTagConfirm.name}" will be removed from all pages.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={handleDeleteTag}
          onCancel={() => setDeleteTagConfirm(null)}
        />
      )}
    </>
  );
}
