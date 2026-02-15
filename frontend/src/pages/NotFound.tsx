import { Link } from 'react-router-dom';
import { Home, FileQuestion } from 'lucide-react';
import PageHeader from '../components/PageHeader';

export default function NotFound() {
  return (
    <>
      <PageHeader title="404 – Not Found" subtitle="The page you are looking for does not exist." />

      <div className="content-body">
        <div className="empty-state">
          <div className="empty-state-icon">
            <FileQuestion size={48} />
          </div>
          <h3>Page not found</h3>
          <p>The URL you entered doesn't match any page in this wiki.</p>
          <div className="empty-state-action">
            <Link to="/" className="btn btn-primary">
              <Home size={16} />
              <span>Go Home</span>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
