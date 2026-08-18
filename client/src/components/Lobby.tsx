import React, { useState, useEffect } from 'react';
import { Film, Monitor, ShieldCheck, ArrowRight, Video } from 'lucide-react';
import { generateRoomId } from '../lib/config';
import { getRoomIdFromCurrentUrl } from '../lib/urlHelper';

interface LobbyProps {
  onJoinRoom: (roomId: string) => void;
  initialError?: string | null;
}

export const Lobby: React.FC<LobbyProps> = ({ onJoinRoom, initialError }) => {
  const [roomIdInput, setRoomIdInput] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError || null);

  // Check if room is present in URL on load
  useEffect(() => {
    const room = getRoomIdFromCurrentUrl();
    if (room) {
      onJoinRoom(room);
    }
  }, [onJoinRoom]);

  const handleCreateRoom = () => {
    const newRoomId = generateRoomId();
    onJoinRoom(newRoomId);
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    let raw = roomIdInput.trim();
    if (!raw) {
      setErrorMessage('Please enter a room code or link.');
      return;
    }

    // If user pasted a full URL, extract the room code
    if (raw.includes('room=')) {
      const match = raw.match(/room=([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        raw = match[1];
      }
    } else if (raw.includes('/')) {
      const parts = raw.split('/');
      raw = parts[parts.length - 1];
    }

    raw = raw.toLowerCase().trim();
    if (raw.length < 3) {
      setErrorMessage('Invalid room code. Codes are at least 3 characters.');
      return;
    }

    onJoinRoom(raw);
  };

  return (
    <div className="lobby-container">
      <div className="lobby-hero">
        <div className="lobby-badge">
          <Film size={16} className="badge-icon" />
          <span>Private 2-Person Cinema</span>
        </div>

        <h1 className="lobby-title">
          Watch Together <span className="text-gradient">in Real Time</span>
        </h1>
        <p className="lobby-subtitle">
          Direct peer-to-peer watch rooms. Share your screen, browser tabs, cameras,
          and voice with zero middleman buffering and zero server storage.
        </p>

        {errorMessage && (
          <div className="lobby-error-card" role="alert">
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="lobby-card-grid">
          {/* Create Room Box */}
          <div className="lobby-card">
            <div className="card-header">
              <h2 className="card-title">Start a Watch Party</h2>
              <p className="card-desc">Generate a private room and invite your partner with a link.</p>
            </div>
            <button
              onClick={handleCreateRoom}
              className="btn-create-room"
              id="create-room-btn"
            >
              <span>Create New Room</span>
              <ArrowRight size={18} />
            </button>
          </div>

          {/* Join Room Box */}
          <div className="lobby-card">
            <div className="card-header">
              <h2 className="card-title">Join Existing Room</h2>
              <p className="card-desc">Enter the room code or invite link provided by your partner.</p>
            </div>
            <form onSubmit={handleJoinRoom} className="join-form">
              <div className="input-group">
                <input
                  type="text"
                  placeholder="e.g. 7x9k2m or paste link"
                  value={roomIdInput}
                  onChange={(e) => {
                    setRoomIdInput(e.target.value);
                    setErrorMessage(null);
                  }}
                  className="room-input"
                  id="join-room-input"
                />
                <button
                  type="submit"
                  className="btn-join-room"
                  id="join-room-btn"
                >
                  Join Room
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="lobby-features">
          <div className="feature-item">
            <div className="feature-icon-wrap">
              <Monitor size={22} />
            </div>
            <div>
              <h3 className="feature-title">Native Tab & Screen Sharing</h3>
              <p className="feature-desc">Stream movies, YouTube, or browser tabs in real-time WebRTC quality.</p>
            </div>
          </div>

          <div className="feature-item">
            <div className="feature-icon-wrap">
              <Video size={22} />
            </div>
            <div>
              <h3 className="feature-title">Simultaneous Cam & Voice</h3>
              <p className="feature-desc">See and speak with each other while watching uninterrupted.</p>
            </div>
          </div>

          <div className="feature-item">
            <div className="feature-icon-wrap">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h3 className="feature-title">100% Private & P2P</h3>
              <p className="feature-desc">Direct WebRTC connection. No media is stored, proxied, or recorded.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
