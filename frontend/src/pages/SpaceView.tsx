/**
 * SpaceView.tsx – Einzelansicht eines Team-Bereichs
 *
 * Zeigt Ordner, Seiten und Mitglieder eines Bereichs an.
 * Owner/Admins können Ordner erstellen und Mitglieder verwalten.
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Layers, FolderOpen, FileText, Plus, Users, ChevronRight, ArrowLeft,
  Settings, FolderPlus, UserPlus, Trash2,
} from 'lucide-react';
import { api, type TeamSpace, type Folder, type WikiPage, type SpaceMembership, type UserBasic } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';

export default function SpaceView() {
  const { id } = useParams<{ id: string }>();
  const spaceId = parseInt(id || '0');
  const [space, setSpace] = useState<(TeamSpace & { folders: Folder[]; pages: WikiPage[] }) | null>(null);
  const [members, setMembers] = useState<SpaceMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'pages' | 'members'>('pages');
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showAddMember, setShowAddMember] = useState(false);
  const [allUsers, setAllUsers] = useState<UserBasic[]>([]);
  const [selectedUserId, setSelectedUserId] = useState(0);
  const [selectedRole, setSelectedRole] = useState<'editor' | 'reviewer' | 'viewer'>('viewer');
  const { isAdmin, user } = useAuth();
  const { showToast } = useToast();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const isOwnerOrAdmin = isAdmin || space?.my_role === 'owner';
  const canWrite = isAdmin || space?.my_role === 'owner' || space?.my_role === 'editor';

  const load = useCallback(async () => {
    try {
      const [spaceData, membersData] = await Promise.all([
        api.getSpace(spaceId),
        api.getSpaceMembers(spaceId),
      ]);
      setSpace(spaceData);
      setMembers(membersData);
    } catch (err: any) {
      showToast(err.message || t('spaceview.load_error'), 'error');
    } finally {
      setLoading(false);
    }
  }, [spaceId, showToast]);

  useEffect(() => { load(); }, [load]);

  // Ordner erstellen
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      await api.createFolder(spaceId, { name: newFolderName.trim() });
      showToast(t('spaceview.folder_created'), 'success');
      setShowCreateFolder(false);
      setNewFolderName('');
      load();
    } catch (err: any) {
      showToast(err.message || 'Fehler', 'error');
    }
  };

  // Mitglied hinzufügen
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;
    try {
      const updated = await api.addSpaceMember(spaceId, selectedUserId, selectedRole);
      setMembers(updated);
      showToast(t('spaceview.member_added'), 'success');
      setShowAddMember(false);
      setSelectedUserId(0);
    } catch (err: any) {
      showToast(err.message || 'Fehler', 'error');
    }
  };

  // Mitglied entfernen
  const handleRemoveMember = async (userId: number) => {
    if (!confirm(t('spaceview.remove_confirm'))) return;
    try {
      await api.removeSpaceMember(spaceId, userId);
      setMembers(prev => prev.filter(m => m.user_id !== userId));
      showToast(t('spaceview.member_removed'), 'success');
    } catch (err: any) {
      showToast(err.message || 'Fehler', 'error');
    }
  };

  const openAddMember = async () => {
    try {
      const users = await api.getUsersBasic();
      setAllUsers(users.filter(u => !members.some(m => m.user_id === u.id)));
    } catch {}
    setShowAddMember(true);
  };

  // Workflow-Status Labels
  const statusLabel = (status?: string) => {
    const labels: Record<string, string> = {
      draft: t('workflow.draft'), in_review: t('workflow.in_review'), changes_requested: t('workflow.changes_requested'),
      approved: t('workflow.approved'), published: t('workflow.published'), archived: t('workflow.archived'),
    };
    return labels[status || ''] || status || '';
  };

  const statusColor = (status?: string) => {
    const colors: Record<string, string> = {
      draft: '#6b7280', in_review: '#f59e0b', changes_requested: '#ef4444',
      approved: '#10b981', published: '#3b82f6', archived: '#9ca3af',
    };
    return colors[status || ''] || '#6b7280';
  };

  if (loading) return <div className="content-body"><div className="loading-spinner" /></div>;
  if (!space) return <div className="content-body"><p>{t('spaceview.not_found')}</p></div>;

  // Seiten nach Ordnern gruppieren
  const rootPages = space.pages.filter(p => !p.folder_id);
  const folders = space.folders || [];

  return (
    <div className="content-body">
      {/* Header */}
      <div className="page-header">
        <div>
          <Link to="/spaces" style={{ color: 'var(--color-text-secondary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
            <ArrowLeft size={14} /> {t('spaceview.back')}
          </Link>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Layers size={28} /> {space.name}
          </h1>
          {space.description && <p className="page-subtitle">{space.description}</p>}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {canWrite && (
            <>
              <button className="btn btn-secondary" onClick={() => setShowCreateFolder(true)}>
                <FolderPlus size={16} /> {t('spaceview.folder_btn')}
              </button>
              <button className="btn btn-primary" onClick={() => navigate(`/pages/new?spaceId=${spaceId}`)}>
                <Plus size={16} /> {t('spaceview.new_page')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '2px solid var(--color-border)', marginBottom: '1.5rem' }}>
        <button
          onClick={() => setTab('pages')}
          style={{ padding: '0.75rem 1.25rem', border: 'none', background: 'none', cursor: 'pointer', fontWeight: tab === 'pages' ? 600 : 400, borderBottom: tab === 'pages' ? '2px solid var(--color-primary)' : '2px solid transparent', marginBottom: '-2px', color: tab === 'pages' ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}
        >
          <FileText size={16} style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} /> {t('spaceview.tab_content')}
        </button>
        <button
          onClick={() => setTab('members')}
          style={{ padding: '0.75rem 1.25rem', border: 'none', background: 'none', cursor: 'pointer', fontWeight: tab === 'members' ? 600 : 400, borderBottom: tab === 'members' ? '2px solid var(--color-primary)' : '2px solid transparent', marginBottom: '-2px', color: tab === 'members' ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}
        >
          <Users size={16} style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} /> {t('spaceview.tab_members', { count: members.length })}
        </button>
      </div>

      {/* Ordner-Erstellung */}
      {showCreateFolder && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <form onSubmit={handleCreateFolder} style={{ display: 'flex', gap: '0.5rem', alignItems: 'end' }}>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label>{t('spaceview.folder_name')}</label>
              <input type="text" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder={t('spaceview.folder_placeholder')} autoFocus required />
            </div>
            <button type="submit" className="btn btn-primary">{t('common.create')}</button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowCreateFolder(false)}>{t('common.cancel')}</button>
          </form>
        </div>
      )}

      {/* Inhalte-Tab */}
      {tab === 'pages' && (
        <>
          {/* Ordner */}
          {folders.map(folder => {
            const folderPages = space.pages.filter(p => p.folder_id === folder.id);
            return (
              <div key={folder.id} className="card" style={{ marginBottom: '1rem' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 0.75rem' }}>
                  <FolderOpen size={18} /> {folder.name}
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 400 }}>
                    {t('spaceview.folder_pages', { count: folderPages.length })}
                  </span>
                </h3>
                {folderPages.length === 0 ? (
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>{t('spaceview.folder_empty')}</p>
                ) : (
                  folderPages.map(page => (
                    <Link key={page.id} to={`/pages/${page.id}`} className="list-item" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--color-border)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <FileText size={14} /> {page.title}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: statusColor(page.workflow_status), fontWeight: 500 }}>
                        {statusLabel(page.workflow_status)}
                      </span>
                    </Link>
                  ))
                )}
              </div>
            );
          })}

          {/* Seiten ohne Ordner */}
          {rootPages.length > 0 && (
            <div className="card">
              <h3 style={{ margin: '0 0 0.75rem' }}>
                {folders.length > 0 ? t('spaceview.section_more') : t('spaceview.section_pages')}
              </h3>
              {rootPages.map(page => (
                <Link key={page.id} to={`/pages/${page.id}`} className="list-item" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--color-border)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <FileText size={14} /> {page.title}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: statusColor(page.workflow_status), fontWeight: 500 }}>
                    {statusLabel(page.workflow_status)}
                  </span>
                </Link>
              ))}
            </div>
          )}

          {space.pages.length === 0 && folders.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
              <FileText size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
              <h3>{t('spaceview.empty_title')}</h3>
              <p style={{ color: 'var(--color-text-secondary)' }}>{t('spaceview.empty_desc')}</p>
            </div>
          )}
        </>
      )}

      {/* Mitglieder-Tab */}
      {tab === 'members' && (
        <div className="card">
          {isOwnerOrAdmin && (
            <div style={{ marginBottom: '1rem' }}>
              <button className="btn btn-primary" onClick={openAddMember}>
                <UserPlus size={16} /> {t('spaceview.add_member')}
              </button>
            </div>
          )}

          {showAddMember && (
            <form onSubmit={handleAddMember} className="card" style={{ marginBottom: '1rem', background: 'var(--color-bg-secondary, var(--color-surface))' }}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'end' }}>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label>{t('spaceview.label_user')}</label>
                  <select value={selectedUserId} onChange={e => setSelectedUserId(parseInt(e.target.value))}>
                    <option value={0}>{t('spaceview.user_placeholder')}</option>
                    {allUsers.map(u => <option key={u.id} value={u.id}>{u.displayName} ({u.username})</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ width: '180px', marginBottom: 0 }}>
                  <label>{t('spaceview.label_role')}</label>
                  <select value={selectedRole} onChange={e => setSelectedRole(e.target.value as any)}>
                    <option value="viewer">{t('role.viewer')}</option>
                    <option value="reviewer">{t('role.reviewer')}</option>
                    <option value="editor">{t('role.editor')}</option>
                    <option value="owner">{t('role.owner')}</option>
                  </select>
                </div>
                <button type="submit" className="btn btn-primary" disabled={!selectedUserId}>{t('common.add')}</button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddMember(false)}>{t('common.cancel')}</button>
              </div>
            </form>
          )}

          <table className="table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>{t('spaceview.th_user')}</th>
                <th>{t('spaceview.th_role')}</th>
                <th>{t('spaceview.th_global_role')}</th>
                {isOwnerOrAdmin && <th style={{ width: '80px' }}>{t('spaceview.th_action')}</th>}
              </tr>
            </thead>
            <tbody>
              {members.map(m => {
                const roleLabels: Record<string, string> = { owner: t('role.owner'), editor: t('role.editor'), reviewer: t('role.reviewer'), viewer: t('role.viewer') };
                return (
                  <tr key={m.user_id}>
                    <td>
                      <strong>{m.display_name}</strong>
                      <span style={{ color: 'var(--color-text-secondary)', marginLeft: '0.5rem', fontSize: '0.8125rem' }}>@{m.username}</span>
                    </td>
                    <td><span className="badge">{roleLabels[m.role] || m.role}</span></td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>{m.global_role}</td>
                    {isOwnerOrAdmin && (
                      <td>
                        {m.user_id !== user?.id && (
                          <button className="btn btn-sm btn-danger" onClick={() => handleRemoveMember(m.user_id)} title={t('spaceview.remove_member')}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
