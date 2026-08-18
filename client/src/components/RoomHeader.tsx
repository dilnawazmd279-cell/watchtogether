import React, { useState } from 'react';
import { Copy, Check, Film } from 'lucide-react';
import { ConnectionStatus } from '../types';
import { buildRoomInviteUrl } from '../lib/urlHelper';

interface RoomHeaderProps {
  roomId: string;
  connectionStatus: ConnectionStatus;
  onLeave: () => void;
}

export const RoomHeader: React.FC<RoomHeaderProps> = ({
  roomId,
  connectionStatus,
}) => {
  const [copied, setCopied] = useState(false);

  const copyRoomLink = async () => {
    const url = buildRoomInviteUrl(roomId);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // Fallback for non-https / older browsers
        const input = document.createElement('input');
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy room link:', err);
    }
  };

  const getStatusBadge = () => {
    switch (connectionStatus) {
      case 'connected':
        return {
          text: 'Partner Connected (2/2)',
          className: 'status-badge status-connected',
        };
      case 'waiting-partner':
        return {
          text: 'Waiting for Partner (1/2)',
          className: 'status-badge status-waiting',
        };
      case 'connecting-peer':
        return {
          text: 'Connecting WebRTC...',
          className: 'status-badge status-connecting',
        };
      case 'connecting-server':
        return {
          text: 'Connecting Server...',
          className: 'status-badge status-connecting',
        };
      case 'partner-disconnected':
        return {
          text: 'Partner Left (1/2)',
          className: 'status-badge status-disconnected',
        };
      case 'room-full':
        return {
          text: 'Room Full (Max 2)',
          className: 'status-badge status-error',
        };
      case 'error':
        return {
          text: 'Connection Error',
          className: 'status-badge status-error',
        };
      default:
        return {
          text: 'Initializing...',
          className: 'status-badge status-connecting',
        };
    }
  };

  const status = getStatusBadge();

  return (
    <header className="app-header">
      <div className="header-brand">
        <div className="brand-icon-wrapper">
          <Film size={20} className="brand-icon" />
        </div>
        <div className="brand-text">
          <span className="brand-title">WATCH TOGETHER</span>
          <span className="brand-tag">P2P CINEMA</span>
        </div>
      </div>

      <div className="header-center">
        <div className={status.className}>
          <span className="status-dot"></span>
          <span className="status-label">{status.text}</span>
        </div>
      </div>

      <div className="header-actions">
        <div className="room-id-pill" title="Room Code">
          <span className="room-id-label">ROOM:</span>
          <code className="room-id-code">{roomId}</code>
        </div>
        <button
          onClick={copyRoomLink}
          className={`btn-copy-link ${copied ? 'copied' : ''}`}
          title="Copy room invite link"
          id="copy-room-link-btn"
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
          <span>{copied ? 'Link Copied!' : 'Copy Link'}</span>
        </button>
      </div>
    </header>
  );
};
