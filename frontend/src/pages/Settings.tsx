import { useState, useEffect, type FormEvent } from 'react';
import { Settings as SettingsIcon, Palette, Lock, Tag, Trash2, AlertCircle, CheckCircle, User, Github, ExternalLink, Info, Globe, Mail, Database, Edit3, Save, Shield } from 'lucide-react';
import { api, type Tag as TagType } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import PageHeader from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';

export default function Settings() {
  const { user, refreshUser, isAdmin } = useAuth();
  const { showToast } = useToast();
  const { theme, setTheme, themes } = useTheme();
  const { t, language, setLanguage } = useLanguage();
  const isLdap = user?.authSource === 'ldap';

  // Profile editing
  const [editingName, setEditingName] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [savingName, setSavingName] = useState(false);

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

  // Admin settings
  const [adminSettings, setAdminSettings] = useState<Record<string, string>>({});
  const [adminLoaded, setAdminLoaded] = useState(false);
  const [adminSaving, setAdminSaving] = useState(false);
  const [emailTesting, setEmailTesting] = useState(false);
  const [backupRunning, setBackupRunning] = useState(false);

  const loadTags = async () => {
    if (tagsLoaded) return;
    try {
      const data = await api.getTags();
      setTags(data);
      setTagsLoaded(true);
    } catch {
      showToast(t('settings.tags_load_error'), 'error');
    }
  };

  // Load admin settings on mount if admin
  useEffect(() => {
    if (isAdmin && !adminLoaded) {
      api.getAdminSettings().then(data => {
        setAdminSettings(data);
        setAdminLoaded(true);
      }).catch(() => {});
    }
  }, [isAdmin]);

  const handleSaveDisplayName = async () => {
    if (!displayName.trim()) return;
    setSavingName(true);
    try {
      await api.updateProfile(displayName.trim());
      await refreshUser();
      setEditingName(false);
      showToast(t('settings.profile_updated'), 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSavingName(false);
    }
  };

  const handleSaveAdminSettings = async () => {
    setAdminSaving(true);
    try {
      await api.saveAdminSettings(adminSettings);
      showToast(t('settings.admin_saved'), 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setAdminSaving(false);
    }
  };

  const handleTestEmail = async () => {
    setEmailTesting(true);
    try {
      const result = await api.testEmail();
      if (result.success) {
        showToast(t('settings.email_test_ok'), 'success');
      } else {
        showToast(t('settings.email_test_fail') + ': ' + (result.error || ''), 'error');
      }
    } catch (err: any) {
      showToast(t('settings.email_test_fail') + ': ' + err.message, 'error');
    } finally {
      setEmailTesting(false);
    }
  };

  const handleBackup = async () => {
    setBackupRunning(true);
    try {
      const result = await api.triggerBackup();
      showToast(t('settings.backup_done') + ' (' + new Date(result.timestamp).toLocaleString() + ')', 'success');
      setAdminSettings(prev => ({ ...prev, 'backup.last_run': result.timestamp }));
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setBackupRunning(false);
    }
  };

  const updateAdminSetting = (key: string, value: string) => {
    setAdminSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleDeleteTag = async () => {
    if (!deleteTagConfirm) return;
    try {
      await api.deleteTag(deleteTagConfirm.id);
      setTags(prev => prev.filter(t => t.id !== deleteTagConfirm.id));
      showToast(t('settings.tag_deleted', { name: deleteTagConfirm.name }), 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setDeleteTagConfirm(null);
    }
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPwError('');
    if (!currentPassword || !newPassword || !confirmPassword) { setPwError(t('settings.pw_error_required')); return; }
    if (newPassword !== confirmPassword) { setPwError(t('settings.pw_error_mismatch')); return; }
    if (newPassword.length < 8) { setPwError(t('settings.pw_error_length')); return; }
    if (!/[a-zA-Z]/.test(newPassword)) { setPwError(t('settings.pw_error_letter')); return; }
    if (!/[0-9]/.test(newPassword)) { setPwError(t('settings.pw_error_number')); return; }
    if (!/[^a-zA-Z0-9]/.test(newPassword)) { setPwError(t('settings.pw_error_special')); return; }

    setPwLoading(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      showToast(t('settings.pw_success'), 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await refreshUser();
    } catch (err: any) {
      setPwError(err.message || t('settings.pw_error'));
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <>
      <PageHeader title={t('settings.title')} />
      <div className="content-body">
        <div className="settings-grid">

          {/* ── Profile ── */}
          <section className="settings-card">
            <div className="settings-card-header">
              <User size={18} />
              <h2>{t('settings.profile')}</h2>
            </div>
            <div className="settings-card-body">
              <div className="settings-profile-grid">
                <div className="settings-profile-avatar">{user?.username?.[0]?.toUpperCase() ?? '?'}</div>
                <div className="settings-profile-info">
                  <div className="settings-profile-row">
                    <span className="settings-label">{t('settings.label_username')}</span>
                    <span className="settings-value">{user?.username}</span>
                  </div>
                  <div className="settings-profile-row">
                    <span className="settings-label">{t('settings.label_displayname')}</span>
                    {editingName ? (
                      <span className="settings-value" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <input
                          type="text"
                          value={displayName}
                          onChange={e => setDisplayName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleSaveDisplayName(); if (e.key === 'Escape') setEditingName(false); }}
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem', width: '200px' }}
                          autoFocus
                          disabled={savingName}
                        />
                        <button className="icon-btn" title={t('common.save')} onClick={handleSaveDisplayName} disabled={savingName}>
                          <Save size={14} />
                        </button>
                      </span>
                    ) : (
                      <span className="settings-value" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        {user?.displayName || '—'}
                        <button className="icon-btn" title={t('settings.profile_edit_name')} onClick={() => { setDisplayName(user?.displayName || ''); setEditingName(true); }}>
                          <Edit3 size={14} />
                        </button>
                      </span>
                    )}
                  </div>
                  <div className="settings-profile-row">
                    <span className="settings-label">{t('settings.label_email')}</span>
                    <span className="settings-value">{user?.email || '—'}</span>
                  </div>
                  <div className="settings-profile-row">
                    <span className="settings-label">{t('settings.label_role')}</span>
                    <span className={`settings-role-badge ${user?.globalRole}`}>{t(`role.${user?.globalRole || 'user'}`)}</span>
                  </div>
                  <div className="settings-profile-row">
                    <span className="settings-label">{t('settings.label_auth')}</span>
                    <span className="settings-value">{user?.authSource === 'ldap' ? t('settings.auth_ldap') : t('settings.auth_local')}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── Appearance ── */}
          <section className="settings-card">
            <div className="settings-card-header">
              <Palette size={18} />
              <h2>{t('settings.appearance')}</h2>
            </div>
            <div className="settings-card-body">
              <p className="settings-desc">{t('settings.appearance_desc')}</p>
              <div className="settings-theme-grid">
                {themes.map(tm => (
                  <button
                    key={tm.id}
                    className={`settings-theme-option ${theme === tm.id ? 'active' : ''}`}
                    onClick={() => setTheme(tm.id)}
                  >
                    <span className="settings-theme-icon">{tm.icon}</span>
                    <span className="settings-theme-label">{tm.label}</span>
                    {theme === tm.id && <CheckCircle size={14} className="settings-theme-check" />}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* ── Language ── */}
          <section className="settings-card">
            <div className="settings-card-header">
              <Globe size={18} />
              <h2>{t('settings.language')}</h2>
            </div>
            <div className="settings-card-body">
              <p className="settings-desc">{t('settings.language_desc')}</p>
              <div className="settings-theme-grid">
                <button
                  className={`settings-theme-option ${language === 'de' ? 'active' : ''}`}
                  onClick={() => setLanguage('de')}
                >
                  <span className="settings-theme-icon">🇩🇪</span>
                  <span className="settings-theme-label">{t('settings.lang_de')}</span>
                  {language === 'de' && <CheckCircle size={14} className="settings-theme-check" />}
                </button>
                <button
                  className={`settings-theme-option ${language === 'en' ? 'active' : ''}`}
                  onClick={() => setLanguage('en')}
                >
                  <span className="settings-theme-icon">🇬🇧</span>
                  <span className="settings-theme-label">{t('settings.lang_en')}</span>
                  {language === 'en' && <CheckCircle size={14} className="settings-theme-check" />}
                </button>
              </div>
            </div>
          </section>

          {/* ── Password ── */}
          {!isLdap && (
            <section className="settings-card">
              <div className="settings-card-header">
                <Lock size={18} />
                <h2>{t('settings.password_title')}</h2>
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
                    <label htmlFor="currentPw">{t('settings.pw_current')}</label>
                    <input id="currentPw" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder={t('settings.pw_current_placeholder')} autoComplete="current-password" disabled={pwLoading} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="newPw">{t('settings.pw_new')}</label>
                    <input id="newPw" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder={t('settings.pw_new_placeholder')} autoComplete="new-password" disabled={pwLoading} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="confirmPw">{t('settings.pw_confirm')}</label>
                    <input id="confirmPw" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder={t('settings.pw_confirm_placeholder')} autoComplete="new-password" disabled={pwLoading} />
                  </div>
                  <div className="settings-pw-checks">
                    <span className={newPassword.length >= 8 ? 'check-ok' : ''}>{newPassword.length >= 8 ? <CheckCircle size={12} /> : '○'} {t('settings.pw_req_length')}</span>
                    <span className={/[a-zA-Z]/.test(newPassword) ? 'check-ok' : ''}>{/[a-zA-Z]/.test(newPassword) ? <CheckCircle size={12} /> : '○'} {t('settings.pw_req_letter')}</span>
                    <span className={/[0-9]/.test(newPassword) ? 'check-ok' : ''}>{/[0-9]/.test(newPassword) ? <CheckCircle size={12} /> : '○'} {t('settings.pw_req_number')}</span>
                    <span className={/[^a-zA-Z0-9]/.test(newPassword) ? 'check-ok' : ''}>{/[^a-zA-Z0-9]/.test(newPassword) ? <CheckCircle size={12} /> : '○'} {t('settings.pw_req_special')}</span>
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={pwLoading}>
                    <Lock size={16} />
                    <span>{pwLoading ? t('settings.pw_submitting') : t('settings.pw_submit')}</span>
                  </button>
                </form>
              </div>
            </section>
          )}

          {isLdap && (
            <section className="settings-card">
              <div className="settings-card-header">
                <Lock size={18} />
                <h2>{t('settings.password_ldap')}</h2>
              </div>
              <div className="settings-card-body">
                <p className="settings-desc">{t('settings.password_ldap_desc')}</p>
              </div>
            </section>
          )}

          {/* ── Tags Management ── */}
          <section className="settings-card">
            <div className="settings-card-header">
              <Tag size={18} />
              <h2>{t('settings.tags_title')}</h2>
            </div>
            <div className="settings-card-body">
              <p className="settings-desc">{t('settings.tags_desc')}</p>
              {!tagsLoaded ? (
                <button className="btn btn-secondary" onClick={loadTags}>
                  <Tag size={16} /> {t('settings.tags_load')}
                </button>
              ) : tags.length === 0 ? (
                <p className="text-muted" style={{ fontSize: '0.85rem' }}>{t('settings.tags_empty')}</p>
              ) : (
                <div className="settings-tags-list">
                  {tags.map(tag => (
                    <div key={tag.id} className="settings-tag-item">
                      <span className="tag-badge" style={{ '--tag-color': tag.color } as React.CSSProperties}>
                        {tag.name}
                      </span>
                      <span className="settings-tag-count">{t('settings.tag_page_count', { count: tag.page_count ?? 0 })}</span>
                      <button className="icon-btn danger" title={t('settings.tag_delete_btn')} onClick={() => setDeleteTagConfirm(tag)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* ── Admin: Email Notifications ── */}
          {isAdmin && (
            <section className="settings-card">
              <div className="settings-card-header">
                <Mail size={18} />
                <h2>{t('settings.admin_email_title')}</h2>
              </div>
              <div className="settings-card-body">
                <p className="settings-desc">{t('settings.admin_email_desc')}</p>
                <div className="settings-admin-form">
                  <div className="settings-admin-row">
                    <label>{t('settings.admin_email_enabled')}</label>
                    <select
                      value={adminSettings['email.enabled'] || 'false'}
                      onChange={e => updateAdminSetting('email.enabled', e.target.value)}
                    >
                      <option value="false">{t('common.inactive')}</option>
                      <option value="true">{t('common.active')}</option>
                    </select>
                  </div>
                  <div className="settings-admin-row">
                    <label>{t('settings.admin_email_host')}</label>
                    <input
                      type="text"
                      placeholder="smtp.example.com"
                      value={adminSettings['email.host'] || ''}
                      onChange={e => updateAdminSetting('email.host', e.target.value)}
                    />
                  </div>
                  <div className="settings-admin-row">
                    <label>{t('settings.admin_email_port')}</label>
                    <input
                      type="number"
                      placeholder="587"
                      value={adminSettings['email.port'] || ''}
                      onChange={e => updateAdminSetting('email.port', e.target.value)}
                    />
                  </div>
                  <div className="settings-admin-row">
                    <label>{t('settings.admin_email_secure')}</label>
                    <select
                      value={adminSettings['email.secure'] || 'false'}
                      onChange={e => updateAdminSetting('email.secure', e.target.value)}
                    >
                      <option value="false">STARTTLS (Port 587)</option>
                      <option value="true">SSL/TLS (Port 465)</option>
                    </select>
                  </div>
                  <div className="settings-admin-row">
                    <label>{t('settings.admin_email_user')}</label>
                    <input
                      type="text"
                      placeholder="user@example.com"
                      value={adminSettings['email.user'] || ''}
                      onChange={e => updateAdminSetting('email.user', e.target.value)}
                    />
                  </div>
                  <div className="settings-admin-row">
                    <label>{t('settings.admin_email_pass')}</label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={adminSettings['email.pass'] || ''}
                      onChange={e => updateAdminSetting('email.pass', e.target.value)}
                    />
                  </div>
                  <div className="settings-admin-row">
                    <label>{t('settings.admin_email_from')}</label>
                    <input
                      type="text"
                      placeholder="Nexora <noreply@example.com>"
                      value={adminSettings['email.from'] || ''}
                      onChange={e => updateAdminSetting('email.from', e.target.value)}
                    />
                  </div>
                  <div className="settings-admin-actions">
                    <button className="btn btn-primary" onClick={handleSaveAdminSettings} disabled={adminSaving}>
                      <Save size={16} />
                      <span>{adminSaving ? t('common.loading') : t('common.save')}</span>
                    </button>
                    <button className="btn btn-secondary" onClick={handleTestEmail} disabled={emailTesting || adminSettings['email.enabled'] !== 'true'}>
                      <Mail size={16} />
                      <span>{emailTesting ? t('common.loading') : t('settings.admin_email_test')}</span>
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ── Admin: Database Backup ── */}
          {isAdmin && (
            <section className="settings-card">
              <div className="settings-card-header">
                <Database size={18} />
                <h2>{t('settings.admin_backup_title')}</h2>
              </div>
              <div className="settings-card-body">
                <p className="settings-desc">{t('settings.admin_backup_desc')}</p>
                <div className="settings-admin-form">
                  <div className="settings-admin-row">
                    <label>{t('settings.admin_backup_enabled')}</label>
                    <select
                      value={adminSettings['backup.enabled'] || 'false'}
                      onChange={e => updateAdminSetting('backup.enabled', e.target.value)}
                    >
                      <option value="false">{t('common.inactive')}</option>
                      <option value="true">{t('common.active')}</option>
                    </select>
                  </div>
                  {adminSettings['backup.last_run'] && (
                    <div className="settings-admin-row">
                      <label>{t('settings.admin_backup_last')}</label>
                      <span className="settings-value">{new Date(adminSettings['backup.last_run']).toLocaleString()}</span>
                    </div>
                  )}
                  <div className="settings-admin-actions">
                    <button className="btn btn-primary" onClick={handleSaveAdminSettings} disabled={adminSaving}>
                      <Save size={16} />
                      <span>{adminSaving ? t('common.loading') : t('common.save')}</span>
                    </button>
                    <button className="btn btn-secondary" onClick={handleBackup} disabled={backupRunning || adminSettings['backup.enabled'] !== 'true'}>
                      <Database size={16} />
                      <span>{backupRunning ? t('common.loading') : t('settings.admin_backup_run')}</span>
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ── About Nexora ── */}
          <section className="settings-card">
            <div className="settings-card-header">
              <Info size={18} />
              <h2>{t('settings.about_title')}</h2>
            </div>
            <div className="settings-card-body">
              <p className="settings-desc">{t('settings.about_desc')}</p>
              <div className="settings-profile-grid" style={{ marginTop: '1rem' }}>
                <div className="settings-profile-info">
                  <div className="settings-profile-row">
                    <span className="settings-label">{t('settings.about_version')}</span>
                    <span className="settings-value">1.0.0</span>
                  </div>
                  <div className="settings-profile-row">
                    <span className="settings-label">{t('settings.about_source')}</span>
                    <span className="settings-value">
                      <a href="https://github.com/Dschonas04/Nexora" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 500 }}>
                        <Github size={15} /> Dschonas04/Nexora <ExternalLink size={12} />
                      </a>
                    </span>
                  </div>
                  <div className="settings-profile-row">
                    <span className="settings-label">{t('settings.about_license')}</span>
                    <span className="settings-value">MIT</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

        </div>
      </div>

      {deleteTagConfirm && (
        <ConfirmDialog
          title={t('settings.tag_delete_title')}
          message={t('settings.tag_delete_message', { name: deleteTagConfirm.name })}
          confirmLabel={t('common.delete')}
          variant="danger"
          onConfirm={handleDeleteTag}
          onCancel={() => setDeleteTagConfirm(null)}
        />
      )}
    </>
  );
}
