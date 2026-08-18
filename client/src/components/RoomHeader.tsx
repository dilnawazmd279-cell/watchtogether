import React, { useState } from 'react';
import { Copy, Check, Heart } from 'lucide-react';
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
          text: 'Together now',
          className: 'status-badge status-connected',
        };
      case 'waiting-partner':
        return {
          text: 'Waiting for your person...',
          className: 'status-badge status-waiting',
        };
      case 'connecting-peer':
      case 'connecting-server':
        return {
          text: 'Connecting...',
          className: 'status-badge status-connecting',
        };
      case 'partner-disconnected':
        return {
          text: 'Partner stepped away',
          className: 'status-badge status-disconnected',
        };
      case 'room-full':
        return {
          text: 'Cinema Full',
          className: 'status-badge status-error',
        };
      case 'error':
        return {
          text: 'Connection Error',
          className: 'status-badge status-error',
        };
      default:
        return {
          text: 'Private Cinema',
          className: 'status-badge status-connecting',
        };
    }
  };

  const status = getStatusBadge();

  return (
    <header className="app-header">
      {/* Brand Left */}
      <div className="header-brand">
        <div className="brand-icon-wrapper">
          <Heart size={18} className="brand-heart-icon" fill="currentColor" />
        </div>
        <div className="brand-text">
          <span className="brand-title">WATCH TOGETHER</span>
          <span className="brand-tag">PRIVATE CINEMA</span>
        </div>
      </div>

      {/* Center Status */}
      <div className="header-center">
        <div className={status.className}>
          <span className="status-dot"></span>
          <span className="status-label">{status.text}</span>
        </div>
      </div>

      {/* Actions Right */}
      <div className="header-actions">
        <div className="room-id-pill" title="Cinema Code">
          <span className="room-id-label">CODE:</span>
          <code className="room-id-code">{roomId}</code>
        </div>
        <button
          onClick={copyRoomLink}
          className={`btn-copy-link ${copied ? 'copied' : ''}`}
          title="Copy private cinema invite link"
          id="copy-room-link-btn"
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
          <span>{copied ? 'Copied' : 'Copy Invite'}</span>
        </button>
      </div>
    </header>
  );
};
