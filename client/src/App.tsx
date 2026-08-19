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
    movieConnState,
    movieIceState,
    movieSignalingState,
    dataChannelState: _dataChannelState,
    mediaState,
    remoteHasCamera,
    remoteHasMic,
    localCameraStream,
    remoteCameraStream,
    localMovieStream,
    remoteMovieStream,
    mediaSource,
    movieTabInfo,
    isExtensionInstalled,
    captureState,
    webrtcStats,
    openMovieTab,
    stopMovieStreaming,
    toggleCamera,
    toggleMic,
    sendMessage,
    leaveRoom: hookLeaveRoom,
    clearError,
  } = useWebRTC({
    roomId: activeRoomId || '',
    onRoomFull: handleRoomFull,
  });

  // Lifecycle logs
  useEffect(() => {
    if (activeRoomId) {
      if (isHost) {
        console.log('[HOST] room mounted');
      } else {
        console.log('[PARTNER] room mounted');
        console.log('[PARTNER] WebRTC initialized');
        console.log('[PARTNER] waiting for Host movie');
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
    <div className="room-shell">
      {/* Error notification banner */}
      <ErrorBanner message={errorMessage} onDismiss={clearError} />

      {/* 1. FULL-WIDTH ROOM HEADER */}
      <header className="room-header-container">
        <RoomHeader
          roomId={activeRoomId}
          connectionStatus={connectionStatus}
          onLeave={handleLeaveRoom}
        />
      </header>

      {/* 2. MAIN 2-COLUMN ROOM BODY */}
      <div className="room-layout">
        {/* MOVIE COLUMN (NATURAL LEFT ~75%) */}
        <main className="movie-column" role="region" aria-label="Cinema Stage">
          <ScreenShareView
            isHost={isHost}
            localMovieStream={localMovieStream}
            remoteMovieStream={remoteMovieStream}
            mediaSource={mediaSource}
            movieTabInfo={movieTabInfo}
            isExtensionInstalled={isExtensionInstalled}
            captureState={captureState}
            webrtcStats={webrtcStats}
            onOpenMovieTab={openMovieTab}
            onStopCinema={stopMovieStreaming}
            partnerConnected={partnerConnected}
            connState={connState}
            iceState={iceState}
            signalingState={signalingState}
            movieConnState={movieConnState}
            movieIceState={movieIceState}
            movieSignalingState={movieSignalingState}
          />
        </main>

        {/* SIDEBAR (NATURAL RIGHT ~25%): 2 LARGE CAMERAS + COMPACT CHAT */}
        <aside
          className="room-sidebar"
          role="complementary"
          aria-label="Participant cameras and conversation"
        >
          {/* CAMERA 1: PARTNER (LARGE 16:9) */}
          <div className="sidebar-cam-slot">
            <PartnerCam1
              remoteCameraStream={remoteCameraStream}
              remoteHasCamera={remoteHasCamera}
              remoteHasMic={remoteHasMic}
              partnerConnected={partnerConnected}
            />
          </div>

          {/* CAMERA 2: YOU (LARGE 16:9) */}
          <div className="sidebar-cam-slot">
            <PartnerCam2
              localCameraStream={localCameraStream}
              isCameraOn={mediaState.isCameraOn}
              isMicOn={mediaState.isMicOn}
            />
          </div>

          {/* COMPACT CHAT (REMAINING HEIGHT) */}
          <div className="sidebar-chat-slot">
            <Chat
              messages={messages}
              onSendMessage={sendMessage}
              partnerConnected={partnerConnected}
            />
          </div>
        </aside>
      </div>

      {/* 3. FULL-WIDTH BOTTOM CONTROLS */}
      <footer className="room-controls-container">
        <Controls
          isHost={isHost}
          mediaState={mediaState}
          onToggleCamera={toggleCamera}
          onToggleMic={toggleMic}
          onToggleScreenShare={stopMovieStreaming}
          onLeaveRoom={handleLeaveRoom}
        />
      </footer>
    </div>
  );
};

export default App;
