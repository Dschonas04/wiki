import { useState, type FormEvent } from 'react';
import { Settings as SettingsIcon, Palette, Lock, Tag, Trash2, AlertCircle, CheckCircle, User, Github, ExternalLink, Info } from 'lucide-react';
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
      showToast('Tags konnten nicht geladen werden', 'error');
    }
  };

  const handleDeleteTag = async () => {
    if (!deleteTagConfirm) return;
    try {
      await api.deleteTag(deleteTagConfirm.id);
      setTags(prev => prev.filter(t => t.id !== deleteTagConfirm.id));
      showToast(`Tag "${deleteTagConfirm.name}" gelöscht`, 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setDeleteTagConfirm(null);
    }
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPwError('');
    if (!currentPassword || !newPassword || !confirmPassword) { setPwError('Alle Felder sind erforderlich.'); return; }
    if (newPassword !== confirmPassword) { setPwError('Passwörter stimmen nicht überein.'); return; }
    if (newPassword.length < 8) { setPwError('Passwort muss mindestens 8 Zeichen lang sein.'); return; }
    if (!/[a-zA-Z]/.test(newPassword)) { setPwError('Passwort muss mindestens einen Buchstaben enthalten.'); return; }
    if (!/[0-9]/.test(newPassword)) { setPwError('Passwort muss mindestens eine Zahl enthalten.'); return; }
    if (!/[^a-zA-Z0-9]/.test(newPassword)) { setPwError('Passwort muss mindestens ein Sonderzeichen enthalten.'); return; }

    setPwLoading(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      showToast('Passwort erfolgreich geändert!', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await refreshUser();
    } catch (err: any) {
      setPwError(err.message || 'Passwort konnte nicht geändert werden');
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <>
      <PageHeader title="Einstellungen" />
      <div className="content-body">
        <div className="settings-grid">

          {/* ── Profile ── */}
          <section className="settings-card">
            <div className="settings-card-header">
              <User size={18} />
              <h2>Profil</h2>
            </div>
            <div className="settings-card-body">
              <div className="settings-profile-grid">
                <div className="settings-profile-avatar">{user?.username?.[0]?.toUpperCase() ?? '?'}</div>
                <div className="settings-profile-info">
                  <div className="settings-profile-row">
                    <span className="settings-label">Benutzername</span>
                    <span className="settings-value">{user?.username}</span>
                  </div>
                  <div className="settings-profile-row">
                    <span className="settings-label">Anzeigename</span>
                    <span className="settings-value">{user?.displayName || '—'}</span>
                  </div>
                  <div className="settings-profile-row">
                    <span className="settings-label">E-Mail</span>
                    <span className="settings-value">{user?.email || '—'}</span>
                  </div>
                  <div className="settings-profile-row">
                    <span className="settings-label">Rolle</span>
                    <span className={`settings-role-badge ${user?.globalRole}`}>{{ admin: 'Administrator', auditor: 'Auditor', user: 'Benutzer' }[user?.globalRole || 'user']}</span>
                  </div>
                  <div className="settings-profile-row">
                    <span className="settings-label">Authentifizierung</span>
                    <span className="settings-value">{user?.authSource === 'ldap' ? 'LDAP' : 'Lokal'}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── Appearance ── */}
          <section className="settings-card">
            <div className="settings-card-header">
              <Palette size={18} />
              <h2>Darstellung</h2>
            </div>
            <div className="settings-card-body">
              <p className="settings-desc">Wähle ein Farbschema für die Oberfläche.</p>
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
                <h2>Passwort ändern</h2>
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
                    <label htmlFor="currentPw">Aktuelles Passwort</label>
                    <input id="currentPw" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="Aktuelles Passwort eingeben" autoComplete="current-password" disabled={pwLoading} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="newPw">Neues Passwort</label>
                    <input id="newPw" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Mind. 8 Zeichen, Buchstabe + Zahl + Sonderzeichen" autoComplete="new-password" disabled={pwLoading} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="confirmPw">Neues Passwort bestätigen</label>
                    <input id="confirmPw" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Neues Passwort wiederholen" autoComplete="new-password" disabled={pwLoading} />
                  </div>
                  <div className="settings-pw-checks">
                    <span className={newPassword.length >= 8 ? 'check-ok' : ''}>{newPassword.length >= 8 ? <CheckCircle size={12} /> : '○'} 8+ Zeichen</span>
                    <span className={/[a-zA-Z]/.test(newPassword) ? 'check-ok' : ''}>{/[a-zA-Z]/.test(newPassword) ? <CheckCircle size={12} /> : '○'} Buchstabe</span>
                    <span className={/[0-9]/.test(newPassword) ? 'check-ok' : ''}>{/[0-9]/.test(newPassword) ? <CheckCircle size={12} /> : '○'} Zahl</span>
                    <span className={/[^a-zA-Z0-9]/.test(newPassword) ? 'check-ok' : ''}>{/[^a-zA-Z0-9]/.test(newPassword) ? <CheckCircle size={12} /> : '○'} Sonderzeichen</span>
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={pwLoading}>
                    <Lock size={16} />
                    <span>{pwLoading ? 'Wird geändert…' : 'Passwort ändern'}</span>
                  </button>
                </form>
              </div>
            </section>
          )}

          {isLdap && (
            <section className="settings-card">
              <div className="settings-card-header">
                <Lock size={18} />
                <h2>Passwort</h2>
              </div>
              <div className="settings-card-body">
                <p className="settings-desc">LDAP-Benutzer müssen ihr Passwort über den Verzeichnisdienst ändern.</p>
              </div>
            </section>
          )}

          {/* ── Tags Management ── */}
          <section className="settings-card">
            <div className="settings-card-header">
              <Tag size={18} />
              <h2>Meine Tags</h2>
            </div>
            <div className="settings-card-body">
              <p className="settings-desc">Verwalte deine Tags. Beim Löschen werden Tags von allen Seiten entfernt.</p>
              {!tagsLoaded ? (
                <button className="btn btn-secondary" onClick={loadTags}>
                  <Tag size={16} /> Tags laden
                </button>
              ) : tags.length === 0 ? (
                <p className="text-muted" style={{ fontSize: '0.85rem' }}>Noch keine Tags vorhanden.</p>
              ) : (
                <div className="settings-tags-list">
                  {tags.map(tag => (
                    <div key={tag.id} className="settings-tag-item">
                      <span className="tag-badge" style={{ '--tag-color': tag.color } as React.CSSProperties}>
                        {tag.name}
                      </span>
                      <span className="settings-tag-count">{tag.page_count ?? 0} Seiten</span>
                      <button className="icon-btn danger" title="Tag löschen" onClick={() => setDeleteTagConfirm(tag)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* ── Über Nexora ── */}
          <section className="settings-card">
            <div className="settings-card-header">
              <Info size={18} />
              <h2>Über Nexora</h2>
            </div>
            <div className="settings-card-body">
              <p className="settings-desc">Nexora ist ein modernes Wissensmanagement-System mit Team-Bereichen, Veröffentlichungs-Workflow und rollenbasierter Zugriffskontrolle.</p>
              <div className="settings-profile-grid" style={{ marginTop: '1rem' }}>
                <div className="settings-profile-info">
                  <div className="settings-profile-row">
                    <span className="settings-label">Version</span>
                    <span className="settings-value">1.0.0</span>
                  </div>
                  <div className="settings-profile-row">
                    <span className="settings-label">Quellcode</span>
                    <span className="settings-value">
                      <a href="https://github.com/Dschonas04/Nexora" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 500 }}>
                        <Github size={15} /> Dschonas04/Nexora <ExternalLink size={12} />
                      </a>
                    </span>
                  </div>
                  <div className="settings-profile-row">
                    <span className="settings-label">Lizenz</span>
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
          title="Tag löschen?"
          message={`"${deleteTagConfirm.name}" wird von allen Seiten entfernt.`}
          confirmLabel="Löschen"
          variant="danger"
          onConfirm={handleDeleteTag}
          onCancel={() => setDeleteTagConfirm(null)}
        />
      )}
    </>
  );
}
