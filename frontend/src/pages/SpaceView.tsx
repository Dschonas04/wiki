/**
 * SpaceView.tsx – Einzelansicht eines Team-Bereichs
 *
 * Zeigt Ordner (hierarchisch), Seiten und Mitglieder eines Bereichs an.
 * Owner/Admins können Ordner erstellen, umbenennen, löschen und Mitglieder verwalten.
 * Seiten können direkt in Ordnern angelegt werden.
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Layers, FolderOpen, FileText, Plus, Users, ChevronRight, ArrowLeft,
  FolderPlus, UserPlus, Trash2, Pencil, MoreHorizontal,
  Folder as FolderIcon,
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

  // Folder creation state
  const [showCreateFolder, setShowCreateFolder] = useState<number | null>(null); // null = hidden, 0 = root, folderId = subfolder
  const [newFolderName, setNewFolderName] = useState('');

  // Folder edit state
  const [editingFolderId, setEditingFolderId] = useState<number | null>(null);
  const [editFolderName, setEditFolderName] = useState('');

  // Expanded folders state
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());

  // Folder context menu
  const [folderMenu, setFolderMenu] = useState<number | null>(null);

  // Member management
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
      // Auto-expand all root folders
      const rootIds = new Set((spaceData.folders || []).filter((f: Folder) => !f.parent_folder_id).map((f: Folder) => f.id));
      setExpandedFolders(prev => new Set([...prev, ...rootIds]));
    } catch (err: any) {
      showToast(err.message || t('spaceview.load_error'), 'error');
    } finally {
      setLoading(false);
    }
  }, [spaceId, showToast, t]);

  useEffect(() => { load(); }, [load]);

  // Close folder menu on outside click
  useEffect(() => {
    if (folderMenu === null) return;
    const handler = () => setFolderMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [folderMenu]);

  // Build folder tree from flat list
  const buildFolderTree = (folders: Folder[]): Folder[] => {
    const rootFolders = folders.filter(f => !f.parent_folder_id);
    const childMap = new Map<number, Folder[]>();
    folders.filter(f => f.parent_folder_id).forEach(f => {
      const arr = childMap.get(f.parent_folder_id!) || [];
      arr.push(f);
      childMap.set(f.parent_folder_id!, arr);
    });
    rootFolders.forEach(f => { f.children = childMap.get(f.id) || []; });
    return rootFolders;
  };

  const toggleFolder = (folderId: number) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId); else next.add(folderId);
      return next;
    });
  };

  // Ordner erstellen
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      const parentFolderId = showCreateFolder && showCreateFolder > 0 ? showCreateFolder : undefined;
      await api.createFolder(spaceId, { name: newFolderName.trim(), parentFolderId });
      showToast(t('spaceview.folder_created'), 'success');
      setShowCreateFolder(null);
      setNewFolderName('');
      load();
    } catch (err: any) {
      showToast(err.message || 'Fehler', 'error');
    }
  };

  // Ordner umbenennen
  const handleRenameFolder = async (folderId: number) => {
    if (!editFolderName.trim()) return;
    try {
      await api.updateFolder(folderId, { name: editFolderName.trim() });
      showToast('Ordner umbenannt', 'success');
      setEditingFolderId(null);
      setEditFolderName('');
      load();
    } catch (err: any) {
      showToast(err.message || 'Fehler', 'error');
    }
  };

  // Ordner löschen
  const handleDeleteFolder = async (folderId: number) => {
    if (!confirm('Ordner wirklich löschen? (Nur leere Ordner können gelöscht werden)')) return;
    try {
      await api.deleteFolder(folderId);
      showToast('Ordner gelöscht', 'success');
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
      setAllUsers(users.filter((u: UserBasic) => !members.some(m => m.user_id === u.id)));
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
  const folderTree = buildFolderTree(space.folders || []);

  // Render folder item recursively
  const renderFolder = (folder: Folder, depth: number = 0) => {
    const folderPages = space!.pages.filter(p => p.folder_id === folder.id);
    const subfolders = folder.children || [];
    const isExpanded = expandedFolders.has(folder.id);
    const hasContent = folderPages.length > 0 || subfolders.length > 0;
    const isEditing = editingFolderId === folder.id;
    const isCreatingSubfolder = showCreateFolder === folder.id;

    return (
      <div key={folder.id} className="sv-folder" style={{ marginLeft: depth > 0 ? '20px' : 0 }}>
        {/* Folder header */}
        <div className="sv-folder-header">
          <button className="sv-folder-toggle" onClick={() => toggleFolder(folder.id)}>
            <ChevronRight size={14} className={`sv-chevron ${isExpanded ? 'expanded' : ''}`} />
            <FolderOpen size={16} className="sv-folder-icon" />
            {isEditing ? (
              <form onSubmit={(e) => { e.preventDefault(); handleRenameFolder(folder.id); }} className="sv-inline-edit" onClick={e => e.stopPropagation()}>
                <input
                  type="text"
                  value={editFolderName}
                  onChange={e => setEditFolderName(e.target.value)}
                  autoFocus
                  onBlur={() => { if (editFolderName.trim()) handleRenameFolder(folder.id); else setEditingFolderId(null); }}
                  onKeyDown={e => e.key === 'Escape' && setEditingFolderId(null)}
                />
              </form>
            ) : (
              <span className="sv-folder-name">{folder.name}</span>
            )}
            <span className="sv-folder-count">{folderPages.length}</span>
          </button>

          {canWrite && !isEditing && (
            <div className="sv-folder-actions">
              {/* New page in this folder */}
              <button
                className="sv-action-btn"
                title="Neue Seite in diesem Ordner"
                onClick={() => navigate(`/pages/new?spaceId=${spaceId}&folderId=${folder.id}`)}
              >
                <Plus size={14} />
              </button>
              {/* Subfolder (only if depth < 2) */}
              {folder.depth < 2 && (
                <button
                  className="sv-action-btn"
                  title="Unterordner erstellen"
                  onClick={() => { setShowCreateFolder(folder.id); setNewFolderName(''); setExpandedFolders(prev => new Set([...prev, folder.id])); }}
                >
                  <FolderPlus size={14} />
                </button>
              )}
              {/* More menu */}
              <div className="sv-action-menu-wrapper">
                <button
                  className="sv-action-btn"
                  onClick={(e) => { e.stopPropagation(); setFolderMenu(folderMenu === folder.id ? null : folder.id); }}
                >
                  <MoreHorizontal size={14} />
                </button>
                {folderMenu === folder.id && (
                  <div className="sv-context-menu">
                    <button onClick={() => { setEditingFolderId(folder.id); setEditFolderName(folder.name); setFolderMenu(null); }}>
                      <Pencil size={13} /> Umbenennen
                    </button>
                    <button className="danger" onClick={() => { handleDeleteFolder(folder.id); setFolderMenu(null); }}>
                      <Trash2 size={13} /> Löschen
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Expanded folder content */}
        {isExpanded && (
          <div className="sv-folder-content">
            {/* Subfolder creation form */}
            {isCreatingSubfolder && (
              <form onSubmit={handleCreateFolder} className="sv-create-folder-inline">
                <FolderIcon size={14} />
                <input
                  type="text"
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  placeholder="Unterordnername..."
                  autoFocus
                  onKeyDown={e => e.key === 'Escape' && setShowCreateFolder(null)}
                />
                <button type="submit" className="btn btn-sm btn-primary">{t('common.create')}</button>
                <button type="button" className="btn btn-sm btn-secondary" onClick={() => setShowCreateFolder(null)}>{t('common.cancel')}</button>
              </form>
            )}

            {/* Subfolders */}
            {subfolders.map(sub => renderFolder(sub, depth + 1))}

            {/* Pages in this folder */}
            {folderPages.map(page => (
              <Link key={page.id} to={`/pages/${page.id}`} className="sv-page-item">
                <FileText size={14} />
                <span className="sv-page-title">{page.title}</span>
                <span className="sv-page-status" style={{ color: statusColor(page.workflow_status) }}>
                  {statusLabel(page.workflow_status)}
                </span>
              </Link>
            ))}

            {/* Empty state */}
            {!hasContent && !isCreatingSubfolder && (
              <div className="sv-folder-empty">
                {t('spaceview.folder_empty')}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="content-body">
      {/* Header */}
      <div className="page-header">
        <div>
          <Link to="/spaces" className="sv-back-link">
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
              <button className="btn btn-secondary" onClick={() => { setShowCreateFolder(0); setNewFolderName(''); }}>
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
      <div className="sv-tabs">
        <button
          onClick={() => setTab('pages')}
          className={`sv-tab ${tab === 'pages' ? 'active' : ''}`}
        >
          <FileText size={16} /> {t('spaceview.tab_content')}
        </button>
        <button
          onClick={() => setTab('members')}
          className={`sv-tab ${tab === 'members' ? 'active' : ''}`}
        >
          <Users size={16} /> {t('spaceview.tab_members', { count: members.length })}
        </button>
      </div>

      {/* Root folder creation form */}
      {showCreateFolder === 0 && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <form onSubmit={handleCreateFolder} style={{ display: 'flex', gap: '0.5rem', alignItems: 'end' }}>
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label>{t('spaceview.folder_name')}</label>
              <input
                type="text"
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                placeholder={t('spaceview.folder_placeholder')}
                autoFocus
                required
              />
            </div>
            <button type="submit" className="btn btn-primary">{t('common.create')}</button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowCreateFolder(null)}>{t('common.cancel')}</button>
          </form>
        </div>
      )}

      {/* Inhalte-Tab */}
      {tab === 'pages' && (
        <>
          {/* Folder tree */}
          <div className="sv-folder-tree">
            {folderTree.map(folder => renderFolder(folder))}
          </div>

          {/* Seiten ohne Ordner */}
          {rootPages.length > 0 && (
            <div className="card" style={{ marginTop: folderTree.length > 0 ? '1rem' : 0 }}>
              <h3 style={{ margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileText size={16} />
                {folderTree.length > 0 ? t('spaceview.section_more') : t('spaceview.section_pages')}
              </h3>
              {rootPages.map(page => (
                <Link key={page.id} to={`/pages/${page.id}`} className="sv-page-item">
                  <FileText size={14} />
                  <span className="sv-page-title">{page.title}</span>
                  <span className="sv-page-status" style={{ color: statusColor(page.workflow_status) }}>
                    {statusLabel(page.workflow_status)}
                  </span>
                </Link>
              ))}
            </div>
          )}

          {space.pages.length === 0 && folderTree.length === 0 && showCreateFolder === null && (
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
