import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Maximize2,
  Minimize2,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  X,
  Link as LinkIcon,
  Film,
  Activity,
  AlertCircle,
} from 'lucide-react';
import { MediaSourceState } from '../types';
import { resolveMovieSource, normalizeMediaUrl } from '../lib/mediaResolver';

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
  onSendMovieControl?: (action: 'play' | 'pause' | 'seek', currentTime: number) => void;
  partnerConnected: boolean;
  connState?: string;
  iceState?: string;
  signalingState?: string;
}

export const ScreenShareView: React.FC<ScreenShareViewProps> = ({
  isHost,
  remoteScreenStream,
  localScreenStream,
  localIsScreenSharing: _localIsScreenSharing,
  mediaSource,
  onSetMediaSource,
  onStartStreaming,
  onStopStreaming,
  onStartShare: _onStartShare,
  onSendMovieControl,
  partnerConnected,
  connState = 'unknown',
  iceState = 'unknown',
  signalingState = 'unknown',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const hostVideoRef = useRef<HTMLVideoElement>(null);
  const remoteMovieVideoRef = useRef<HTMLVideoElement>(null);
  const localScreenVideoRef = useRef<HTMLVideoElement>(null);

  // Single URL Input State
  const [inputUrl, setInputUrl] = useState('');
  const [urlNotice, setUrlNotice] = useState<string | null>(null);
  const [unsupportedMessage, setUnsupportedMessage] = useState<string | null>(null);
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  // Host Video Playback States
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1.0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Partner Playback & Audio states
  const [partnerPlayStatus, setPartnerPlayStatus] = useState<'IDLE' | 'PLAYING' | 'MUTED' | 'ERROR'>('IDLE');
  const [isPartnerAudioBlocked, setIsPartnerAudioBlocked] = useState(false);

  // Live Metrics for Diagnostics
  const [hostMetrics, setHostMetrics] = useState({
    videoWidth: 0,
    videoHeight: 0,
  });

  const [partnerMetrics, setPartnerMetrics] = useState({
    videoWidth: 0,
    videoHeight: 0,
    currentTime: 0,
  });

  // Sync inputUrl with mediaSource if present
  useEffect(() => {
    if (mediaSource?.url && !inputUrl) {
      setInputUrl(mediaSource.url);
    }
  }, [mediaSource?.url]);

  // =========================================================================
  // HOST: CAPTURESTREAM & MOVIE STREAMING PIPELINE
  // =========================================================================
  const captureAndStreamHostVideo = useCallback(() => {
    const video = hostVideoRef.current;
    if (!video || !isHost) return;

    console.log(`[HOST MOVIE] video dimensions: ${video.videoWidth} x ${video.videoHeight}`);

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
      setUrlNotice('Your browser does not support video stream capture. Please use Chrome, Edge, or Firefox.');
    }
  }, [isHost, onStartStreaming]);

  // Host Video Event Handlers
  const handleHostLoadedMetadata = () => {
    const video = hostVideoRef.current;
    if (!video) return;

    setDuration(video.duration || 0);
    setHostMetrics({
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
    });

    captureAndStreamHostVideo();

    video.play().catch((err) => {
      console.log('[HOST MOVIE] Autoplay prompt needed:', err?.name);
    });
  };

  const handleHostCanPlay = () => {
    captureAndStreamHostVideo();
  };

  const handleHostPlaying = () => {
    setIsPlaying(true);
    captureAndStreamHostVideo();
    onSendMovieControl?.('play', hostVideoRef.current?.currentTime || 0);
  };

  const handleHostPause = () => {
    setIsPlaying(false);
    onSendMovieControl?.('pause', hostVideoRef.current?.currentTime || 0);
  };

  const handleHostTimeUpdate = () => {
    const video = hostVideoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
  };

  const handleHostSeeked = () => {
    const video = hostVideoRef.current;
    if (!video) return;
    onSendMovieControl?.('seek', video.currentTime);
  };

  const handleHostError = () => {
    const video = hostVideoRef.current;
    const error = video?.error;
    if (error) {
      setUrlNotice(`Video could not be loaded (Error code ${error.code}). The source may block direct playback.`);
    }
  };

  // =========================================================================
  // HOST CONTROLS (PLAY, PAUSE, SEEK, SKIP 10S, VOLUME, SPEED, FULLSCREEN)
  // =========================================================================
  const togglePlayPause = () => {
    const video = hostVideoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play().catch((err) => console.warn('[HOST] Play error:', err));
    } else {
      video.pause();
    }
  };

  const skipBackward10 = () => {
    const video = hostVideoRef.current;
    if (!video) return;

    video.currentTime = Math.max(0, video.currentTime - 10);
    onSendMovieControl?.('seek', video.currentTime);
  };

  const skipForward10 = () => {
    const video = hostVideoRef.current;
    if (!video) return;

    video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
    onSendMovieControl?.('seek', video.currentTime);
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = hostVideoRef.current;
    if (!video) return;

    const newTime = parseFloat(e.target.value);
    video.currentTime = newTime;
    setCurrentTime(newTime);
    onSendMovieControl?.('seek', newTime);
  };

  const toggleMute = () => {
    const video = hostVideoRef.current;
    if (!video) return;

    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = hostVideoRef.current;
    if (!video) return;

    const newVol = parseFloat(e.target.value);
    video.volume = newVol;
    setVolume(newVol);
    if (newVol > 0 && video.muted) {
      video.muted = false;
      setIsMuted(false);
    }
  };

  const handleSpeedChange = (speed: number) => {
    const video = hostVideoRef.current;
    if (!video) return;

    video.playbackRate = speed;
    setPlaybackRate(speed);
  };

  const toggleHostFullscreen = async () => {
    const video = hostVideoRef.current;
    if (!video) return;

    try {
      if (!document.fullscreenElement) {
        if (video.requestFullscreen) {
          await video.requestFullscreen();
        } else if ((video as any).webkitRequestFullscreen) {
          await (video as any).webkitRequestFullscreen();
        }
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.warn('Fullscreen toggle error:', err);
    }
  };

  // =========================================================================
  // SINGLE URL OPEN HANDLER (RESOLVE MOVIE SOURCE)
  // =========================================================================
  const handleOpenMovie = useCallback(() => {
    setUrlNotice(null);
    setUnsupportedMessage(null);
    const raw = inputUrl.trim();

    if (!raw) {
      setUrlNotice('Please enter a video or movie link.');
      return;
    }

    try {
      const normalized = normalizeMediaUrl(raw);
      const resolved = resolveMovieSource(normalized);

      if (resolved.sourceType === 'direct-media') {
        onSetMediaSource({
          url: resolved.url,
          type: 'direct-video',
          title: resolved.title,
          currentTime: 0,
          isPlaying: false,
          updatedAt: Date.now(),
        });
        setInputUrl(resolved.url);
      } else {
        // Unsupported webpage
        setUnsupportedMessage(
          "That movie site can't be controlled directly here. Try a direct video link (.mp4) or a supported media stream."
        );
      }
    } catch (err: any) {
      setUrlNotice(err?.message || 'Please enter a valid URL.');
    }
  }, [inputUrl, onSetMediaSource]);

  const handleClearMovie = useCallback(() => {
    onSetMediaSource(null);
    setInputUrl('');
    setUrlNotice(null);
    setUnsupportedMessage(null);
    setIsPlaying(false);
    onStopStreaming();
  }, [onSetMediaSource, onStopStreaming]);

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
      setPartnerPlayStatus('IDLE');
      setIsPartnerAudioBlocked(false);
      return;
    }

    video.srcObject = remoteScreenStream;
    console.log('[PARTNER MOVIE] srcObject attached');

    video.autoplay = true;
    video.playsInline = true;
    video.controls = false;

    let isMounted = true;

    const playRemoteStream = async () => {
      if (!isMounted) return;
      try {
        video.muted = true;
        await video.play();
        console.log('[PARTNER MOVIE] PLAYING');

        if (isMounted) {
          setPartnerPlayStatus('PLAYING');
        }

        try {
          video.muted = false;
          if (isMounted) setIsPartnerAudioBlocked(false);
        } catch {
          video.muted = true;
          if (isMounted) setIsPartnerAudioBlocked(true);
        }
      } catch (err: any) {
        console.warn('[PARTNER MOVIE] Autoplay notice:', err);
        if (isMounted) {
          setPartnerPlayStatus('ERROR');
        }
      }
    };

    const onLoadedMetadata = () => {
      setPartnerMetrics((prev) => ({
        ...prev,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
      }));
      playRemoteStream();
    };

    const onTimeUpdate = () => {
      setPartnerMetrics((prev) => ({
        ...prev,
        currentTime: video.currentTime,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
      }));
    };

    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('canplay', playRemoteStream);
    video.addEventListener('timeupdate', onTimeUpdate);

    if (video.readyState >= 2) {
      onLoadedMetadata();
    }

    return () => {
      isMounted = false;
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('canplay', playRemoteStream);
      video.removeEventListener('timeupdate', onTimeUpdate);
    };
  }, [remoteScreenStream, isHost]);

  const handlePartnerEnableAudio = () => {
    const video = remoteMovieVideoRef.current;
    if (!video) return;
    video.muted = false;
    setIsPartnerAudioBlocked(false);
  };

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const remoteVideoTrack = remoteScreenStream?.getVideoTracks()[0] || null;
  const remoteAudioTrack = remoteScreenStream?.getAudioTracks()[0] || null;

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
                  if (unsupportedMessage) setUnsupportedMessage(null);
                }}
                placeholder="Paste direct movie link (e.g. .mp4, .webm)..."
                className="media-url-input"
                id="movie-url-input"
                autoComplete="off"
              />
              {mediaSource && (
                <button
                  type="button"
                  onClick={handleClearMovie}
                  className="url-clear-btn"
                  title="Close movie"
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
              <Play size={13} fill="currentColor" />
              <span>OPEN</span>
            </button>
          </form>

          {urlNotice && <div className="url-error-msg">{urlNotice}</div>}
        </div>
      )}

      {/* =========================================================================
          MOVIE VIEWPORT: EXACTLY ONE VIDEO ELEMENT FOR ACTIVE VIEWER
          ========================================================================= */}
      <div className="movie-viewport-stage">
        {isHost ? (
          /* ---------------------------------------------------------------------
             HOST VIEW: LOCAL PLAYER WITH FULL CONTROLS OR CLEAN EMPTY STAGE
             --------------------------------------------------------------------- */
          mediaSource?.type === 'direct-video' ? (
            <div className="media-player-wrapper host-cinema-wrapper">
              <video
                ref={hostVideoRef}
                src={mediaSource.url}
                crossOrigin="anonymous"
                playsInline
                preload="metadata"
                onLoadedMetadata={handleHostLoadedMetadata}
                onCanPlay={handleHostCanPlay}
                onPlaying={handleHostPlaying}
                onPause={handleHostPause}
                onTimeUpdate={handleHostTimeUpdate}
                onSeeked={handleHostSeeked}
                onError={handleHostError}
                className="screen-video direct-video-player"
                id="host-movie-video"
                onClick={togglePlayPause}
              />

              {/* HOST CUSTOM MOVIE CONTROL BAR */}
              <div className="host-movie-controls-bar" role="toolbar" aria-label="Movie controls">
                {/* Seek Progress Bar */}
                <div className="movie-seek-container">
                  <span className="movie-time-label">{formatTime(currentTime)}</span>
                  <input
                    type="range"
                    min="0"
                    max={duration || 100}
                    step="0.1"
                    value={currentTime}
                    onChange={handleSeekChange}
                    className="movie-seek-slider"
                    aria-label="Seek time"
                  />
                  <span className="movie-time-label">{formatTime(duration)}</span>
                </div>

                {/* Control Action Buttons */}
                <div className="movie-controls-actions">
                  <div className="controls-left-group">
                    {/* Back 10s */}
                    <button
                      type="button"
                      onClick={skipBackward10}
                      className="btn-movie-ctrl"
                      title="Rewind 10 seconds"
                    >
                      <RotateCcw size={16} />
                      <span className="btn-ctrl-sub">10</span>
                    </button>

                    {/* Play / Pause Toggle */}
                    <button
                      type="button"
                      onClick={togglePlayPause}
                      className="btn-movie-ctrl btn-play-pause"
                      title={isPlaying ? 'Pause' : 'Play'}
                    >
                      {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                    </button>

                    {/* Forward 10s */}
                    <button
                      type="button"
                      onClick={skipForward10}
                      className="btn-movie-ctrl"
                      title="Skip forward 10 seconds"
                    >
                      <RotateCw size={16} />
                      <span className="btn-ctrl-sub">10</span>
                    </button>

                    {/* Volume & Mute */}
                    <div className="volume-control-wrap">
                      <button
                        type="button"
                        onClick={toggleMute}
                        className="btn-movie-ctrl"
                        title={isMuted ? 'Unmute' : 'Mute'}
                      >
                        {isMuted || volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
                      </button>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={isMuted ? 0 : volume}
                        onChange={handleVolumeChange}
                        className="volume-slider"
                        aria-label="Volume"
                      />
                    </div>
                  </div>

                  <div className="controls-right-group">
                    {/* Speed Selector */}
                    <div className="speed-selector">
                      {[0.75, 1.0, 1.25, 1.5, 2.0].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => handleSpeedChange(s)}
                          className={`btn-speed-pill ${playbackRate === s ? 'active' : ''}`}
                        >
                          {s}x
                        </button>
                      ))}
                    </div>

                    {/* Fullscreen Video */}
                    <button
                      type="button"
                      onClick={toggleHostFullscreen}
                      className="btn-movie-ctrl"
                      title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                    >
                      {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : localScreenStream ? (
            /* HOST LOCAL PRESENTATION PREVIEW */
            <div className="media-player-wrapper">
              <video
                ref={localScreenVideoRef}
                className="screen-video presentation-video"
                autoPlay
                playsInline
                muted
                id="local-screen-video"
              />
            </div>
          ) : unsupportedMessage ? (
            /* UNSUPPORTED WEBPAGE NOTICE */
            <div className="unsupported-site-card">
              <div className="unsupported-icon-wrap">
                <AlertCircle size={36} className="unsupported-icon" />
              </div>
              <h3 className="unsupported-title">That movie site can't be controlled directly here.</h3>
              <p className="unsupported-desc">
                Try a direct video link (.mp4, .webm) or a supported media stream.
              </p>
              <button
                type="button"
                onClick={() => setUnsupportedMessage(null)}
                className="btn-primary-stage"
              >
                <span>Try Another Link</span>
              </button>
            </div>
          ) : (
            /* HOST COMPACT ELEGANT EMPTY CINEMA STAGE */
            <div className="empty-stage-card">
              <div className="empty-stage-marquee-icon">
                <Film size={36} className="marquee-film-icon" />
              </div>
              <h2 className="empty-stage-title">What's on tonight?</h2>
              <p className="empty-stage-desc">
                Add a movie when you're ready. Paste a direct playable video link (.mp4) above.
              </p>
            </div>
          )
        ) : (
          /* ---------------------------------------------------------------------
             PARTNER VIEW: REMOTE MOVIE ONLY (NO URL BAR, NO CONTROLS)
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

              {/* Audio Enable Pill if browser restricted audio */}
              {isPartnerAudioBlocked && (
                <div className="partner-audio-notice-bar">
                  <button
                    onClick={handlePartnerEnableAudio}
                    className="btn-enable-audio-pill"
                    title="Enable movie sound"
                    id="enable-movie-audio-btn"
                  >
                    <Volume2 size={15} />
                    <span>ENABLE MOVIE AUDIO</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="empty-stage-card">
              <div className="empty-stage-marquee-icon">
                <Film size={34} className="marquee-film-icon" />
              </div>
              <h2 className="empty-stage-title">Waiting for Host Movie...</h2>
              <p className="empty-stage-desc">
                The Host controls the movie stream. As soon as the Host plays a movie, it will appear here in real time.
              </p>
            </div>
          )
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
                      <span className="diag-value">{partnerPlayStatus}</span>
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
