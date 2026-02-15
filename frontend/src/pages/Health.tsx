import { useEffect, useState } from 'react';
import {
  CheckCircle,
  XCircle,
  Database,
  Server,
  Shield,
  Clock,
  Terminal,
} from 'lucide-react';
import { api, type HealthData } from '../api/client';
import PageHeader from '../components/PageHeader';
import Loading from '../components/Loading';

export default function Health() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getHealth()
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString('de-DE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

  if (loading) {
    return (
      <>
        <PageHeader title="System Health" />
        <div className="content-body"><Loading /></div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader
          title="System Health"
          subtitle="Monitor the status of your wiki"
        />
        <div className="content-body">
          <div className="status-banner error">
            <XCircle size={22} />
            <div>
              <strong>System Unhealthy</strong>
              <p>Could not reach API: {error}</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  const isHealthy = data?.status === 'healthy';
  const dbOk = data?.database === 'connected';

  return (
    <>
      <PageHeader
        title="System Health"
        subtitle="Monitor the status of your wiki"
      />

      <div className="content-body">
        {/* Overall Status */}
        <div className={`status-banner ${isHealthy ? 'success' : 'error'}`}>
          {isHealthy ? <CheckCircle size={22} /> : <XCircle size={22} />}
          <div>
            <strong>{isHealthy ? 'All Systems Operational' : 'System Unhealthy'}</strong>
            {data?.timestamp && <p>Last check: {formatDate(data.timestamp)}</p>}
          </div>
        </div>

        {/* Health Cards */}
        <div className="health-grid">
          <div className="health-card">
            <div className="health-card-header">
              <Database size={20} />
              <span>Database</span>
            </div>
            <div className={`health-status ${dbOk ? 'ok' : 'err'}`}>
              {dbOk ? (
                <>
                  <CheckCircle size={16} />
                  <span>Connected</span>
                </>
              ) : (
                <>
                  <XCircle size={16} />
                  <span>{data?.database}</span>
                </>
              )}
            </div>
          </div>

          <div className="health-card">
            <div className="health-card-header">
              <Server size={20} />
              <span>API Server</span>
            </div>
            <div className="health-status ok">
              <CheckCircle size={16} />
              <span>Running</span>
            </div>
            <div className="health-detail">
              Node.js {data?.nodeVersion}
            </div>
          </div>

          <div className="health-card">
            <div className="health-card-header">
              <Shield size={20} />
              <span>Reverse Proxy</span>
            </div>
            <div className="health-status ok">
              <CheckCircle size={16} />
              <span>Nginx Active</span>
            </div>
            <div className="health-detail">
              Security headers, rate limiting, gzip
            </div>
          </div>

          <div className="health-card">
            <div className="health-card-header">
              <Clock size={20} />
              <span>Environment</span>
            </div>
            <div className="health-detail large">
              {data?.environment || 'unknown'}
            </div>
          </div>
        </div>

        {/* API Endpoint */}
        <div className="card">
          <div className="card-title">
            <Terminal size={18} />
            <span>API Endpoint</span>
          </div>
          <p className="card-text">Access the health check directly:</p>
          <code className="code-block">
            curl http://localhost:8080/api/health
          </code>
        </div>
      </div>
    </>
  );
}
