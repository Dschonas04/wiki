/**
 * Approvals - DEPRECATED
 *
 * The old approval workflow has been replaced by the Publishing page.
 * This component redirects to /publishing.
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Approvals() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/publishing', { replace: true });
  }, [navigate]);

  return null;
}
