/**
 * SharedWithMe - DEPRECATED
 *
 * Per-page sharing has been replaced by spaces.
 * This component redirects to /spaces.
 */

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function SharedWithMe() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/spaces', { replace: true });
  }, [navigate]);

  return null;
}
