import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  X,
  Link as LinkIcon,
  Film,
  Activity,
  Tv,
  Square,
  Volume2,
  ExternalLink,
} from 'lucide-react';
import { MediaSourceState } from '../types';
import { normalizeMediaUrl } from '../lib/mediaResolver';
import { WebRTCStats, MovieTabInfo } from '../hooks/useWebRTC';

interface ScreenShareViewProps {
  isHost: boolean;
  localMovieStream: MediaStream | null;
  remoteMovieStream: MediaStream | null;
  mediaSource: MediaSourceState | null;
  movieTabInfo: MovieTabInfo | null;
  isExtensionInstalled: boolean;
  captureState: string;
  webrtcStats: WebRTCStats;
  onOpenMovieTab: (url: string) => void;
  onStopCinema: () => void;
  partnerConnected: boolean;
  connState?: string;
  iceState?: string;
  signalingState?: string;
  movieConnState?: string;
  movieIceState?: string;
  movieSignalingState?: string;
}

export const ScreenShareView: React.FC<ScreenShareViewProps> = ({
  isHost,
  localMovieStream,
  remoteMovieStream,
  movieTabInfo,
  isExtensionInstalled,
  captureState,
  webrtcStats,
  onOpenMovieTab,
  onStopCinema,
  partnerConnected: _partnerConnected,
  connState = 'unknown',
  iceState = 'unknown',
  signalingState = 'unknown',
  movieConnState = 'unknown',
  movieIceState = 'unknown',
  movieSignalingState = 'unknown',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const hostMovieVideoRef = useRef<HTMLVideoElement>(null);
  const partnerMovieVideoRef = useRef<HTMLVideoElement>(null);

  // Single URL Input State
  const [inputUrl, setInputUrl] = useState('');
  const [urlNotice, setUrlNotice] = useState<string | null>(null);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [isPartnerAutoplayBlocked, setIsPartnerAutoplayBlocked] = useState(false);

  // Live video element diagnostics
  const [playerMetrics, setPlayerMetrics] = useState({
    videoWidth: 0,
    videoHeight: 0,
    readyState: 0,
    paused: true,
  });

  // Attach local movie stream to Host preview video
  useEffect(() => {
    const video = hostMovieVideoRef.current;
    if (!video || !isHost) return;

    if (localMovieStream) {
      if (video.srcObject !== localMovieStream) {
        video.srcObject = localMovieStream;
      }
      video.play().catch((e) => console.log('[HOST MOVIE PREVIEW] play error:', e?.name));
    } else {
      video.srcObject = null;
    }
  }, [localMovieStream, isHost]);

  // Attach remote movie stream to Partner movie video
  useEffect(() => {
    const video = partnerMovieVideoRef.current;
    if (!video || isHost) return;

    if (remoteMovieStream && remoteMovieStream.getVideoTracks().length > 0) {
      if (video.srcObject !== remoteMovieStream) {
        video.srcObject = remoteMovieStream;
      }
      video.muted = false;
      video
        .play()
        .then(() => {
          setIsPartnerAutoplayBlocked(false);
        })
        .catch((err) => {
          console.warn('[PARTNER MOVIE] Autoplay with sound restricted:', err?.name);
          // Fallback to muted playback if audio policy blocked it
          video.muted = true;
          video
            .play()
            .then(() => {
              setIsPartnerAutoplayBlocked(true);
            })
            .catch((e) => console.error('[PARTNER MOVIE] play failed:', e));
        });
    } else {
      video.srcObject = null;
      setIsPartnerAutoplayBlocked(false);
    }
  }, [remoteMovieStream, isHost]);

  // Track player metrics for DEV diagnostics
  useEffect(() => {
    const video = isHost ? hostMovieVideoRef.current : partnerMovieVideoRef.current;
    if (!video) return;

    const updateMetrics = () => {
      setPlayerMetrics({
        videoWidth: video.videoWidth || 0,
        videoHeight: video.videoHeight || 0,
        readyState: video.readyState,
        paused: video.paused,
      });
    };

    video.addEventListener('loadedmetadata', updateMetrics);
    video.addEventListener('resize', updateMetrics);
    video.addEventListener('playing', updateMetrics);
    video.addEventListener('pause', updateMetrics);

    updateMetrics();

    return () => {
      video.removeEventListener('loadedmetadata', updateMetrics);
      video.removeEventListener('resize', updateMetrics);
      video.removeEventListener('playing', updateMetrics);
      video.removeEventListener('pause', updateMetrics);
    };
  }, [isHost, localMovieStream, remoteMovieStream]);

  // Handle URL Submit (Host)
  const handleOpenMovie = useCallback(() => {
    setUrlNotice(null);
    const raw = inputUrl.trim();

    if (!raw) {
      setUrlNotice('Please enter a movie or video URL.');
      return;
    }

    try {
      const normalized = normalizeMediaUrl(raw);
      onOpenMovieTab(normalized);
    } catch (err: any) {
      setUrlNotice(err?.message || 'Please enter a valid URL.');
    }
  }, [inputUrl, onOpenMovieTab]);

  const handlePartnerEnableAudio = () => {
    const video = partnerMovieVideoRef.current;
    if (!video) return;
    video.muted = false;
    setIsPartnerAutoplayBlocked(false);
  };

  const activeVideoTrack = isHost
    ? localMovieStream?.getVideoTracks()[0]
    : remoteMovieStream?.getVideoTracks()[0];
  const activeAudioTrack = isHost
    ? localMovieStream?.getAudioTracks()[0]
    : remoteMovieStream?.getAudioTracks()[0];
  const trackSettings = activeVideoTrack?.getSettings();

  return (
    <div className="movie-section-container" ref={containerRef} id="screen-stage">
      {/* =========================================================================
          HOST-ONLY SINGLE URL INPUT BAR
          ========================================================================= */}
      {isHost && (
        <div className="media-url-bar-container">
          <form
            className="media-url-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleOpenMovie();
            }}
          >
            <div className="media-url-input-wrap">
              <LinkIcon size={15} className="url-input-icon" />
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => {
                  setInputUrl(e.target.value);
                  if (urlNotice) setUrlNotice(null);
                }}
                placeholder="Paste any movie or video link (YouTube, Netflix, Prime, web page)..."
                className="media-url-input"
                id="movie-url-input"
                autoComplete="off"
              />
              {inputUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setInputUrl('');
                    setUrlNotice(null);
                  }}
                  className="url-clear-btn"
                  title="Clear input"
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
              <ExternalLink size={13} />
              <span>OPEN MOVIE</span>
            </button>
          </form>

          {urlNotice && <div className="url-error-msg">{urlNotice}</div>}
        </div>
      )}

      {/* =========================================================================
          MOVIE VIEWPORT: STABLE DOM STAGE
          ========================================================================= */}
      <div className="movie-viewport-stage">
        {isHost ? (
          /* ---------------------------------------------------------------------
             HOST VIEW: LOCAL MOVIE STREAM PREVIEW / EXTENSION INSTRUCTION / EMPTY STAGE
             --------------------------------------------------------------------- */
          localMovieStream ? (
            <div className="media-player-wrapper host-cinema-wrapper">
              <video
                ref={hostMovieVideoRef}
                autoPlay
                playsInline
                muted
                className="screen-video live-cinema-video"
                id="host-movie-video"
              />

              {/* Host Live Cinema Overlay Bar */}
              <div className="host-cinema-overlay-bar">
                <div className="cinema-live-indicator">
                  <span className="live-dot" />
                  <span className="live-text">CINEMA STREAMING TO PARTNER</span>
                </div>
                <button
                  type="button"
                  onClick={onStopCinema}
                  className="btn-stop-cinema-overlay"
                  title="Stop streaming movie"
                >
                  <Square size={13} fill="currentColor" />
                  <span>STOP CINEMA</span>
                </button>
              </div>
            </div>
          ) : movieTabInfo?.url ? (
            /* INSTRUCTION CARD: WAITING FOR HOST TO CLICK EXTENSION */
            <div className="empty-stage-card tab-opened-card">
              <div className="empty-stage-marquee-icon">
                <Tv size={36} className="marquee-film-icon text-accent" />
              </div>
              <h2 className="empty-stage-title">Movie tab opened!</h2>
              <div className="tab-instruction-steps">
                <div className="instruction-step">
                  <span className="step-num">1</span>
                  <span>Switch to the movie tab: <strong>{movieTabInfo.title || movieTabInfo.url}</strong></span>
                </div>
                <div className="instruction-step">
                  <span className="step-num">2</span>
                  <span>Click the <strong>WatchTogether Cinema</strong> extension icon in your Chrome toolbar</span>
                </div>
                <div className="instruction-step">
                  <span className="step-num">3</span>
                  <span>Click <strong>START CINEMA</strong> to stream the tab video and audio live</span>
                </div>
              </div>

              {!isExtensionInstalled && (
                <p className="extension-missing-note">
                  Tip: Make sure the WatchTogether Chrome extension is loaded in chrome://extensions.
                </p>
              )}
            </div>
          ) : (
            /* HOST COMPACT ELEGANT EMPTY CINEMA STAGE */
            <div className="empty-stage-card">
              <div className="empty-stage-marquee-icon">
                <Film size={36} className="marquee-film-icon" />
              </div>
              <h2 className="empty-stage-title">What's on tonight?</h2>
              <p className="empty-stage-desc">
                Paste any movie or video link above and click <strong>OPEN MOVIE</strong>. Then start Cinema from the extension to stream live!
              </p>
            </div>
          )
        ) : (
          /* ---------------------------------------------------------------------
             PARTNER VIEW: READ-ONLY LIVE STREAMED MOVIE (NO CONTROLS)
             --------------------------------------------------------------------- */
          <div className="media-player-wrapper partner-cinema-wrapper">
            <video
              ref={partnerMovieVideoRef}
              autoPlay
              playsInline
              controls={false}
              className={`screen-video presentation-video ${remoteMovieStream ? 'visible-movie' : 'hidden-movie'}`}
              id="partner-movie-video"
            />

            {/* Waiting state displayed while Host is not streaming */}
            {!remoteMovieStream && (
              <div className="empty-stage-card">
                <div className="empty-stage-marquee-icon">
                  <Film size={34} className="marquee-film-icon" />
                </div>
                <h2 className="empty-stage-title">Waiting for Host Movie...</h2>
                <p className="empty-stage-desc">
                  The Host controls the movie stream. As soon as the Host starts Cinema, the live movie stream will appear here in real time.
                </p>
              </div>
            )}

            {/* Autoplay blocked banner with tap-to-start audio */}
            {isPartnerAutoplayBlocked && remoteMovieStream && (
              <div className="partner-audio-notice-bar">
                <button
                  type="button"
                  onClick={handlePartnerEnableAudio}
                  className="btn-enable-audio-pill"
                  title="Enable movie audio"
                  id="enable-movie-audio-btn"
                >
                  <Volume2 size={15} />
                  <span>Tap once to start movie audio</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            PART 14: DEVELOPMENT-ONLY DIAGNOSTICS (DEV Toggle)
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
                  <span className="diag-label">Capture State:</span>
                  <span className="diag-value">{captureState}</span>
                </div>

                {/* CAPTURE METRICS */}
                <div className="diag-item full-width">
                  <span className="diag-label">TAB:</span>
                  <span className="diag-value">
                    {movieTabInfo?.title || movieTabInfo?.url || 'none'} {movieTabInfo?.tabId ? `(id: ${movieTabInfo.tabId})` : ''}
                  </span>
                </div>
                <div className="diag-item">
                  <span className="diag-label">Video Track:</span>
                  <span className={`diag-value ${activeVideoTrack?.readyState === 'live' ? 'text-ok' : 'text-warn'}`}>
                    {activeVideoTrack?.readyState || 'none'}
                  </span>
                </div>
                <div className="diag-item">
                  <span className="diag-label">Audio Track:</span>
                  <span className={`diag-value ${activeAudioTrack?.readyState === 'live' ? 'text-ok' : 'text-muted'}`}>
                    {activeAudioTrack?.readyState || 'none'}
                  </span>
                </div>
                <div className="diag-item">
                  <span className="diag-label">Source Size:</span>
                  <span className="diag-value">
                    {trackSettings?.width ? `${trackSettings.width}x${trackSettings.height} @ ${trackSettings.frameRate?.toFixed(0)}fps` : 'none'}
                  </span>
                </div>

                {/* MOVIE PC STATES */}
                <div className="diag-item">
                  <span className="diag-label">Movie PC Conn:</span>
                  <span className={`diag-value ${movieConnState === 'connected' ? 'text-ok' : 'text-warn'}`}>
                    {movieConnState}
                  </span>
                </div>
                <div className="diag-item">
                  <span className="diag-label">Movie ICE:</span>
                  <span className="diag-value">{movieIceState}</span>
                </div>
                <div className="diag-item">
                  <span className="diag-label">Movie Signaling:</span>
                  <span className="diag-value">{movieSignalingState}</span>
                </div>

                {/* CAMERA & CHAT PC STATES */}
                <div className="diag-item">
                  <span className="diag-label">Camera Conn:</span>
                  <span className="diag-value">{connState}</span>
                </div>
                <div className="diag-item">
                  <span className="diag-label">Camera ICE:</span>
                  <span className="diag-value">{iceState}</span>
                </div>
                <div className="diag-item">
                  <span className="diag-label">Camera Signaling:</span>
                  <span className="diag-value">{signalingState}</span>
                </div>

                {/* OUTBOUND / INBOUND WEBRTC STATS */}
                {isHost ? (
                  <>
                    <div className="diag-item">
                      <span className="diag-label">Frames Sent:</span>
                      <span className="diag-value">{webrtcStats.framesSent}</span>
                    </div>
                    <div className="diag-item">
                      <span className="diag-label">Frames Encoded:</span>
                      <span className="diag-value">{webrtcStats.framesEncoded}</span>
                    </div>
                    <div className="diag-item">
                      <span className="diag-label">Outbound Res:</span>
                      <span className="diag-value">
                        {webrtcStats.outboundWidth}x{webrtcStats.outboundHeight} @ {webrtcStats.outboundFps}fps
                      </span>
                    </div>
                    <div className="diag-item">
                      <span className="diag-label">Bytes Sent:</span>
                      <span className="diag-value">{(webrtcStats.bytesSent / (1024 * 1024)).toFixed(2)} MB</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="diag-item">
                      <span className="diag-label">Frames Received:</span>
                      <span className="diag-value">{webrtcStats.framesReceived}</span>
                    </div>
                    <div className="diag-item">
                      <span className="diag-label">Frames Decoded:</span>
                      <span className="diag-value">{webrtcStats.framesDecoded}</span>
                    </div>
                    <div className="diag-item">
                      <span className="diag-label">Inbound Res:</span>
                      <span className="diag-value">
                        {webrtcStats.inboundWidth}x{webrtcStats.inboundHeight} @ {webrtcStats.inboundFps}fps
                      </span>
                    </div>
                    <div className="diag-item">
                      <span className="diag-label">Bytes Received:</span>
                      <span className="diag-value">{(webrtcStats.bytesReceived / (1024 * 1024)).toFixed(2)} MB</span>
                    </div>
                    <div className="diag-item">
                      <span className="diag-label">Packets Lost:</span>
                      <span className="diag-value">{webrtcStats.packetsLost}</span>
                    </div>
                  </>
                )}

                {/* PLAYER METRICS */}
                <div className="diag-item">
                  <span className="diag-label">Player Res:</span>
                  <span className="diag-value">{playerMetrics.videoWidth}x{playerMetrics.videoHeight}</span>
                </div>
                <div className="diag-item">
                  <span className="diag-label">Player State:</span>
                  <span className="diag-value">Ready:{playerMetrics.readyState} | Paused:{playerMetrics.paused ? 'YES' : 'NO'}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

