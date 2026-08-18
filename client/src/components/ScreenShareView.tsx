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
  Tv,
  Plus,
  Heart,
  Sparkles,
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
  onStartShare?: () => void;
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
  onStartShare: _onStartShare,
  partnerConnected,
  connState = 'unknown',
  iceState = 'unknown',
  signalingState = 'unknown',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const hostVideoRef = useRef<HTMLVideoElement>(null);
  const remoteMovieVideoRef = useRef<HTMLVideoElement>(null);
  const localScreenVideoRef = useRef<HTMLVideoElement>(null);

  // Modal & Input states
  const [isAddMovieModalOpen, setIsAddMovieModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'link' | 'tab'>('link');
  const [inputUrl, setInputUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  // Cinema start announcement toast ("Lights down... Movie time ❤️")
  const [cinemaToast, setCinemaToast] = useState<string | null>(null);

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
      triggerCinemaToast();
      onStartStreaming(stream);
      setIsAddMovieModalOpen(false);
    });

    return () => {
      unsubStatus();
      unsubStream();
    };
  }, [onStartStreaming]);

  // Brief subtle toast when cinema starts
  const triggerCinemaToast = () => {
    setCinemaToast('Lights down... Movie time ❤️');
    setTimeout(() => {
      setCinemaToast(null);
    }, 1800);
  };

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
          triggerCinemaToast();
          onStartStreaming(stream);
        }
      } catch (err) {
        console.warn('[HOST MOVIE] captureStream error:', err);
      }
    }
  }, [isHost, onStartStreaming]);

  const handleHostLoadedMetadata = () => {
    const video = hostVideoRef.current;
    if (!video) return;

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
      setIsPlaybackBlocked(false);
      setIsAudioBlocked(false);
      setPlayStatus('SUCCESS');
    } catch (err) {
      console.error('[PARTNER MOVIE] manual play error:', err);
    }
  };

  // Host: Open Movie (Determines direct MP4 vs Webpage Tab)
  const handleOpenUrl = useCallback(async () => {
    setUrlError(null);
    const raw = inputUrl.trim();

    if (!raw) {
      setUrlError('Please enter a movie link or webpage URL.');
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
      } else if (resolved.type === 'direct-video') {
        setIsAddMovieModalOpen(false);
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
      triggerCinemaToast();
      onStartStreaming(stream);
      setIsCapturingTab(false);
      setIsAddMovieModalOpen(false);
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
      {/* Toast Announcement when Cinema starts */}
      {cinemaToast && (
        <div className="cinema-toast-announcement">
          <Sparkles size={16} className="toast-sparkle" />
          <span>{cinemaToast}</span>
        </div>
      )}

      {/* =========================================================================
          MOVIE VIEWPORT AREA: EXACTLY ONE VIDEO ELEMENT FOR ACTIVE VIEWER
          ========================================================================= */}
      <div className="movie-viewport-stage">
        {isHost ? (
          /* ---------------------------------------------------------------------
             HOST VIEW: EXACTLY ONE MOVIE OR ACTIVE STREAM OR CLEAN EMPTY STAGE
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
                onError={handleHostError}
                onTimeUpdate={handleHostTimeUpdate}
                className="screen-video direct-video-player"
                id="host-movie-video"
              />
              <div className="cinema-live-floating-badge">
                <span className="live-dot"></span>
                <span>Cinema Active • Streaming</span>
                <button
                  onClick={handleClearMedia}
                  className="btn-badge-stop"
                  title="Close movie"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          ) : isHostStreaming ? (
            /* HOST ACTIVE TAB CINEMA (LIVE STREAM) */
            <div className="media-player-wrapper">
              <div className="cinema-live-floating-badge">
                <span className="live-dot"></span>
                <span>Cinema Active • Streaming to Partner</span>
                <button
                  onClick={handleClearMedia}
                  className="btn-badge-stop"
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
          ) : (
            /* HOST COMPACT ELEGANT EMPTY STAGE */
            <div className="empty-stage-card">
              <div className="empty-stage-marquee-icon">
                <Film size={36} className="marquee-film-icon" />
              </div>
              <h2 className="empty-stage-title">What's on tonight?</h2>
              <p className="empty-stage-desc">
                Add a movie when you're ready.
              </p>
              <div className="empty-stage-actions">
                <button
                  onClick={() => {
                    setUrlError(null);
                    setIsAddMovieModalOpen(true);
                  }}
                  className="btn-add-movie-primary"
                  id="open-add-movie-modal-btn"
                >
                  <Plus size={16} />
                  <span>Add Movie</span>
                </button>
                <button
                  onClick={handleDirectTabCapture}
                  className="btn-share-tab-link"
                  id="share-tab-direct-btn"
                >
                  or share a browser tab
                </button>
              </div>
            </div>
          )
        ) : (
          /* ---------------------------------------------------------------------
             PARTNER VIEW: EXACTLY ONE REMOTE MOVIE VIDEO OR WAITING STAGE
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

              {/* Audio Enable Pill if browser policy muted audio */}
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

              {/* Playback Blocked Overlay */}
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
              <div className="empty-stage-marquee-icon">
                <Heart size={34} className="marquee-heart-icon" />
              </div>
              <h2 className="empty-stage-title">Waiting for your person...</h2>
              <p className="empty-stage-desc">
                Your partner will choose and start the movie. Sit back, talk, and enjoy!
              </p>
            </div>
          )
        )}

        {/* Fullscreen Floating Button */}
        <button
          onClick={toggleFullscreen}
          className="stage-fullscreen-floating-btn"
          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>

        {/* =========================================================================
            "+ ADD MOVIE" MODAL (Host Only)
            ========================================================================= */}
        {isHost && isAddMovieModalOpen && (
          <div className="modal-backdrop" onClick={() => setIsAddMovieModalOpen(false)}>
            <div
              className="modal-cinema-dialog"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-labelledby="modal-title"
            >
              <div className="modal-header">
                <div className="modal-title-wrap">
                  <Film size={18} className="modal-title-icon" />
                  <h3 id="modal-title" className="modal-title">What are we watching?</h3>
                </div>
                <button
                  onClick={() => setIsAddMovieModalOpen(false)}
                  className="modal-close-btn"
                  title="Close"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Tabs */}
              <div className="modal-tab-nav">
                <button
                  onClick={() => setModalTab('link')}
                  className={`modal-tab-btn ${modalTab === 'link' ? 'active' : ''}`}
                >
                  <LinkIcon size={15} />
                  <span>Movie Link</span>
                </button>
                <button
                  onClick={() => setModalTab('tab')}
                  className={`modal-tab-btn ${modalTab === 'tab' ? 'active' : ''}`}
                >
                  <Tv size={15} />
                  <span>Browser Tab</span>
                </button>
              </div>

              {/* Tab 1: Movie Link */}
              {modalTab === 'link' && (
                <div className="modal-tab-content">
                  <p className="modal-instructions">
                    Paste a direct video file (.mp4) or a movie player webpage link:
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleOpenUrl();
                    }}
                    className="modal-url-form"
                  >
                    <div className="modal-input-wrap">
                      <LinkIcon size={16} className="modal-input-icon" />
                      <input
                        type="text"
                        value={inputUrl}
                        onChange={(e) => {
                          setInputUrl(e.target.value);
                          if (urlError) setUrlError(null);
                        }}
                        placeholder="https://... (.mp4 or movie site link)"
                        className="modal-text-input"
                        autoFocus
                      />
                    </div>
                    {urlError && <div className="modal-error-text">{urlError}</div>}

                    {movieTabOpened && (
                      <div className="modal-movie-tab-ready-box">
                        <div className="ready-box-header">
                          <Sparkles size={15} className="ready-sparkle" />
                          <span>Movie Tab Ready</span>
                        </div>
                        <p className="ready-box-desc">
                          Switch to the movie tab in Chrome, click the WatchTogether extension icon in your toolbar, and click <strong>START CINEMA</strong>!
                        </p>
                      </div>
                    )}

                    <div className="modal-action-row">
                      <button
                        type="submit"
                        disabled={!inputUrl.trim()}
                        className="btn-modal-primary"
                      >
                        <Play size={15} />
                        <span>Open Movie</span>
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Tab 2: Browser Tab */}
              {modalTab === 'tab' && (
                <div className="modal-tab-content">
                  <p className="modal-instructions">
                    Already have Netflix, YouTube, or your movie playing in another browser tab?
                  </p>
                  <div className="modal-tab-share-box">
                    <div className="tab-share-icon-circle">
                      <Tv size={26} />
                    </div>
                    <h4 className="tab-share-title">Stream Any Browser Tab</h4>
                    <p className="tab-share-desc">
                      Share the movie tab with crystal-clear video and synchronized tab audio.
                    </p>
                    <button
                      type="button"
                      onClick={handleDirectTabCapture}
                      disabled={isCapturingTab}
                      className="btn-modal-primary"
                    >
                      <Tv size={16} />
                      <span>{isCapturingTab ? 'Starting Cinema...' : '🎬 Start Cinema'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =========================================================================
            DEVELOPMENT DIAGNOSTICS (DEV Toggle Only)
            ========================================================================= */}
        <div className="cinema-dev-pill-wrap">
          <button
            type="button"
            onClick={() => setShowDebugPanel((prev) => !prev)}
            className="cinema-dev-pill-btn"
            title="Toggle Developer Diagnostics"
          >
            <Activity size={11} />
            <span>DEV</span>
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
                      <span className="diag-label">Partner:</span>
                      <span className={`diag-value ${partnerConnected ? 'text-ok' : 'text-warn'}`}>
                        {partnerConnected ? 'CONNECTED' : 'WAITING'}
                      </span>
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
                      <span className="diag-label">Play status:</span>
                      <span className="diag-value">{playStatus}</span>
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
