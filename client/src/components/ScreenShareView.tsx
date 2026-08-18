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
import { resolveMovieSource, normalizeMediaUrl, ResolvedMovieSource } from '../lib/mediaResolver';

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
  const [resolvedSource, setResolvedSource] = useState<ResolvedMovieSource | null>(null);
  const [isEmbedBlocked, setIsEmbedBlocked] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  // Host Video Playback States (Direct Media Only)
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
    readyState: 0,
    paused: true,
  });

  // Sync inputUrl with mediaSource if present
  useEffect(() => {
    if (mediaSource?.url && !inputUrl) {
      setInputUrl(mediaSource.url);
      try {
        const resolved = resolveMovieSource(mediaSource.url);
        setResolvedSource(resolved);
      } catch {
        // Ignore parsing errors on sync
      }
    }
  }, [mediaSource?.url]);

  // =========================================================================
  // STEP 1 & 10: HOST CAPTURESTREAM & MOVIE STREAMING PIPELINE
  // =========================================================================
  const captureAndStreamHostVideo = useCallback(() => {
    const video = hostVideoRef.current;
    if (!video || !isHost) return;

    console.log('[HOST MOVIE]');
    console.log('source URL:', mediaSource?.url);
    console.log('[HOST MOVIE]');
    console.log('videoWidth:', video.videoWidth);
    console.log('[HOST MOVIE]');
    console.log('videoHeight:', video.videoHeight);

    const captureFn = (video as any).captureStream || (video as any).mozCaptureStream;
    if (typeof captureFn === 'function') {
      try {
        const stream: MediaStream = captureFn.call(video);
        const videoTracks = stream.getVideoTracks();
        const audioTracks = stream.getAudioTracks();

        console.log('[HOST MOVIE]');
        console.log('captureStream video tracks:', videoTracks.length);
        console.log('[HOST MOVIE]');
        console.log('captureStream audio tracks:', audioTracks.length);

        if (videoTracks.length > 0) {
          onStartStreaming(stream);
        }
      } catch (err) {
        console.warn('[HOST MOVIE] captureStream error:', err);
      }
    } else {
      setUrlNotice('Your browser does not support video stream capture. Please use Chrome, Edge, or Firefox.');
    }
  }, [isHost, mediaSource?.url, onStartStreaming]);

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
  // SINGLE URL OPEN HANDLER (SMART ROUTER)
  // =========================================================================
  const handleOpenMovie = useCallback(() => {
    setUrlNotice(null);
    setIsEmbedBlocked(false);
    const raw = inputUrl.trim();

    if (!raw) {
      setUrlNotice('Please enter a video or movie link.');
      return;
    }

    try {
      const normalized = normalizeMediaUrl(raw);
      const resolved = resolveMovieSource(normalized);
      setResolvedSource(resolved);

      onSetMediaSource({
        url: resolved.url,
        type: resolved.sourceType === 'direct-media' ? 'direct-video' : 'webpage',
        title: resolved.title,
        currentTime: 0,
        isPlaying: false,
        updatedAt: Date.now(),
      });
      setInputUrl(resolved.url);
    } catch (err: any) {
      setUrlNotice(err?.message || 'Please enter a valid URL.');
    }
  }, [inputUrl, onSetMediaSource]);

  const handleClearMovie = useCallback(() => {
    onSetMediaSource(null);
    setResolvedSource(null);
    setInputUrl('');
    setUrlNotice(null);
    setIsEmbedBlocked(false);
    setIsPlaying(false);
    onStopStreaming();
  }, [onSetMediaSource, onStopStreaming]);

  // =========================================================================
  // STEP 4, 5, 8 & 9: PARTNER REMOTE MOVIE PLAYBACK PIPELINE
  // =========================================================================
  useEffect(() => {
    const video = remoteMovieVideoRef.current;
    if (!video || isHost) return;

    const hasVideoTracks = remoteScreenStream && remoteScreenStream.getVideoTracks().length > 0;
    const hasAudioTracks = remoteScreenStream && remoteScreenStream.getAudioTracks().length > 0;

    console.log('[PARTNER MOVIE]');
    console.log('video track received:', hasVideoTracks ? 'YES' : 'NO');
    console.log('[PARTNER MOVIE]');
    console.log('audio track received:', hasAudioTracks ? 'YES' : 'NO');
    console.log('[PARTNER MOVIE]');
    console.log(
      `remoteMovieStream tracks: video=${remoteScreenStream?.getVideoTracks().length || 0} audio=${remoteScreenStream?.getAudioTracks().length || 0}`
    );
    console.log('[PARTNER MOVIE]');
    console.log('srcObject:', remoteScreenStream ? 'attached' : 'missing');

    if (!hasVideoTracks || !remoteScreenStream) {
      if (video.srcObject) {
        video.srcObject = null;
      }
      setPartnerPlayStatus('IDLE');
      setIsPartnerAudioBlocked(false);
      return;
    }

    // Step 5: Assign remoteMovieStream directly to partnerMovieVideo
    video.srcObject = remoteScreenStream;
    video.autoplay = true;
    video.playsInline = true;
    video.controls = false;

    let isMounted = true;

    const attemptPartnerPlay = async () => {
      if (!isMounted || !video) return;

      try {
        // Try unmuted play first
        video.muted = false;
        await video.play();
        console.log('[PARTNER MOVIE]');
        console.log('play: SUCCESS');
        if (isMounted) {
          setPartnerPlayStatus('PLAYING');
          setIsPartnerAudioBlocked(false);
        }
      } catch (err: any) {
        console.warn('[PARTNER MOVIE] unmuted autoplay blocked, attempting muted playback:', err?.name);
        try {
          // Step 8: Fallback to muted playback if autoplay policy blocks sound
          video.muted = true;
          await video.play();
          console.log('[PARTNER MOVIE]');
          console.log('play: SUCCESS (muted)');
          if (isMounted) {
            setPartnerPlayStatus('MUTED');
            setIsPartnerAudioBlocked(true);
          }
        } catch (mutedErr) {
          console.error('[PARTNER MOVIE]');
          console.error('play: FAILED', mutedErr);
          if (isMounted) {
            setPartnerPlayStatus('ERROR');
          }
        }
      }
    };

    const onLoadedMetadata = () => {
      console.log('[PARTNER MOVIE]');
      console.log('videoWidth:', video.videoWidth);
      console.log('[PARTNER MOVIE]');
      console.log('videoHeight:', video.videoHeight);
      console.log('[PARTNER MOVIE]');
      console.log('readyState:', video.readyState);
      setPartnerMetrics((prev) => ({
        ...prev,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        readyState: video.readyState,
        paused: video.paused,
      }));
      attemptPartnerPlay();
    };

    const onTimeUpdate = () => {
      setPartnerMetrics((prev) => ({
        ...prev,
        currentTime: video.currentTime,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        readyState: video.readyState,
        paused: video.paused,
      }));
    };

    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('canplay', attemptPartnerPlay);
    video.addEventListener('timeupdate', onTimeUpdate);

    if (video.readyState >= 2) {
      onLoadedMetadata();
    } else {
      attemptPartnerPlay();
    }

    return () => {
      isMounted = false;
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('canplay', attemptPartnerPlay);
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
  const isDirectMediaActive = mediaSource?.type === 'direct-video' || resolvedSource?.sourceType === 'direct-media';
  const isEmbeddableActive = !isDirectMediaActive && mediaSource && resolvedSource?.sourceType === 'embeddable-page';

  // Step 7: Partner waiting state strictly depends on remoteMovieStream having real video tracks
  const hasPartnerReceivedMovie = !isHost && remoteScreenStream && remoteScreenStream.getVideoTracks().length > 0;

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
                  if (isEmbedBlocked) setIsEmbedBlocked(false);
                }}
                placeholder="Paste movie link (.mp4, YouTube, or web link)..."
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
          STEP 6: MOVIE VIEWPORT: EXACTLY ONE VIDEO ELEMENT FOR ACTIVE VIEWER
          ========================================================================= */}
      <div className="movie-viewport-stage">
        {isHost ? (
          /* ---------------------------------------------------------------------
             HOST VIEW: DIRECT VIDEO / EMBED IFRAME / BLOCKED NOTICE / EMPTY STAGE
             --------------------------------------------------------------------- */
          isEmbedBlocked ? (
            /* BLOCKED WEBPAGE FALLBACK */
            <div className="unsupported-site-card">
              <div className="unsupported-icon-wrap">
                <AlertCircle size={34} className="unsupported-icon" />
              </div>
              <h3 className="unsupported-title">This site doesn't allow in-app playback.</h3>
              <p className="unsupported-desc">
                Try a direct video link or a supported player.
              </p>
              <button
                type="button"
                onClick={handleClearMovie}
                className="btn-primary-stage"
              >
                <span>Try Another Link</span>
              </button>
            </div>
          ) : isDirectMediaActive ? (
            /* A. DIRECT MEDIA: NATIVE HTML5 VIDEO WITH HOST CONTROLS */
            <div className="media-player-wrapper host-cinema-wrapper">
              <video
                ref={hostVideoRef}
                src={mediaSource?.url}
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

              {/* HOST MOVIE CONTROL BAR (DIRECT MEDIA ONLY) */}
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
                    {/* -10s Back */}
                    <button
                      type="button"
                      onClick={skipBackward10}
                      className="btn-movie-ctrl"
                      title="Rewind 10 seconds"
                    >
                      <RotateCcw size={15} />
                      <span className="btn-ctrl-sub">10</span>
                    </button>

                    {/* Play / Pause Toggle */}
                    <button
                      type="button"
                      onClick={togglePlayPause}
                      className="btn-movie-ctrl btn-play-pause"
                      title={isPlaying ? 'Pause' : 'Play'}
                    >
                      {isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
                    </button>

                    {/* +10s Forward */}
                    <button
                      type="button"
                      onClick={skipForward10}
                      className="btn-movie-ctrl"
                      title="Skip forward 10 seconds"
                    >
                      <RotateCw size={15} />
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
                        {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
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
                      {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : isEmbeddableActive && resolvedSource?.embedUrl ? (
            /* B. EMBEDDABLE WEBPAGE: LEGITIMATE IFRAME PLAYER */
            <div className="media-player-wrapper embed-player-wrapper">
              <iframe
                src={resolvedSource.embedUrl}
                title={resolvedSource.title || 'Movie Embed'}
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                allowFullScreen
                className="screen-video embed-iframe"
                onError={() => setIsEmbedBlocked(true)}
              />

              {/* Discreet Floating Bar with Fallback Option */}
              <div className="embed-floating-notice-bar">
                <span className="embed-title-text">{resolvedSource.title}</span>
                <button
                  type="button"
                  onClick={() => setIsEmbedBlocked(true)}
                  className="btn-report-blocked"
                  title="If this video does not load, click here"
                >
                  Can't see the video?
                </button>
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
          ) : (
            /* HOST COMPACT ELEGANT EMPTY CINEMA STAGE */
            <div className="empty-stage-card">
              <div className="empty-stage-marquee-icon">
                <Film size={36} className="marquee-film-icon" />
              </div>
              <h2 className="empty-stage-title">What's on tonight?</h2>
              <p className="empty-stage-desc">
                Add a movie when you're ready. Paste a direct video link (.mp4) or supported player above.
              </p>
            </div>
          )
        ) : (
          /* ---------------------------------------------------------------------
             PARTNER VIEW: REMOTE MOVIE ONLY (NO URL BAR, NO CONTROLS)
             --------------------------------------------------------------------- */
          hasPartnerReceivedMovie ? (
            <div className="media-player-wrapper partner-cinema-wrapper">
              {/* Step 6: Exactly ONE dedicated movie video element */}
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
          ) : mediaSource?.type === 'webpage' && resolvedSource?.embedUrl ? (
            /* Partner Shared Embed Player */
            <div className="media-player-wrapper embed-player-wrapper">
              <iframe
                src={resolvedSource.embedUrl}
                title={resolvedSource.title || 'Movie Embed'}
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                allowFullScreen
                className="screen-video embed-iframe"
              />
            </div>
          ) : (
            /* Step 7: Waiting state displayed until a real video track exists */
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
                  <span className="diag-label">Source Type:</span>
                  <span className="diag-value">{resolvedSource?.sourceType || 'none'}</span>
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
                        {remoteVideoTrack ? 'YES' : 'NO'}
                      </span>
                    </div>
                    <div className="diag-item">
                      <span className="diag-label">Remote audio:</span>
                      <span className={`diag-value ${remoteAudioTrack ? 'text-ok' : 'text-muted'}`}>
                        {remoteAudioTrack ? 'YES' : 'NO'}
                      </span>
                    </div>
                    <div className="diag-item">
                      <span className="diag-label">srcObject:</span>
                      <span className={`diag-value ${remoteScreenStream ? 'attached' : 'missing'}`}>
                        {remoteScreenStream ? 'attached' : 'missing'}
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
                    <div className="diag-item">
                      <span className="diag-label">ReadyState:</span>
                      <span className="diag-value">{partnerMetrics.readyState}</span>
                    </div>
                    <div className="diag-item">
                      <span className="diag-label">Paused:</span>
                      <span className="diag-value">{partnerMetrics.paused ? 'YES' : 'NO'}</span>
                    </div>
                    <div className="diag-item">
                      <span className="diag-label">Time:</span>
                      <span className="diag-value">{partnerMetrics.currentTime.toFixed(1)}s</span>
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
