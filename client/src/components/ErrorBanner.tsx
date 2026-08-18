import React from 'react';
import { AlertCircle, X } from 'lucide-react';

interface ErrorBannerProps {
  message: string | null;
  onDismiss: () => void;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({ message, onDismiss }) => {
  if (!message) return null;

  return (
    <div className="error-banner" role="alert">
      <div className="error-banner-content">
        <AlertCircle size={18} className="error-icon" />
        <span className="error-text">{message}</span>
      </div>
      <button
        onClick={onDismiss}
        className="error-dismiss-btn"
        aria-label="Dismiss error"
      >
        <X size={16} />
      </button>
    </div>
  );
};
