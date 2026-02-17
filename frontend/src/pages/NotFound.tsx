import { Link } from 'react-router-dom';
import { Home, FileQuestion } from 'lucide-react';
import PageHeader from '../components/PageHeader';

export default function NotFound() {
  return (
    <>
      <PageHeader title="404 – Nicht gefunden" subtitle="Die gesuchte Seite existiert nicht." />

      <div className="content-body">
        <div className="empty-state">
          <div className="empty-state-icon">
            <FileQuestion size={48} />
          </div>
          <h3>Seite nicht gefunden</h3>
          <p>Die eingegebene URL stimmt mit keiner Seite in diesem Wiki überein.</p>
          <div className="empty-state-action">
            <Link to="/" className="btn btn-primary">
              <Home size={16} />
              <span>Zur Startseite</span>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
