import React from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Tv,
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
          title={mediaState.isMicOn ? 'Mute microphone' : 'Unmute microphone'}
          aria-label={mediaState.isMicOn ? 'Mute microphone' : 'Unmute microphone'}
          id="toggle-mic-btn"
        >
          <div className="btn-icon-inner">
            {mediaState.isMicOn ? <Mic size={17} /> : <MicOff size={17} />}
          </div>
          <span className="control-btn-label">{mediaState.isMicOn ? 'Mic On' : 'Mic Off'}</span>
        </button>

        {/* Camera Toggle */}
        <button
          onClick={onToggleCamera}
          className={`control-btn ${mediaState.isCameraOn ? 'btn-active' : 'btn-off'}`}
          title={mediaState.isCameraOn ? 'Turn camera off' : 'Turn camera on'}
          aria-label={mediaState.isCameraOn ? 'Turn camera off' : 'Turn camera on'}
          id="toggle-camera-btn"
        >
          <div className="btn-icon-inner">
            {mediaState.isCameraOn ? <Video size={17} /> : <VideoOff size={17} />}
          </div>
          <span className="control-btn-label">
            {mediaState.isCameraOn ? 'Camera On' : 'Camera Off'}
          </span>
        </button>

        {/* Host Cinema Control Button */}
        {isHost && (
          <button
            onClick={onToggleScreenShare}
            className={`control-btn ${
              mediaState.isScreenSharing ? 'btn-cinema-active' : 'btn-cinema-neutral'
            }`}
            title={mediaState.isScreenSharing ? 'Stop Cinema' : 'Start Cinema'}
            aria-label={mediaState.isScreenSharing ? 'Stop Cinema' : 'Start Cinema'}
            id="toggle-screenshare-btn"
          >
            <div className="btn-icon-inner">
              <Tv size={17} />
            </div>
            <span className="control-btn-label">
              {mediaState.isScreenSharing ? 'Stop Cinema' : 'Start Cinema'}
            </span>
          </button>
        )}

        {/* Leave Cinema */}
        <button
          onClick={onLeaveRoom}
          className="control-btn btn-leave"
          title="Leave Cinema"
          aria-label="Leave Cinema"
          id="leave-room-btn"
        >
          <div className="btn-icon-inner">
            <PhoneOff size={17} />
          </div>
          <span className="control-btn-label">Leave Cinema</span>
        </button>
      </div>

      {/* Right side Subtle Tip */}
      <div className="controls-tip-wrap">
        <Sparkles size={14} className="controls-tip-icon" />
        <span className="controls-tip-text">
          {isHost
            ? 'Add a movie or start Cinema anytime.'
            : 'Private cinema for two. Relax and enjoy together ❤️'}
        </span>
      </div>
    </div>
  );
};
