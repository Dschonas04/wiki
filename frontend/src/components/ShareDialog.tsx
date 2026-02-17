/**
 * ShareDialog - DEPRECATED
 *
 * Per-page sharing has been replaced by space memberships.
 * This stub keeps the export signature so existing imports do not break at runtime,
 * but displays a "no longer available" message.
 */

import { X, Share2 } from 'lucide-react';

interface ShareDialogProps {
  pageId: number;
  pageTitle: string;
  onClose: () => void;
}

export default function ShareDialog({ pageTitle, onClose }: ShareDialogProps) {
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
          <p className="text-muted" style={{ textAlign: 'center', padding: '2rem 0' }}>
            Per-page sharing is no longer available. Use <strong>Space memberships</strong> to
            control access.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
