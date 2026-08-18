import React from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorOff,
  PhoneOff,
  Sparkles,
} from 'lucide-react';
import { MediaState } from '../types';

interface ControlsProps {
  isHost?: boolean;
  mediaState: MediaState;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onLeaveRoom: () => void;
}

export const Controls: React.FC<ControlsProps> = ({
  isHost = false,
  mediaState,
  onToggleMic,
  onToggleCamera,
  onToggleScreenShare,
  onLeaveRoom,
}) => {
  return (
    <div className="left-controls-bar" role="toolbar" aria-label="Media controls">
      {/* Action Buttons */}
      <div className="controls-buttons-group">
        {/* Microphone Toggle */}
        <button
          onClick={onToggleMic}
          className={`control-btn ${mediaState.isMicOn ? 'btn-active' : 'btn-off'}`}
          title={mediaState.isMicOn ? 'Mute Microphone' : 'Unmute Microphone'}
          aria-label={mediaState.isMicOn ? 'Mute Microphone' : 'Unmute Microphone'}
          id="toggle-mic-btn"
        >
          <div className="btn-icon-inner">
            {mediaState.isMicOn ? <Mic size={18} /> : <MicOff size={18} />}
          </div>
          <span className="control-btn-label">{mediaState.isMicOn ? 'Mic On' : 'Mic Off'}</span>
        </button>

        {/* Camera Toggle */}
        <button
          onClick={onToggleCamera}
          className={`control-btn ${mediaState.isCameraOn ? 'btn-active' : 'btn-off'}`}
          title={mediaState.isCameraOn ? 'Turn Camera Off' : 'Turn Camera On'}
          aria-label={mediaState.isCameraOn ? 'Turn Camera Off' : 'Turn Camera On'}
          id="toggle-camera-btn"
        >
          <div className="btn-icon-inner">
            {mediaState.isCameraOn ? <Video size={18} /> : <VideoOff size={18} />}
          </div>
          <span className="control-btn-label">
            {mediaState.isCameraOn ? 'Camera On' : 'Camera Off'}
          </span>
        </button>

        {/* Host Stop Cinema Button (only visible when sharing) */}
        {isHost && mediaState.isScreenSharing && (
          <button
            onClick={onToggleScreenShare}
            className="control-btn btn-danger"
            title="Stop Cinema Streaming"
            aria-label="Stop Cinema Streaming"
            id="toggle-screenshare-btn"
          >
            <div className="btn-icon-inner">
              <MonitorOff size={18} />
            </div>
            <span className="control-btn-label">Stop Cinema</span>
          </button>
        )}

        {/* Leave Room */}
        <button
          onClick={onLeaveRoom}
          className="control-btn btn-danger"
          title="Leave Room"
          aria-label="Leave Room"
          id="leave-room-btn"
        >
          <div className="btn-icon-inner">
            <PhoneOff size={18} />
          </div>
          <span className="control-btn-label">Leave</span>
        </button>
      </div>

      {/* Right side Tip */}
      <div className="controls-tip-wrap">
        <Sparkles size={14} className="controls-tip-icon" />
        <span className="controls-tip-text">
          {isHost
            ? 'Open your movie in Chrome, switch to the movie tab, and click the WatchTogether icon.'
            : 'You are watching with your host. Chat, react, and enjoy!'}
        </span>
      </div>
    </div>
  );
};
