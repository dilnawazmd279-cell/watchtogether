import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ROOM FATAL] ErrorBoundary caught error:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReload = () => {
    window.location.href = window.location.origin;
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          backgroundColor: '#0b0f19',
          color: '#f8fafc',
          padding: '24px',
          fontFamily: 'Inter, system-ui, sans-serif',
          textAlign: 'center',
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px',
            color: '#ef4444',
          }}>
            <AlertTriangle size={32} />
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '8px' }}>
            Watch Together encountered an error
          </h1>
          <p style={{ color: '#ef4444', maxWidth: '560px', fontSize: '14px', marginBottom: '16px', lineHeight: '1.5', fontFamily: 'monospace', backgroundColor: 'rgba(0,0,0,0.5)', padding: '12px', borderRadius: '6px' }}>
            {this.state.error?.message || 'An unexpected error occurred while rendering the application.'}
          </p>
          {this.state.errorInfo?.componentStack && (
            <pre style={{ color: '#94a3b8', maxWidth: '700px', fontSize: '11px', textAlign: 'left', overflow: 'auto', maxHeight: '160px', marginBottom: '24px', padding: '12px', backgroundColor: '#06080d', borderRadius: '6px', border: '1px solid #1e2638' }}>
              {this.state.errorInfo.componentStack}
            </pre>
          )}
          <button
            onClick={this.handleReload}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 24px',
              backgroundColor: '#38bdf8',
              color: '#0f172a',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            <RotateCcw size={16} />
            <span>Retry / Return to Lobby</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
