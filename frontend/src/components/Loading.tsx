import { Loader2 } from 'lucide-react';

interface LoadingProps {
  message?: string;
}

export default function Loading({ message = 'Loading…' }: LoadingProps) {
  return (
    <div className="loading-state">
      <Loader2 className="loading-spinner" size={32} />
      <p>{message}</p>
    </div>
  );
}
