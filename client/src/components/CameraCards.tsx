import React, { useRef, useEffect } from 'react';
import { Mic, MicOff, Video, VideoOff, Heart, User } from 'lucide-react';

interface PartnerCam1Props {
  remoteCameraStream: MediaStream | null;
  remoteHasCamera: boolean;
  remoteHasMic: boolean;
  partnerConnected: boolean;
}

export const PartnerCam1: React.FC<PartnerCam1Props> = ({
  remoteCameraStream,
  remoteHasCamera,
  remoteHasMic,
  partnerConnected,
}) => {
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (remoteCameraStream) {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteCameraStream;
        remoteVideoRef.current.play().catch((err) => {
          console.warn('[PartnerCam1] Remote video play error:', err);
        });
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteCameraStream;
        remoteAudioRef.current.volume = 1.0;
        remoteAudioRef.current.play().catch((err) => {
          console.warn('[PartnerCam1] Remote audio play error:', err);
        });
      }
    } else {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    }
  }, [remoteCameraStream]);

  return (
    <div className="sidebar-camera-card" id="partner-cam-1">
      {/* Remote Audio Track Player */}
      <audio ref={remoteAudioRef} autoPlay id="remote-audio-player" />

      <div className="sidebar-video-wrapper">
        <video
          ref={remoteVideoRef}
          className={`sidebar-video-el ${remoteHasCamera && remoteCameraStream ? 'visible' : 'hidden'}`}
          autoPlay
          playsInline
          muted
          id="remote-camera-video"
        />
        {(!remoteHasCamera || !remoteCameraStream) && (
          <div className="sidebar-avatar-fallback">
            <div className={`avatar-circle remote-avatar ${!partnerConnected ? 'waiting-pulse' : ''}`}>
              {partnerConnected ? <User size={24} /> : <Heart size={22} className="avatar-heart" />}
            </div>
            <span className="avatar-label">
              {partnerConnected ? 'Camera off' : 'Waiting for your person...'}
            </span>
          </div>
        )}
      </div>

      <div className="sidebar-cam-footer">
        <div className="cam-user-tag">
          <span className="user-badge partner-badge">Partner</span>
        </div>
        {partnerConnected && (
          <div className="cam-status-icons">
            {remoteHasMic ? (
              <span className="status-mini-icon mic-active" title="Partner mic active">
                <Mic size={13} />
              </span>
            ) : (
              <span className="status-mini-icon mic-muted" title="Partner mic muted">
                <MicOff size={13} />
              </span>
            )}
            {remoteHasCamera ? (
              <span className="status-mini-icon video-active" title="Partner camera active">
                <Video size={13} />
              </span>
            ) : (
              <span className="status-mini-icon video-muted" title="Partner camera off">
                <VideoOff size={13} />
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

interface PartnerCam2Props {
  localCameraStream: MediaStream | null;
  isCameraOn: boolean;
  isMicOn: boolean;
}

export const PartnerCam2: React.FC<PartnerCam2Props> = ({
  localCameraStream,
  isCameraOn,
  isMicOn,
}) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const videoEl = localVideoRef.current;
    if (videoEl) {
      if (localCameraStream && localCameraStream.getVideoTracks().length > 0) {
        if (videoEl.srcObject !== localCameraStream) {
          videoEl.srcObject = localCameraStream;
        }
        videoEl.play().catch((err) => {
          console.warn('[PartnerCam2] Local video play error:', err);
        });
      } else {
        videoEl.srcObject = null;
      }
    }
  }, [localCameraStream, isCameraOn]);

  return (
    <div className="sidebar-camera-card" id="partner-cam-2">
      <div className="sidebar-video-wrapper">
        <video
          ref={localVideoRef}
          className={`sidebar-video-el ${isCameraOn ? 'visible' : 'hidden'}`}
          autoPlay
          playsInline
          muted
          id="local-camera-video"
        />
        {!isCameraOn && (
          <div className="sidebar-avatar-fallback">
            <div className="avatar-circle local-avatar">
              <User size={24} />
            </div>
            <span className="avatar-label">Camera off</span>
          </div>
        )}
      </div>

      <div className="sidebar-cam-footer">
        <div className="cam-user-tag">
          <span className="user-badge you-badge">You</span>
        </div>
        <div className="cam-status-icons">
          {isMicOn ? (
            <span className="status-mini-icon mic-active" title="Your mic active">
              <Mic size={13} />
            </span>
          ) : (
            <span className="status-mini-icon mic-muted" title="Your mic muted">
              <MicOff size={13} />
            </span>
          )}
          {isCameraOn ? (
            <span className="status-mini-icon video-active" title="Your camera active">
              <Video size={13} />
            </span>
          ) : (
            <span className="status-mini-icon video-muted" title="Your camera off">
              <VideoOff size={13} />
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
