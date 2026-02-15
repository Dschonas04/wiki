import { useState, useEffect } from 'react';
import { X, Share2, UserPlus, Trash2 } from 'lucide-react';
import { api, type UserBasic } from '../api/client';
import { useToast } from '../context/ToastContext';

interface Share {
  id: number;
  page_id: number;
  shared_with_user_id: number;
  username: string;
  display_name: string;
  permission: string;
  shared_by_name: string;
  created_at: string;
}

interface ShareDialogProps {
  pageId: number;
  pageTitle: string;
  onClose: () => void;
}

export default function ShareDialog({ pageId, pageTitle, onClose }: ShareDialogProps) {
  const [shares, setShares] = useState<Share[]>([]);
  const [users, setUsers] = useState<UserBasic[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [permission, setPermission] = useState<'read' | 'edit'>('read');
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    Promise.all([
      api.getPageShares(pageId).then(setShares),
      api.getUsersBasic().then(setUsers),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pageId]);

  const handleShare = async () => {
    if (!selectedUserId) return;
    try {
      const updated = await api.sharePage(pageId, parseInt(selectedUserId), permission);
      setShares(updated);
      setSelectedUserId('');
      showToast('Page shared!', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleRemove = async (userId: number) => {
    try {
      const updated = await api.unsharePage(pageId, userId);
      setShares(updated);
      showToast('Share removed', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const sharedUserIds = new Set(shares.map((s) => s.shared_with_user_id));
  const availableUsers = users.filter((u) => !sharedUserIds.has(u.id));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <Share2 size={18} /> Share &ldquo;{pageTitle}&rdquo;
          </h3>
          <button className="icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {/* Add share */}
          <div className="share-add-row">
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="share-select"
            >
              <option value="">Select user…</option>
              {availableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName} ({u.username})
                </option>
              ))}
            </select>
            <select
              value={permission}
              onChange={(e) => setPermission(e.target.value as 'read' | 'edit')}
              className="share-perm-select"
            >
              <option value="read">Read</option>
              <option value="edit">Edit</option>
            </select>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleShare}
              disabled={!selectedUserId}
            >
              <UserPlus size={14} /> Share
            </button>
          </div>

          {/* Current shares */}
          <div className="share-list">
            {loading && (
              <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                Loading…
              </p>
            )}
            {!loading && shares.length === 0 && (
              <p
                className="text-muted"
                style={{ fontSize: '0.85rem', textAlign: 'center', padding: '16px 0' }}
              >
                Not shared with anyone yet.
              </p>
            )}
            {shares.map((share) => (
              <div key={share.id} className="share-item">
                <div className="share-item-info">
                  <span className="share-avatar">
                    {share.username[0].toUpperCase()}
                  </span>
                  <div>
                    <div className="share-name">{share.display_name}</div>
                    <div className="share-meta">
                      @{share.username} · {share.permission}
                    </div>
                  </div>
                </div>
                <button
                  className="icon-btn danger"
                  onClick={() => handleRemove(share.shared_with_user_id)}
                  title="Remove"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
