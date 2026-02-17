/**
 * Spaces.tsx – Team-Bereiche Übersicht
 *
 * Zeigt alle Team-Bereiche der Organisation an.
 * Administratoren können neue Bereiche erstellen.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Layers, Plus, Users, FileText, ChevronRight } from 'lucide-react';
import { api, type TeamSpace } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';

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
    <div className="content-body">
      <div className="page-header">
        <div>
          <h1><Layers size={28} /> {t('spaces.title')}</h1>
          <p className="page-subtitle">{t('spaces.subtitle')}</p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> {t('spaces.new_space')}
          </button>
        )}
      </div>

      {/* Erstellen-Dialog */}
      {showCreate && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
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
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" className="btn btn-primary">{t('common.create')}</button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>{t('common.cancel')}</button>
            </div>
          </form>
        </div>
      )}

      {/* Bereichsliste */}
      {spaces.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <Layers size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
          <h3>{t('spaces.empty_title')}</h3>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {t('spaces.empty_desc')}
          </p>
        </div>
      ) : (
        <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
          {spaces.map(space => (
            <Link key={space.id} to={`/spaces/${space.id}`} className="card card-hover" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ margin: '0 0 0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Layers size={18} />
                    {space.name}
                  </h3>
                  {space.description && (
                    <p style={{ margin: '0 0 0.75rem', color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                      {space.description}
                    </p>
                  )}
                </div>
                <ChevronRight size={18} style={{ opacity: 0.4, flexShrink: 0 }} />
              </div>
              <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <FileText size={13} /> {t('spaces.page_count', { count: space.page_count || 0 })}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <Users size={13} /> {t('spaces.member_count', { count: space.member_count || 0 })}
                </span>
              </div>
              {space.my_role && (
                <div style={{ marginTop: '0.5rem' }}>
                  <span className="badge badge-info" style={{ fontSize: '0.75rem' }}>
                    {space.my_role === 'owner' ? t('role.owner') : space.my_role === 'editor' ? t('role.editor') : space.my_role === 'reviewer' ? t('role.reviewer') : t('role.viewer')}
                  </span>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
