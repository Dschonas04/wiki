import { Link } from 'react-router-dom';
import { Home, FileQuestion } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { useLanguage } from '../context/LanguageContext';

export default function NotFound() {
  const { t } = useLanguage();

  return (
    <>
      <PageHeader title={t('notfound.title')} subtitle={t('notfound.subtitle')} />

      <div className="content-body">
        <div className="empty-state">
          <div className="empty-state-icon">
            <FileQuestion size={48} />
          </div>
          <h3>{t('notfound.heading')}</h3>
          <p>{t('notfound.description')}</p>
          <div className="empty-state-action">
            <Link to="/" className="btn btn-primary">
              <Home size={16} />
              <span>{t('notfound.home')}</span>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
