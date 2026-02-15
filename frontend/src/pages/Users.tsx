import { useEffect, useState, type FormEvent } from 'react';
import { Users as UsersIcon, PlusCircle, Trash2, Shield, Edit3, X, Check } from 'lucide-react';
import { api, type UserListItem } from '../api/client';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/PageHeader';
import Loading from '../components/Loading';

const ROLE_COLORS: Record<string, string> = {
  admin: 'red',
  editor: 'blue',
  viewer: 'gray',
};

export default function UsersPage() {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editRole, setEditRole] = useState('');
  const { showToast } = useToast();

  // New user form
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await api.getUsers();
      setUsers(data);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUsers(); }, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.createUser({ username, password, displayName, email, role });
      showToast('User created', 'success');
      setShowForm(false);
      setUsername(''); setPassword(''); setDisplayName(''); setEmail(''); setRole('viewer');
      loadUsers();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleRoleUpdate = async (id: number) => {
    try {
      await api.updateUser(id, { role: editRole });
      showToast('Role updated', 'success');
      setEditId(null);
      loadUsers();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleToggleActive = async (u: UserListItem) => {
    try {
      await api.updateUser(u.id, { isActive: !u.isActive });
      showToast(`User ${u.isActive ? 'deactivated' : 'activated'}`, 'success');
      loadUsers();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return;
    try {
      await api.deleteUser(id);
      showToast('User deleted', 'success');
      loadUsers();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const formatDate = (s?: string) =>
    s ? new Date(s).toLocaleDateString('de-DE', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  if (loading) return (<><PageHeader title="Users" /><div className="content-body"><Loading /></div></>);

  return (
    <>
      <PageHeader
        title="User Management"
        subtitle={`${users.length} user${users.length !== 1 ? 's' : ''}`}
        actions={
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? <><X size={18} /><span>Cancel</span></> : <><PlusCircle size={18} /><span>New User</span></>}
          </button>
        }
      />

      <div className="content-body">
        {showForm && (
          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 16 }}>Create User</h3>
            <form onSubmit={handleCreate} className="user-form">
              <div className="form-row">
                <div className="form-group">
                  <label>Username *</label>
                  <input value={username} onChange={(e) => setUsername(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Password *</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Display Name</label>
                  <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Role</label>
                  <select value={role} onChange={(e) => setRole(e.target.value)}>
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button type="submit" className="btn btn-primary"><PlusCircle size={16} /> Create</button>
                </div>
              </div>
            </form>
          </div>
        )}

        <div className="users-table-wrap">
          <table className="users-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Source</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={!u.isActive ? 'inactive-row' : ''}>
                  <td>
                    <div className="user-cell">
                      <div className="user-avatar">{u.username[0].toUpperCase()}</div>
                      <div>
                        <div className="user-name">{u.displayName || u.username}</div>
                        <div className="user-email">{u.email || u.username}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {editId === u.id ? (
                      <div className="role-edit">
                        <select value={editRole} onChange={(e) => setEditRole(e.target.value)}>
                          <option value="viewer">Viewer</option>
                          <option value="editor">Editor</option>
                          <option value="admin">Admin</option>
                        </select>
                        <button className="icon-btn" onClick={() => handleRoleUpdate(u.id)} title="Save"><Check size={14} /></button>
                        <button className="icon-btn" onClick={() => setEditId(null)} title="Cancel"><X size={14} /></button>
                      </div>
                    ) : (
                      <span className={`role-badge role-${ROLE_COLORS[u.role] || 'gray'}`}>
                        <Shield size={12} /> {u.role}
                      </span>
                    )}
                  </td>
                  <td><span className="source-badge">{u.authSource}</span></td>
                  <td>
                    <button className={`status-badge ${u.isActive ? 'active' : 'inactive'}`} onClick={() => handleToggleActive(u)} title="Toggle active">
                      {u.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="meta-text">{formatDate(u.lastLogin)}</td>
                  <td>
                    <div className="table-actions">
                      <button className="icon-btn" title="Edit role" onClick={() => { setEditId(u.id); setEditRole(u.role); }}><Edit3 size={14} /></button>
                      <button className="icon-btn danger" title="Delete" onClick={() => handleDelete(u.id, u.username)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
