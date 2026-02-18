/**
 * ErrorBoundary – Globaler Fehlerschutz für die Nexora-Anwendung
 *
 * Fängt unbehandelte Fehler in der React-Komponentenstruktur ab und
 * zeigt eine benutzerfreundliche Fehlermeldung anstelle eines leeren Bildschirms.
 */

import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '2rem',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          background: 'var(--bg-primary, #f5f5f5)',
          color: 'var(--text-primary, #1a1a1a)',
        }}>
          <div style={{
            maxWidth: '480px',
            textAlign: 'center',
            padding: '2rem',
            borderRadius: '12px',
            background: 'var(--bg-secondary, #ffffff)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
          }}>
            <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
              ⚠️ Etwas ist schiefgelaufen
            </h1>
            <p style={{ color: 'var(--text-secondary, #666)', marginBottom: '1.5rem' }}>
              Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.
            </p>
            {import.meta.env.DEV && this.state.error && (
              <pre style={{
                textAlign: 'left',
                fontSize: '0.75rem',
                padding: '1rem',
                borderRadius: '8px',
                background: 'var(--bg-primary, #f0f0f0)',
                overflow: 'auto',
                maxHeight: '200px',
                marginBottom: '1.5rem',
              }}>
                {this.state.error.message}
              </pre>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                onClick={this.handleReload}
                style={{
                  padding: '0.5rem 1.25rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'var(--accent, #6366f1)',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                Seite neu laden
              </button>
              <button
                onClick={this.handleGoHome}
                style={{
                  padding: '0.5rem 1.25rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border, #ddd)',
                  background: 'transparent',
                  color: 'var(--text-primary, #1a1a1a)',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                Zur Startseite
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
