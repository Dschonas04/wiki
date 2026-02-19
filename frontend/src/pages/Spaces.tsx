/**
 * Spaces.tsx – Team-Bereiche Übersicht
 *
 * Zeigt alle Team-Bereiche der Organisation an.
 * Administratoren können neue Bereiche erstellen.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Layers, Plus, Users, FileText, ChevronRight, FolderOpen } from 'lucide-react';
import { api, type TeamSpace } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';

export default function Spaces() {
  const [spaces, setSpaces] = useState<TeamSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const { isAdmin } = useAuth();
  const { showToast } = useToast();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const data = await api.getSpaces();
      setSpaces(data);
    } catch (err: any) {
      showToast(err.message || t('spaces.load_error'), 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const space = await api.createSpace({ name: newName.trim(), description: newDesc.trim() });
      showToast(t('spaces.created_toast', { name: space.name }), 'success');
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
      navigate(`/spaces/${space.id}`);
    } catch (err: any) {
      showToast(err.message || t('spaces.create_error'), 'error');
    }
  };

  if (loading) return <div className="content-body"><div className="loading-spinner" /></div>;

  return (
    <>
      <PageHeader
        title={t('spaces.title')}
        subtitle={t('spaces.subtitle')}
        icon={<Layers size={28} />}
        actions={
          isAdmin ? (
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              <Plus size={16} /> {t('spaces.new_space')}
            </button>
          ) : undefined
        }
      />

      <div className="content-body">
        {/* Erstellen-Dialog */}
        {showCreate && (
          <div className="card spaces-create-card">
            <form onSubmit={handleCreate}>
              <h3>{t('spaces.create_heading')}</h3>
              <div className="form-group">
                <label>{t('spaces.label_name')}</label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder={t('spaces.name_placeholder')}
                  autoFocus
                  required
                />
              </div>
              <div className="form-group">
                <label>{t('spaces.label_desc')}</label>
                <textarea
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  placeholder={t('spaces.desc_placeholder')}
                  rows={2}
                />
              </div>
              <div className="btn-row">
                <button type="submit" className="btn btn-primary">{t('common.create')}</button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>{t('common.cancel')}</button>
              </div>
            </form>
          </div>
        )}

        {/* Bereichsliste */}
        {spaces.length === 0 ? (
          <EmptyState
            icon={<Layers size={48} />}
            title={t('spaces.empty_title')}
            description={t('spaces.empty_desc')}
            action={isAdmin ? (
              <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
                <Plus size={16} /> {t('spaces.new_space')}
              </button>
            ) : undefined}
          />
        ) : (
          <div className="spaces-grid">
            {spaces.map((space, i) => (
              <Link
                key={space.id}
                to={`/spaces/${space.id}`}
                className="space-card"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <div className="space-card-icon">
                  {space.icon || <Layers size={22} />}
                </div>
                <div className="space-card-body">
                  <div className="space-card-title">
                    <span>{space.name}</span>
                    <ChevronRight size={16} className="space-card-arrow" />
                  </div>
                  {space.description && (
                    <p className="space-card-desc">{space.description}</p>
                  )}
                  <div className="space-card-meta">
                    <span><FileText size={13} /> {t('spaces.page_count', { count: space.page_count || 0 })}</span>
                    <span><Users size={13} /> {t('spaces.member_count', { count: space.member_count || 0 })}</span>
                    {space.my_role && (
                      <span className="space-card-role">
                        {space.my_role === 'owner' ? t('role.owner') : space.my_role === 'editor' ? t('role.editor') : space.my_role === 'reviewer' ? t('role.reviewer') : t('role.viewer')}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
