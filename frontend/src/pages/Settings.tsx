import { useState, type FormEvent } from 'react';
import { Settings as SettingsIcon, Palette, Lock, Tag, Trash2, AlertCircle, CheckCircle, User, Github, ExternalLink, Info, Globe } from 'lucide-react';
import { api, type Tag as TagType } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import PageHeader from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';

export default function Settings() {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();
  const { theme, setTheme, themes } = useTheme();
  const { t, language, setLanguage } = useLanguage();
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
      showToast(t('settings.tags_load_error'), 'error');
    }
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
                    <span className="settings-value">{user?.displayName || '—'}</span>
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
