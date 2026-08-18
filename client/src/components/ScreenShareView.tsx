import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Maximize2,
  Minimize2,
  Play,
  X,
  Link as LinkIcon,
  Film,
  Volume2,
  Activity,
  ChevronDown,
  ChevronUp,
  Tv,
  Radio,
  ExternalLink,
} from 'lucide-react';
import { MediaSourceState } from '../types';
import { loadMovieFromUrl, normalizeMediaUrl } from '../lib/mediaResolver';
import {
  subscribeToExtensionStatus,
  openMovieTabInExtension,
  startDirectTabCapture,
  onExtensionStreamCaptured,
  stopTabCaptureInExtension,
  pingExtension,
} from '../lib/extensionBridge';

interface ScreenShareViewProps {
  isHost: boolean;
  remoteScreenStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  localIsScreenSharing: boolean;
  mediaSource: MediaSourceState | null;
  onSetMediaSource: (source: MediaSourceState | null) => void;
  onStartStreaming: (stream: MediaStream) => void;
  onStopStreaming: () => void;
  onStartShare: () => void;
  partnerConnected: boolean;
  connState?: string;
  iceState?: string;
  signalingState?: string;
}

export const ScreenShareView: React.FC<ScreenShareViewProps> = ({
  isHost,
  remoteScreenStream,
  localScreenStream,
  localIsScreenSharing,
  mediaSource,
  onSetMediaSource,
  onStartStreaming,
  onStopStreaming,
  partnerConnected,
  connState = 'unknown',
  iceState = 'unknown',
  signalingState = 'unknown',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const hostVideoRef = useRef<HTMLVideoElement>(null);
  const remoteMovieVideoRef = useRef<HTMLVideoElement>(null);
  const localScreenVideoRef = useRef<HTMLVideoElement>(null);

  const [inputUrl, setInputUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  // Extension status & Cinema Tab
  const [extensionInstalled, setExtensionInstalled] = useState(false);
  const [movieTabOpened, setMovieTabOpened] = useState(false);
  const [openedTabId, setOpenedTabId] = useState<number | undefined>(undefined);
  const [isCapturingTab, setIsCapturingTab] = useState(false);

  // Playback & Audio states
  const [playStatus, setPlayStatus] = useState<'IDLE' | 'PENDING' | 'SUCCESS' | 'NOT_ALLOWED' | 'ERROR'>('IDLE');
  const [isAudioBlocked, setIsAudioBlocked] = useState(false);
  const [isPlaybackBlocked, setIsPlaybackBlocked] = useState(false);

  // Live Metrics for Diagnostics
  const [hostMetrics, setHostMetrics] = useState({
    readyState: 0,
    networkState: 0,
    paused: true,
    currentTime: 0,
    duration: 0,
    videoWidth: 0,
    videoHeight: 0,
  });

  const [partnerMetrics, setPartnerMetrics] = useState({
    readyState: 0,
    networkState: 0,
    paused: true,
    currentTime: 0,
    duration: 0,
    videoWidth: 0,
    videoHeight: 0,
  });

  // Track extension status & stream capture notifications from extension
  useEffect(() => {
    pingExtension();
    const unsubStatus = subscribeToExtensionStatus((status) => {
      setExtensionInstalled(status.isInstalled);
    });

    const unsubStream = onExtensionStreamCaptured((stream) => {
      console.log('[ScreenShareView] Received tab stream from extension');
      onStartStreaming(stream);
    });

    return () => {
      unsubStatus();
      unsubStream();
    };
  }, [onStartStreaming]);

  // Sync inputUrl with mediaSource if input is empty
  useEffect(() => {
    if (mediaSource?.url && !inputUrl) {
      setInputUrl(mediaSource.url);
    }
  }, [mediaSource?.url]);

  // =========================================================================
  // HOST: DIRECT VIDEO CAPTURE & STREAMING LIFECYCLE
  // =========================================================================
  const handleCaptureHostVideo = useCallback(() => {
    const video = hostVideoRef.current;
    if (!video || !isHost) return;

    console.log(`[HOST MOVIE] video dimensions: ${video.videoWidth} x ${video.videoHeight}`);
    console.log('[HOST MOVIE] currentTime:', video.currentTime);

    const captureFn = (video as any).captureStream || (video as any).mozCaptureStream;
    if (typeof captureFn === 'function') {
      try {
        const stream: MediaStream = captureFn.call(video);
        const videoTracks = stream.getVideoTracks();
        const audioTracks = stream.getAudioTracks();

        console.log(`[HOST MOVIE] captureStream tracks: video=${videoTracks.length} audio=${audioTracks.length}`);

        if (videoTracks.length > 0) {
          onStartStreaming(stream);
        }
      } catch (err) {
        console.warn('[HOST MOVIE] captureStream error:', err);
      }
    } else {
      console.warn('[HOST MOVIE] captureStream not supported in this browser.');
    }
  }, [isHost, onStartStreaming]);

  const handleHostLoadedMetadata = () => {
    const video = hostVideoRef.current;
    if (!video) return;

    console.log(`[HOST MOVIE] loadedmetadata: ${video.videoWidth} x ${video.videoHeight}`);
    setHostMetrics((prev) => ({
      ...prev,
      readyState: video.readyState,
      networkState: video.networkState,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      duration: video.duration || 0,
      paused: video.paused,
    }));

    handleCaptureHostVideo();

    video.play().catch((err) => {
      console.log('[HOST MOVIE] Autoplay prompt needed:', err?.name);
    });
  };

  const handleHostCanPlay = () => {
    handleCaptureHostVideo();
  };

  const handleHostPlaying = () => {
    console.log('[HOST MOVIE] playing');
    handleCaptureHostVideo();
  };

  const handleHostTimeUpdate = () => {
    const video = hostVideoRef.current;
    if (!video) return;
    setHostMetrics({
      readyState: video.readyState,
      networkState: video.networkState,
      paused: video.paused,
      currentTime: video.currentTime,
      duration: video.duration || 0,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
    });
  };

  const handleHostError = () => {
    const video = hostVideoRef.current;
    const error = video?.error;
    console.error('[HOST MOVIE ERROR]', {
      code: error?.code,
      message: error?.message,
      currentSrc: video?.currentSrc,
    });
    if (error) {
      setUrlError(`Video could not be loaded (Error code ${error.code}). The source may block browser playback.`);
    }
  };

  // Attach local stream preview (when Host shares Screen/Tab)
  useEffect(() => {
    if (localScreenVideoRef.current && localScreenStream) {
      localScreenVideoRef.current.srcObject = localScreenStream;
      localScreenVideoRef.current.play().catch((err) => {
        console.warn('[ScreenShare] Local preview autoPlay warning:', err);
      });
    }
  }, [localScreenStream]);

  // =========================================================================
  // PARTNER: REMOTE MOVIE PLAYBACK PIPELINE
  // =========================================================================
  useEffect(() => {
    const video = remoteMovieVideoRef.current;
    if (!video || isHost) return;

    if (!remoteScreenStream) {
      if (video.srcObject) {
        const oldStream = video.srcObject as MediaStream;
        oldStream.getTracks().forEach((track) => track.stop());
        video.srcObject = null;
      }
      setPlayStatus('IDLE');
      setIsPlaybackBlocked(false);
      setIsAudioBlocked(false);
      return;
    }

    video.srcObject = remoteScreenStream;
    console.log('[PARTNER MOVIE] srcObject attached');

    const vTracks = remoteScreenStream.getVideoTracks();
    const aTracks = remoteScreenStream.getAudioTracks();
    console.log(`[PARTNER MOVIE] remote stream tracks: video=${vTracks.length} audio=${aTracks.length}`);

    video.autoplay = true;
    video.playsInline = true;
    video.controls = false;

    let isSubscribed = true;

    const attemptPlayback = async () => {
      if (!isSubscribed) return;
      setPlayStatus('PENDING');

      try {
        video.muted = true;
        await video.play();
        console.log('[PARTNER MOVIE] PLAYING');
        console.log(`[PARTNER MOVIE] video dimensions: ${video.videoWidth} x ${video.videoHeight}`);

        if (isSubscribed) {
          setPlayStatus('SUCCESS');
          setIsPlaybackBlocked(false);
        }

        try {
          video.muted = false;
          if (isSubscribed) setIsAudioBlocked(false);
        } catch {
          video.muted = true;
          if (isSubscribed) setIsAudioBlocked(true);
        }
      } catch (err: any) {
        console.error('[PARTNER MOVIE] autoplay failed', err);
        if (isSubscribed) {
          if (err?.name === 'NotAllowedError') {
            setPlayStatus('NOT_ALLOWED');
            setIsPlaybackBlocked(true);
          } else {
            setPlayStatus('ERROR');
          }
        }
      }
    };

    const onLoadedMetadata = () => {
      console.log(`[PARTNER MOVIE] video dimensions: ${video.videoWidth} x ${video.videoHeight}`);
      setPartnerMetrics((prev) => ({
        ...prev,
        readyState: video.readyState,
        networkState: video.networkState,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        duration: video.duration || 0,
      }));
      attemptPlayback();
    };

    const onCanPlay = () => {
      attemptPlayback();
    };

    const onTimeUpdate = () => {
      setPartnerMetrics({
        readyState: video.readyState,
        networkState: video.networkState,
        paused: video.paused,
        currentTime: video.currentTime,
        duration: video.duration || 0,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
      });
    };

    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('timeupdate', onTimeUpdate);

    if (video.readyState >= 2) {
      onLoadedMetadata();
    }

    return () => {
      isSubscribed = false;
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('timeupdate', onTimeUpdate);
    };
  }, [remoteScreenStream, isHost]);

  // Partner Manual Enable Sound
  const handleEnableMovieAudio = () => {
    const video = remoteMovieVideoRef.current;
    if (!video) return;
    video.muted = false;
    setIsAudioBlocked(false);
  };

  // Partner Manual Enable Playback
  const handleEnableMoviePlayback = async () => {
    const video = remoteMovieVideoRef.current;
    if (!video) return;
    try {
      video.muted = false;
      await video.play();
      console.log('[PARTNER MOVIE] PLAYING');
      setIsPlaybackBlocked(false);
      setIsAudioBlocked(false);
      setPlayStatus('SUCCESS');
    } catch (err) {
      console.error('[PARTNER MOVIE] manual play error:', err);
    }
  };

  // Host: Open Movie (Opens tab in Chrome)
  const handleOpenUrl = useCallback(async () => {
    setUrlError(null);
    const raw = inputUrl.trim();

    if (!raw) {
      setUrlError('Please enter a video or website URL.');
      return;
    }

    try {
      const normalized = normalizeMediaUrl(raw);
      const resolved = loadMovieFromUrl(normalized);
      onSetMediaSource(resolved);
      setInputUrl(resolved.url);

      if (resolved.type === 'webpage') {
        const extPing = await pingExtension();
        if (extPing) {
          const res = await openMovieTabInExtension(resolved.url);
          if (res.success) {
            setMovieTabOpened(true);
            setOpenedTabId(res.tabId);
          } else {
            window.open(resolved.url, '_blank', 'noopener,noreferrer');
            setMovieTabOpened(true);
          }
        } else {
          window.open(resolved.url, '_blank', 'noopener,noreferrer');
          setMovieTabOpened(true);
        }
      }
    } catch (err: any) {
      setUrlError(err?.message || 'Please enter a valid URL.');
    }
  }, [inputUrl, onSetMediaSource]);

  // Host: Start Cinema Tab Capture directly
  const handleDirectTabCapture = async () => {
    try {
      setUrlError(null);
      setIsCapturingTab(true);
      const stream = await startDirectTabCapture();
      onStartStreaming(stream);
      setIsCapturingTab(false);
    } catch (err: any) {
      setIsCapturingTab(false);
      if (err?.name !== 'NotAllowedError') {
        console.error('[ScreenShareView] Direct tab capture error:', err);
        setUrlError('Could not capture tab: ' + (err?.message || 'Please retry.'));
      }
    }
  };

  // Host: Clear / Stop current media
  const handleClearMedia = useCallback(() => {
    onSetMediaSource(null);
    setInputUrl('');
    setUrlError(null);
    setMovieTabOpened(false);
    setOpenedTabId(undefined);
    stopTabCaptureInExtension();
    onStopStreaming();
  }, [onSetMediaSource, onStopStreaming]);

  // Fullscreen
  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error('Fullscreen toggle error:', err);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const remoteVideoTrack = remoteScreenStream?.getVideoTracks()[0] || null;
  const remoteAudioTrack = remoteScreenStream?.getAudioTracks()[0] || null;
  const isHostStreaming = isHost && localScreenStream && (localIsScreenSharing || mediaSource);

  return (
    <div className="movie-section-container" ref={containerRef} id="screen-stage">
      {/* =========================================================================
          HOST-ONLY TOP: NORMALIZED URL INPUT BAR
          ========================================================================= */}
      {isHost && (
        <div className="media-url-bar-container">
          <form
            className="media-url-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleOpenUrl();
            }}
          >
            <div className="media-url-input-wrap">
              <LinkIcon size={15} className="url-input-icon" />
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => {
                  setInputUrl(e.target.value);
                  if (urlError) setUrlError(null);
                }}
                placeholder="Host: Paste direct video (.mp4) or movie website URL..."
                className="media-url-input"
                id="movie-url-input"
                autoComplete="off"
              />
              {mediaSource && (
                <button
                  type="button"
                  onClick={handleClearMedia}
                  className="url-clear-btn"
                  title="Clear current video"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={!inputUrl.trim()}
              className="btn-open-url"
              id="movie-url-open-btn"
            >
              <Play size={13} />
              <span>OPEN MOVIE</span>
            </button>
          </form>

          {urlError && <div className="url-error-msg">{urlError}</div>}
        </div>
      )}

      {/* =========================================================================
          MOVIE VIEWPORT AREA: EXACTLY ONE VIDEO ELEMENT FOR ACTIVE VIEWER
          ========================================================================= */}
      <div className="movie-viewport-stage">
        {isHost ? (
          /* ---------------------------------------------------------------------
             HOST VIEW: EXACTLY ONE MOVIE OR SCREEN SHARE OR WAITING CARD
             --------------------------------------------------------------------- */
          mediaSource?.type === 'direct-video' ? (
            /* HOST DIRECT MP4: Native HTML5 Video */
            <div className="media-player-wrapper host-cinema-wrapper">
              <video
                ref={hostVideoRef}
                src={mediaSource.url}
                crossOrigin="anonymous"
                controls
                playsInline
                preload="auto"
                onLoadedMetadata={handleHostLoadedMetadata}
                onCanPlay={handleHostCanPlay}
                onPlaying={handleHostPlaying}
                onPause={() => console.log('[HOST MOVIE] pause')}
                onSeeking={() => console.log('[HOST MOVIE] seeking')}
                onSeeked={() => console.log('[HOST MOVIE] seeked')}
                onError={handleHostError}
                onTimeUpdate={handleHostTimeUpdate}
                className="screen-video direct-video-player"
                id="host-movie-video"
              />
            </div>
          ) : isHostStreaming ? (
            /* HOST ACTIVE TAB CINEMA / SCREEN SHARE (LIVE PREVIEW) */
            <div className="media-player-wrapper">
              <div className="screen-presenter-bar">
                <div className="presenter-badge">
                  <Radio size={14} className="live-pulse-icon" />
                  <span>STREAMING TO PARTNER</span>
                </div>
                <button
                  onClick={handleClearMedia}
                  className="btn-stop-share-pill"
                  title="Stop Cinema streaming"
                  id="stop-cinema-badge-btn"
                >
                  Stop Cinema
                </button>
              </div>
              <video
                ref={localScreenVideoRef}
                className="screen-video presentation-video"
                autoPlay
                playsInline
                muted
                id="local-screen-video"
              />
            </div>
          ) : mediaSource?.type === 'webpage' ? (
            /* HOST WEBPAGE CINEMA READY CARD */
            <div className="unsupported-site-card">
              <div className="unsupported-icon-wrap">
                <Film size={36} className="unsupported-icon" />
              </div>
              <h3 className="unsupported-title">
                {movieTabOpened ? 'Movie Tab Ready' : 'Movie Website Detected'}
              </h3>
              <p className="unsupported-desc">
                {movieTabOpened
                  ? 'Switch to the movie tab in Chrome and click the WatchTogether extension icon in your toolbar, then click START CINEMA!'
                  : `Open ${mediaSource.title} in a browser tab to stream it to your partner.`}
              </p>

              {/* Action Buttons */}
              <div className="mode2-actions-group">
                <button
                  type="button"
                  onClick={handleDirectTabCapture}
                  disabled={isCapturingTab}
                  className="btn-primary-stage"
                  id="start-cinema-btn"
                >
                  <Tv size={18} />
                  <span>{isCapturingTab ? 'Starting Cinema...' : '🎬 START CINEMA'}</span>
                </button>

                {movieTabOpened && (
                  <button
                    type="button"
                    onClick={() => {
                      if (mediaSource?.url) window.open(mediaSource.url, '_blank', 'noopener,noreferrer');
                    }}
                    className="btn-secondary-stage"
                  >
                    <ExternalLink size={15} />
                    <span>Focus Movie Tab</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* HOST COMPACT EMPTY STAGE */
            <div className="empty-stage-card">
              <div className="empty-stage-icon-wrap">
                <Film size={44} className="empty-stage-icon" />
              </div>
              <h2 className="empty-stage-title">Watch Together Cinema</h2>
              <p className="empty-stage-desc">
                {partnerConnected
                  ? 'Paste a movie URL or direct video at the top and click OPEN MOVIE.'
                  : 'You are the Host. Waiting for your partner to join.'}
              </p>
              <div className="empty-stage-actions">
                <button
                  onClick={handleDirectTabCapture}
                  className="btn-primary-stage"
                  id="start-share-stage-btn"
                >
                  <Tv size={18} />
                  <span>Share Movie / Tab</span>
                </button>
              </div>
            </div>
          )
        ) : (
          /* ---------------------------------------------------------------------
             PARTNER VIEW: EXACTLY ONE REMOTE MOVIE VIDEO OR WAITING CARD
             --------------------------------------------------------------------- */
          remoteScreenStream ? (
            <div className="media-player-wrapper partner-cinema-wrapper">
              <video
                ref={remoteMovieVideoRef}
                className="screen-video presentation-video"
                autoPlay
                playsInline
                controls={false}
                id="partner-movie-video"
              />

              {/* Unobtrusive Audio Enable Pill if browser restricted audio */}
              {isAudioBlocked && !isPlaybackBlocked && (
                <div className="partner-audio-notice-bar">
                  <button
                    onClick={handleEnableMovieAudio}
                    className="btn-enable-audio-pill"
                    title="Enable movie sound"
                    id="enable-movie-audio-btn"
                  >
                    <Volume2 size={15} />
                    <span>ENABLE MOVIE AUDIO</span>
                  </button>
                </div>
              )}

              {/* Playback Blocked Overlay if browser gesture blocked initial video */}
              {isPlaybackBlocked && (
                <div className="partner-playback-blocked-overlay">
                  <button
                    onClick={handleEnableMoviePlayback}
                    className="btn-enable-movie-center"
                    id="enable-movie-video-btn"
                  >
                    <Play size={20} />
                    <span>Click to Enable Movie</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="empty-stage-card">
              <div className="empty-stage-icon-wrap">
                <Film size={44} className="empty-stage-icon" />
              </div>
              <h2 className="empty-stage-title">Waiting for Host Movie</h2>
              <p className="empty-stage-desc">
                The Host controls the movie stream. As soon as the Host starts a movie, it will play here in real time.
              </p>
            </div>
          )
        )}

        {/* Fullscreen Button */}
        <button
          onClick={toggleFullscreen}
          className="stage-fullscreen-floating-btn"
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>

        {/* =========================================================================
            DEVELOPMENT DIAGNOSTICS PANEL (Collapsible)
            ========================================================================= */}
        <div className="cinema-diag-wrapper">
          <button
            type="button"
            onClick={() => setShowDebugPanel((prev) => !prev)}
            className="cinema-diag-toggle-btn"
            title="Toggle Movie Stream Diagnostic Panel"
          >
            <Activity size={13} />
            <span>DEBUG: {isHost ? 'HOST' : 'PARTNER'}</span>
            {showDebugPanel ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          </button>

          {showDebugPanel && (
            <div className="cinema-diag-card">
              <div className="diag-grid">
                <div className="diag-item">
                  <span className="diag-label">ROLE:</span>
                  <span className="diag-value text-ok">{isHost ? 'HOST' : 'PARTNER'}</span>
                </div>
                <div className="diag-item">
                  <span className="diag-label">WebRTC conn:</span>
                  <span className="diag-value">{connState}</span>
                </div>
                <div className="diag-item">
                  <span className="diag-label">ICE state:</span>
                  <span className="diag-value">{iceState}</span>
                </div>
                <div className="diag-item">
                  <span className="diag-label">Signaling:</span>
                  <span className="diag-value">{signalingState}</span>
                </div>

                {isHost ? (
                  <>
                    <div className="diag-item full-width">
                      <span className="diag-label">URL:</span>
                      <span className="diag-value">{mediaSource?.url || 'none'}</span>
                    </div>
                    <div className="diag-item">
                      <span className="diag-label">Extension:</span>
                      <span className={`diag-value ${extensionInstalled ? 'text-ok' : 'text-warn'}`}>
                        {extensionInstalled ? 'CONNECTED' : 'NOT DETECTED'}
                      </span>
                    </div>
                    <div className="diag-item">
                      <span className="diag-label">Tab ID:</span>
                      <span className="diag-value">{openedTabId || 'none'}</span>
                    </div>
                    <div className="diag-item">
                      <span className="diag-label">Host size:</span>
                      <span className="diag-value">
                        {hostMetrics.videoWidth}x{hostMetrics.videoHeight}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="diag-item">
                      <span className="diag-label">Remote video:</span>
                      <span className={`diag-value ${remoteVideoTrack ? 'text-ok' : 'text-warn'}`}>
                        {remoteVideoTrack ? 'RECEIVED' : 'NOT RECEIVED'}
                      </span>
                    </div>
                    <div className="diag-item">
                      <span className="diag-label">Remote audio:</span>
                      <span className={`diag-value ${remoteAudioTrack ? 'text-ok' : 'text-muted'}`}>
                        {remoteAudioTrack ? 'RECEIVED' : 'NOT RECEIVED'}
                      </span>
                    </div>
                    <div className="diag-item">
                      <span className="diag-label">srcObject:</span>
                      <span className={`diag-value ${remoteScreenStream ? 'text-ok' : 'text-warn'}`}>
                        {remoteScreenStream ? 'MediaStream' : 'missing'}
                      </span>
                    </div>
                    <div className="diag-item">
                      <span className="diag-label">Partner play():</span>
                      <span
                        className={`diag-value ${
                          playStatus === 'SUCCESS'
                            ? 'text-ok'
                            : playStatus === 'NOT_ALLOWED'
                            ? 'text-warn'
                            : 'text-muted'
                        }`}
                      >
                        {playStatus}
                      </span>
                    </div>
                    <div className="diag-item">
                      <span className="diag-label">Partner time:</span>
                      <span className="diag-value">{partnerMetrics.currentTime.toFixed(1)}s</span>
                    </div>
                    <div className="diag-item">
                      <span className="diag-label">Partner size:</span>
                      <span className="diag-value">
                        {partnerMetrics.videoWidth}x{partnerMetrics.videoHeight}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
