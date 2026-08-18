import React, { useState, useEffect, useCallback } from 'react';
import { Lobby } from './components/Lobby';
import { RoomHeader } from './components/RoomHeader';
import { ScreenShareView } from './components/ScreenShareView';
import { PartnerCam1, PartnerCam2 } from './components/CameraCards';
import { Controls } from './components/Controls';
import { Chat } from './components/Chat';
import { ErrorBanner } from './components/ErrorBanner';
import { useWebRTC } from './hooks/useWebRTC';
import { getRoomIdFromCurrentUrl } from './lib/urlHelper';

export const App: React.FC = () => {
  const [activeRoomId, setActiveRoomId] = useState<string | null>(() => {
    return getRoomIdFromCurrentUrl();
  });

  const handleRoomFull = useCallback((_msg: string) => {}, []);

  const {
    connectionStatus,
    messages,
    errorMessage,
    isHost,
    connState,
    iceState,
    signalingState,
    mediaState,
    remoteHasCamera,
    remoteHasMic,
    localCameraStream,
    localScreenStream,
    remoteCameraStream,
    remoteScreenStream,
    mediaSource,
    setMediaSource,
    startStreamingMedia,
    stopStreamingMedia,
    toggleCamera,
    toggleMic,
    toggleScreenShare,
    startScreenShare,
    sendMessage,
    leaveRoom: hookLeaveRoom,
    clearError,
  } = useWebRTC({
    roomId: activeRoomId || '',
    onRoomFull: handleRoomFull,
  });

  // Step 9: Lifecycle logs for Host vs Partner
  useEffect(() => {
    if (activeRoomId) {
      if (isHost) {
        console.log('[HOST] room mounted');
      } else {
        console.log('[PARTNER] room mounted');
        console.log('[PARTNER] WebRTC initialized');
        console.log('[PARTNER] waiting for remote movie');
      }
    }
  }, [activeRoomId, isHost]);

  useEffect(() => {
    if (activeRoomId && localCameraStream) {
      if (!isHost) {
        console.log('[PARTNER] camera initialized');
      }
    }
  }, [activeRoomId, localCameraStream, isHost]);

  useEffect(() => {
    if (activeRoomId && !isHost && remoteScreenStream) {
      console.log('[PARTNER] remote movie track received');
    }
  }, [activeRoomId, isHost, remoteScreenStream]);

  const handleJoinRoom = (roomId: string) => {
    const cleanId = roomId.trim().toLowerCase();
    setActiveRoomId(cleanId);
    const newUrl = `/?room=${encodeURIComponent(cleanId)}`;
    window.history.pushState({ roomId: cleanId }, '', newUrl);
  };

  const handleLeaveRoom = () => {
    hookLeaveRoom();
    setActiveRoomId(null);
    window.history.pushState({}, '', '/');
  };

  // Sync with browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const room = getRoomIdFromCurrentUrl();
      if (room !== activeRoomId) {
        if (!room && activeRoomId) {
          hookLeaveRoom();
        }
        setActiveRoomId(room);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeRoomId, hookLeaveRoom]);

  const partnerConnected = connectionStatus === 'connected';

  if (!activeRoomId) {
    return <Lobby onJoinRoom={handleJoinRoom} initialError={errorMessage} />;
  }

  return (
    <div className="app-main-container">
      {/* Error notification banner */}
      <ErrorBanner message={errorMessage} onDismiss={clearError} />

      <div className="app-two-column-layout">
        {/* =========================================================================
            LEFT COLUMN (2/3 width) - RoomHeader, Movie Stage, Media Controls Dock
            ========================================================================= */}
        <div className="layout-left-column">
          {/* Top Section: Room Header */}
          <div className="left-header-section">
            <RoomHeader
              roomId={activeRoomId}
              connectionStatus={connectionStatus}
              onLeave={handleLeaveRoom}
            />
          </div>

          {/* Middle Section: Large Presentation Movie Area */}
          <main className="left-movie-section" role="region" aria-label="Cinema Stage">
            <ScreenShareView
              isHost={isHost}
              remoteScreenStream={remoteScreenStream}
              localScreenStream={localScreenStream}
              localIsScreenSharing={mediaState.isScreenSharing}
              mediaSource={mediaSource}
              onSetMediaSource={setMediaSource}
              onStartStreaming={startStreamingMedia}
              onStopStreaming={stopStreamingMedia}
              onStartShare={startScreenShare}
              partnerConnected={partnerConnected}
              connState={connState}
              iceState={iceState}
              signalingState={signalingState}
            />
          </main>

          {/* Bottom Section: Media Controls Dock */}
          <footer className="left-bottom-section">
            <Controls
              isHost={isHost}
              mediaState={mediaState}
              onToggleCamera={toggleCamera}
              onToggleMic={toggleMic}
              onToggleScreenShare={toggleScreenShare}
              onLeaveRoom={handleLeaveRoom}
            />
          </footer>
        </div>

        {/* =========================================================================
            RIGHT COLUMN (1/3 width sidebar) - Camera Slots & Party Chat
            ========================================================================= */}
        <aside
          className="layout-right-column"
          role="complementary"
          aria-label="Participant media and chat sidebar"
        >
          {/* SLOT 1: PARTNER CAMERA (Dominant top slot) */}
          <div className="right-camera-slot">
            <PartnerCam1
              remoteCameraStream={remoteCameraStream}
              remoteHasCamera={remoteHasCamera}
              remoteHasMic={remoteHasMic}
              partnerConnected={partnerConnected}
            />
          </div>

          {/* SLOT 2: LOCAL USER CAMERA (Middle slot) */}
          <div className="right-camera-slot">
            <PartnerCam2
              localCameraStream={localCameraStream}
              isCameraOn={mediaState.isCameraOn}
              isMicOn={mediaState.isMicOn}
            />
          </div>

          {/* SLOT 3: CHAT (Remaining height) */}
          <div className="right-chat-slot">
            <Chat
              messages={messages}
              onSendMessage={sendMessage}
              partnerConnected={partnerConnected}
            />
          </div>
        </aside>
      </div>
    </div>
  );
};

export default App;
