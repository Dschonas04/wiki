import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, XCircle, Clock, FileText, User, MessageSquare } from 'lucide-react';
import { api, type ApprovalRequest } from '../api/client';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/PageHeader';
import Loading from '../components/Loading';
import ConfirmDialog from '../components/ConfirmDialog';

type TabStatus = 'pending' | 'approved' | 'rejected';

export default function Approvals() {
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabStatus>('pending');
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [rejectDialog, setRejectDialog] = useState<ApprovalRequest | null>(null);
  const [rejectComment, setRejectComment] = useState('');
  const { showToast } = useToast();

  const fetchRequests = async (status: TabStatus) => {
    setLoading(true);
    try {
      const data = await api.getApprovals(status);
      setRequests(data);
    } catch {
      showToast('Failed to load approval requests', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests(activeTab);
  }, [activeTab]);

  const handleApprove = async (req: ApprovalRequest) => {
    setActionLoading(req.id);
    try {
      await api.approveRequest(req.id);
      showToast(`"${req.page_title}" approved and published`, 'success');
      setRequests(prev => prev.filter(r => r.id !== req.id));
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!rejectDialog) return;
    setActionLoading(rejectDialog.id);
    try {
      await api.rejectRequest(rejectDialog.id, rejectComment || undefined);
      showToast(`"${rejectDialog.page_title}" rejected`, 'success');
      setRequests(prev => prev.filter(r => r.id !== rejectDialog.id));
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setActionLoading(null);
      setRejectDialog(null);
      setRejectComment('');
    }
  };

  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString('de-DE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const tabs: { key: TabStatus; label: string; icon: React.ReactNode }[] = [
    { key: 'pending', label: 'Pending', icon: <Clock size={16} /> },
    { key: 'approved', label: 'Approved', icon: <CheckCircle size={16} /> },
    { key: 'rejected', label: 'Rejected', icon: <XCircle size={16} /> },
  ];

  return (
    <>
      <PageHeader title="Approval Queue" />
      <div className="content-body">
        <div className="approval-tabs">
          {tabs.map(tab => (
            <button
              key={tab.key}
              className={`approval-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <Loading />
        ) : requests.length === 0 ? (
          <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
            <p className="text-muted" style={{ fontSize: '1rem' }}>
              {activeTab === 'pending'
                ? 'No pending approval requests.'
                : activeTab === 'approved'
                ? 'No approved requests to show.'
                : 'No rejected requests to show.'}
            </p>
          </div>
        ) : (
          <div className="approval-list">
            {requests.map(req => (
              <div key={req.id} className={`approval-card ${req.status}`}>
                <div className="approval-card-header">
                  <Link to={`/pages/${req.page_id}`} className="approval-page-title">
                    <FileText size={16} />
                    <span>{req.page_title || `Page #${req.page_id}`}</span>
                  </Link>
                  <span className={`approval-status-badge ${req.status}`}>
                    {req.status === 'pending' && <Clock size={13} />}
                    {req.status === 'approved' && <CheckCircle size={13} />}
                    {req.status === 'rejected' && <XCircle size={13} />}
                    {req.status}
                  </span>
                </div>

                <div className="approval-card-meta">
                  <span className="approval-meta-item">
                    <User size={13} />
                    Requested by <strong>{req.requested_by_display || req.requested_by_name}</strong>
                  </span>
                  <span className="approval-meta-item">
                    <Clock size={13} />
                    {formatDate(req.created_at)}
                  </span>
                  {req.reviewer_name && (
                    <span className="approval-meta-item">
                      <User size={13} />
                      Reviewed by <strong>{req.reviewer_name}</strong>
                    </span>
                  )}
                  {req.resolved_at && (
                    <span className="approval-meta-item">
                      <CheckCircle size={13} />
                      {formatDate(req.resolved_at)}
                    </span>
                  )}
                </div>

                {req.comment && (
                  <div className="approval-comment">
                    <MessageSquare size={13} />
                    <span>{req.comment}</span>
                  </div>
                )}

                {req.status === 'pending' && (
                  <div className="approval-card-actions">
                    <Link to={`/pages/${req.page_id}`} className="btn btn-secondary btn-sm">
                      <FileText size={14} /> View Page
                    </Link>
                    <button
                      className="btn btn-success btn-sm"
                      onClick={() => handleApprove(req)}
                      disabled={actionLoading === req.id}
                    >
                      <CheckCircle size={14} />
                      <span>Approve</span>
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => setRejectDialog(req)}
                      disabled={actionLoading === req.id}
                    >
                      <XCircle size={14} />
                      <span>Reject</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {rejectDialog && (
        <div className="confirm-overlay" onClick={() => setRejectDialog(null)}>
          <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
            <h3>Reject Approval</h3>
            <p>Reject the approval request for "<strong>{rejectDialog.page_title}</strong>"?</p>
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label>Reason (optional)</label>
              <textarea
                className="form-textarea"
                rows={3}
                placeholder="Provide a reason for rejection…"
                value={rejectComment}
                onChange={e => setRejectComment(e.target.value)}
              />
            </div>
            <div className="btn-row" style={{ marginTop: '1rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => { setRejectDialog(null); setRejectComment(''); }}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleReject} disabled={actionLoading === rejectDialog.id}>
                <XCircle size={14} /> Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
