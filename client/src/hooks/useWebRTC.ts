import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ConnectionStatus,
  ChatMessage,
  MediaState,
  MediaSourceState,
  ServerSignalingMessage,
  ClientSignalingMessage,
} from '../types';
import { getSignalingServerUrl, generatePeerId } from '../lib/config';

interface UseWebRTCOptions {
  roomId: string;
  onRoomFull?: (message: string) => void;
  onError?: (error: string) => void;
}

export interface WebRTCStats {
  // Outbound (Host)
  framesEncoded: number;
  framesSent: number;
  outboundWidth: number;
  outboundHeight: number;
  bytesSent: number;
  outboundFps: number;
  // Inbound (Partner)
  framesReceived: number;
  framesDecoded: number;
  inboundWidth: number;
  inboundHeight: number;
  bytesReceived: number;
  inboundFps: number;
  packetsLost: number;
}

export interface MovieTabInfo {
  tabId?: number;
  title?: string;
  url?: string;
}

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  iceCandidatePoolSize: 2,
};

export function useWebRTC({ roomId, onRoomFull, onError }: UseWebRTCOptions) {
  // Connection State
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [peerId] = useState<string>(() => generatePeerId());
  const [partnerPeerId, setPartnerPeerId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // WebRTC Camera Live States
  const [iceState, setIceState] = useState<string>('new');
  const [signalingState, setSignalingState] = useState<string>('stable');
  const [connState, setConnState] = useState<string>('new');
  const [dataChannelState, setDataChannelState] = useState<'idle' | 'connecting' | 'open' | 'closed'>('idle');

  // WebRTC Dedicated Movie PC Live States
  const [movieConnState, setMovieConnState] = useState<string>('new');
  const [movieIceState, setMovieIceState] = useState<string>('new');
  const [movieSignalingState, setMovieSignalingState] = useState<string>('stable');

  // Local Media State (Camera & Mic)
  const [mediaState, setMediaState] = useState<MediaState>({
    isCameraOn: false,
    isMicOn: false,
    isScreenSharing: false,
    hasCameraPermission: false,
    hasMicPermission: false,
  });

  // Remote Media State
  const [remoteHasCamera, setRemoteHasCamera] = useState(false);
  const [remoteHasMic, setRemoteHasMic] = useState(false);

  // Movie Tab & Source State
  const [mediaSource, setMediaSource] = useState<MediaSourceState | null>(null);
  const [movieTabInfo, setMovieTabInfo] = useState<MovieTabInfo | null>(null);
  const [isExtensionInstalled, setIsExtensionInstalled] = useState<boolean>(false);
  const [captureState, setCaptureState] = useState<'IDLE' | 'MOVIE_TAB_OPENED' | 'WAITING_FOR_EXTENSION_INVOCATION' | 'CAPTURE_REQUESTED' | 'STREAMING' | 'ERROR'>('IDLE');

  // Streams
  const [localCameraStream, setLocalCameraStream] = useState<MediaStream | null>(null);
  const [remoteCameraStream, setRemoteCameraStream] = useState<MediaStream | null>(null);
  const [localMovieStream, setLocalMovieStream] = useState<MediaStream | null>(null);
  const [remoteMovieStream, setRemoteMovieStream] = useState<MediaStream | null>(null);

  // Live Diagnostics Stats
  const [webrtcStats, setWebrtcStats] = useState<WebRTCStats>({
    framesEncoded: 0,
    framesSent: 0,
    outboundWidth: 0,
    outboundHeight: 0,
    bytesSent: 0,
    outboundFps: 0,
    framesReceived: 0,
    framesDecoded: 0,
    inboundWidth: 0,
    inboundHeight: 0,
    bytesReceived: 0,
    inboundFps: 0,
    packetsLost: 0,
  });

  // WebSocket and PeerConnection Refs
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null); // Camera & Chat PC
  const moviePcRef = useRef<RTCPeerConnection | null>(null); // Dedicated Movie PC
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const cameraIceQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const movieIceQueueRef = useRef<RTCIceCandidateInit[]>([]);

  const isInitiatorRef = useRef<boolean>(false);
  const partnerPeerIdRef = useRef<string | null>(null);
  const pingIntervalRef = useRef<number | null>(null);
  const statsIntervalRef = useRef<number | null>(null);
  const mediaPromiseRef = useRef<Promise<MediaStream | null> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const onRoomFullRef = useRef(onRoomFull);
  const onErrorRef = useRef(onError);

  // Stream Refs
  const localCameraStreamRef = useRef<MediaStream | null>(null);
  const remoteCameraStreamRef = useRef<MediaStream | null>(null);
  const localMovieStreamRef = useRef<MediaStream | null>(null);
  const remoteMovieStreamRef = useRef<MediaStream | null>(null);

  const isLeavingRef = useRef<boolean>(false);

  // Sync refs
  useEffect(() => {
    partnerPeerIdRef.current = partnerPeerId;
  }, [partnerPeerId]);

  useEffect(() => {
    localCameraStreamRef.current = localCameraStream;
  }, [localCameraStream]);

  useEffect(() => {
    remoteCameraStreamRef.current = remoteCameraStream;
  }, [remoteCameraStream]);

  useEffect(() => {
    localMovieStreamRef.current = localMovieStream;
  }, [localMovieStream]);

  useEffect(() => {
    remoteMovieStreamRef.current = remoteMovieStream;
  }, [remoteMovieStream]);

  useEffect(() => {
    onRoomFullRef.current = onRoomFull;
  }, [onRoomFull]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  // Send message over WebSocket signaling
  const sendSignaling = useCallback((msg: ClientSignalingMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);
  const sendSignalingRef = useRef(sendSignaling);
  sendSignalingRef.current = sendSignaling;

  // Report error
  const reportError = useCallback((msg: string) => {
    console.error('[WebRTC Error]', msg);
    setErrorMessage(msg);
    if (onErrorRef.current) onErrorRef.current(msg);
  }, []);
  const reportErrorRef = useRef(reportError);
  reportErrorRef.current = reportError;

  // Append a chat message
  const addChatMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);
  const addChatMessageRef = useRef(addChatMessage);
  addChatMessageRef.current = addChatMessage;

  // =========================================================================
  // DEDICATED MOVIE PEER CONNECTION (PART 7 & 17)
  // =========================================================================

  // Host: Starts Movie Streaming with Captured MediaStream
  const startMovieStreaming = useCallback(
    async (stream: MediaStream) => {
      console.log('[MOVIE PC] Starting dedicated movie streaming...');
      setLocalMovieStream(stream);
      localMovieStreamRef.current = stream;
      setCaptureState('STREAMING');
      setMediaState((prev) => ({ ...prev, isScreenSharing: true }));

      // Clean up any existing movie PC
      if (moviePcRef.current) {
        moviePcRef.current.close();
        moviePcRef.current = null;
      }

      const moviePc = new RTCPeerConnection(ICE_CONFIG);
      moviePcRef.current = moviePc;

      // Track states
      moviePc.onconnectionstatechange = () => {
        console.log('[MOVIE PC] connectionState:', moviePc.connectionState);
        setMovieConnState(moviePc.connectionState);
      };
      moviePc.onsignalingstatechange = () => {
        setMovieSignalingState(moviePc.signalingState);
      };
      moviePc.oniceconnectionstatechange = () => {
        setMovieIceState(moviePc.iceConnectionState);
        if (moviePc.iceConnectionState === 'failed') {
          moviePc.restartIce();
        }
      };

      // Handle ICE Candidates for Movie PC
      moviePc.onicecandidate = (event) => {
        if (event.candidate && partnerPeerIdRef.current) {
          console.log('[MOVIE PC] Sending movie-ice-candidate to partner');
          sendSignalingRef.current({
            type: 'movie-ice-candidate',
            candidate: event.candidate.toJSON(),
            targetPeerId: partnerPeerIdRef.current,
            senderPeerId: peerId,
          });
        }
      };

      // Add Movie Video and Audio Tracks to Movie PC
      stream.getTracks().forEach((track) => {
        console.log(`[MOVIE PC] Adding ${track.kind} track to movie PC:`, track.id, track.label);
        moviePc.addTrack(track, stream);
      });

      // If Partner is connected, create and send Movie Offer
      if (partnerPeerIdRef.current) {
        try {
          console.log('[MOVIE PC] Creating movie offer for partner:', partnerPeerIdRef.current);
          const offer = await moviePc.createOffer();
          await moviePc.setLocalDescription(offer);

          sendSignalingRef.current({
            type: 'movie-offer',
            sdp: offer,
            targetPeerId: partnerPeerIdRef.current,
            senderPeerId: peerId,
          });

          sendSignalingRef.current({
            type: 'screen-share-status',
            isSharing: true,
            targetPeerId: partnerPeerIdRef.current,
            senderPeerId: peerId,
          });
        } catch (err) {
          console.error('[MOVIE PC] Error creating movie offer:', err);
        }
      }
    },
    [peerId]
  );
  const startMovieStreamingRef = useRef(startMovieStreaming);
  startMovieStreamingRef.current = startMovieStreaming;

  // Stop Movie Streaming (Host or Partner)
  const stopMovieStreaming = useCallback(() => {
    console.log('[MOVIE PC] Stopping movie streaming');

    if (localMovieStreamRef.current) {
      localMovieStreamRef.current.getTracks().forEach((track) => track.stop());
      localMovieStreamRef.current = null;
      setLocalMovieStream(null);
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    if (moviePcRef.current) {
      moviePcRef.current.ontrack = null;
      moviePcRef.current.onicecandidate = null;
      moviePcRef.current.close();
      moviePcRef.current = null;
    }

    setRemoteMovieStream(null);
    remoteMovieStreamRef.current = null;
    movieIceQueueRef.current = [];
    setCaptureState('IDLE');
    setMediaState((prev) => ({ ...prev, isScreenSharing: false }));
    setMovieConnState('new');
    setMovieIceState('new');
    setMovieSignalingState('stable');

    // Notify partner and extension
    if (partnerPeerIdRef.current) {
      sendSignalingRef.current({
        type: 'screen-share-status',
        isSharing: false,
        targetPeerId: partnerPeerIdRef.current,
        senderPeerId: peerId,
      });
    }

    window.postMessage({ type: 'WT_APP_STOP_CINEMA' }, '*');
  }, [peerId]);
  const stopMovieStreamingRef = useRef(stopMovieStreaming);
  stopMovieStreamingRef.current = stopMovieStreaming;

  // Partner: Handles Incoming Movie Offer from Host
  const handleMovieOffer = useCallback(
    async (sdp: RTCSessionDescriptionInit, senderPeerId: string) => {
      console.log('[MOVIE PC] Handling movie offer from host:', senderPeerId);

      if (moviePcRef.current) {
        moviePcRef.current.close();
        moviePcRef.current = null;
      }

      const moviePc = new RTCPeerConnection(ICE_CONFIG);
      moviePcRef.current = moviePc;

      moviePc.onconnectionstatechange = () => {
        console.log('[PARTNER MOVIE PC] connectionState:', moviePc.connectionState);
        setMovieConnState(moviePc.connectionState);
      };
      moviePc.onsignalingstatechange = () => {
        setMovieSignalingState(moviePc.signalingState);
      };
      moviePc.oniceconnectionstatechange = () => {
        setMovieIceState(moviePc.iceConnectionState);
      };

      moviePc.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignalingRef.current({
            type: 'movie-ice-candidate',
            candidate: event.candidate.toJSON(),
            targetPeerId: senderPeerId,
            senderPeerId: peerId,
          });
        }
      };

      // Receive incoming movie tracks
      moviePc.ontrack = (event) => {
        const track = event.track;
        console.log(`[PARTNER MOVIE ontrack] kind=${track.kind}, id=${track.id}`);

        setRemoteMovieStream((prev) => {
          const existing = prev ? prev.getTracks().filter((t) => t.id !== track.id) : [];
          const newStream = new MediaStream([...existing, track]);
          remoteMovieStreamRef.current = newStream;
          return newStream;
        });

        track.onended = () => {
          console.log('[PARTNER MOVIE] Track ended:', track.kind);
        };
      };

      try {
        await moviePc.setRemoteDescription(new RTCSessionDescription(sdp));

        // Drain any queued ICE candidates for Movie PC
        while (movieIceQueueRef.current.length > 0) {
          const cand = movieIceQueueRef.current.shift();
          if (cand) {
            await moviePc.addIceCandidate(new RTCIceCandidate(cand));
          }
        }

        const answer = await moviePc.createAnswer();
        await moviePc.setLocalDescription(answer);

        sendSignalingRef.current({
          type: 'movie-answer',
          sdp: answer,
          targetPeerId: senderPeerId,
          senderPeerId: peerId,
        });

        setCaptureState('STREAMING');
        setMediaState((prev) => ({ ...prev, isScreenSharing: true }));
      } catch (err) {
        console.error('[MOVIE PC] Error answering movie offer:', err);
      }
    },
    [peerId]
  );
  const handleMovieOfferRef = useRef(handleMovieOffer);
  handleMovieOfferRef.current = handleMovieOffer;

  // Host: Handles Movie Answer from Partner
  const handleMovieAnswer = useCallback(async (sdp: RTCSessionDescriptionInit) => {
    if (moviePcRef.current) {
      try {
        console.log('[HOST MOVIE PC] Setting remote movie answer');
        await moviePcRef.current.setRemoteDescription(new RTCSessionDescription(sdp));

        while (movieIceQueueRef.current.length > 0) {
          const cand = movieIceQueueRef.current.shift();
          if (cand) {
            await moviePcRef.current.addIceCandidate(new RTCIceCandidate(cand));
          }
        }
      } catch (err) {
        console.error('[HOST MOVIE PC] Error setting remote movie answer:', err);
      }
    }
  }, []);
  const handleMovieAnswerRef = useRef(handleMovieAnswer);
  handleMovieAnswerRef.current = handleMovieAnswer;

  // =========================================================================
  // EXTENSION BRIDGE: LISTEN FOR MESSAGES FROM EXTENSION CONTENT SCRIPT
  // =========================================================================
  useEffect(() => {
    const handleExtensionMessage = async (event: MessageEvent) => {
      if (event.source !== window || !event.data || typeof event.data !== 'object') return;

      const msg = event.data;

      if (msg.type === 'WT_EXTENSION_READY' || msg.type === 'WT_PONG') {
        console.log('[EXTENSION BRIDGE] Extension detected, version:', msg.version);
        setIsExtensionInstalled(true);
      }

      if (msg.type === 'WT_MOVIE_TAB_OPENED') {
        console.log('[EXTENSION BRIDGE] Movie tab opened:', msg.tabId, msg.url);
        setMovieTabInfo({
          tabId: msg.tabId,
          title: msg.title || 'Movie Tab',
          url: msg.url,
        });
        setCaptureState('WAITING_FOR_EXTENSION_INVOCATION');
      }

      if (msg.type === 'WT_STREAM_ID_READY' && isHost) {
        const streamId = msg.streamId;
        console.log('[EXTENSION BRIDGE] WT_STREAM_ID_READY received! streamId =', streamId);

        setMovieTabInfo({
          tabId: msg.tabId,
          title: msg.tabTitle,
          url: msg.tabUrl,
        });

        try {
          // Request tab capture MediaStream using chromeMediaSourceId
          console.log('[HOST] Calling getUserMedia with chromeMediaSourceId...');
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              mandatory: {
                chromeMediaSource: 'tab',
                chromeMediaSourceId: streamId,
              },
            },
            video: {
              mandatory: {
                chromeMediaSource: 'tab',
                chromeMediaSourceId: streamId,
              },
            },
          } as any);

          const videoTrack = stream.getVideoTracks()[0];
          const audioTrack = stream.getAudioTracks()[0];

          console.log('[EXT MOVIE]');
          console.log('tabId:', msg.tabId);
          console.log('tabUrl:', msg.tabUrl);
          console.log('tabTitle:', msg.tabTitle);
          console.log('videoTrack readyState:', videoTrack?.readyState);
          console.log('audioTrack readyState:', audioTrack?.readyState);

          if (videoTrack) {
            const settings = videoTrack.getSettings();
            console.log('[EXT MOVIE] width:', settings.width, 'height:', settings.height, 'frameRate:', settings.frameRate);
          }

          // Part 5: Restore Local Audio for Host using AudioContext
          if (audioTrack) {
            try {
              const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
              const source = audioCtx.createMediaStreamSource(stream);
              source.connect(audioCtx.destination);
              audioContextRef.current = audioCtx;
              console.log('[EXT MOVIE] Local audio restored via AudioContext');
            } catch (audioErr) {
              console.warn('[EXT MOVIE] AudioContext routing warning:', audioErr);
            }
          }

          // Start dedicated movie streaming
          await startMovieStreamingRef.current(stream);
        } catch (err: any) {
          console.error('[HOST] getUserMedia tab capture error:', err);
          reportErrorRef.current('Could not capture movie tab: ' + (err?.message || 'Unknown error'));
          setCaptureState('ERROR');
        }
      }

      if (msg.type === 'WT_MOVIE_CAPTURE_STOPPED') {
        console.log('[EXTENSION BRIDGE] Movie capture stopped:', msg.reason);
        stopMovieStreamingRef.current();
      }
    };

    window.addEventListener('message', handleExtensionMessage);

    // Ping extension on mount
    window.postMessage({ type: 'WT_APP_PING' }, '*');

    return () => {
      window.removeEventListener('message', handleExtensionMessage);
    };
  }, [isHost]);

  // Host: Open Movie in Extension Tab
  const openMovieTab = useCallback((url: string) => {
    console.log('[HOST] Requesting extension to open movie tab:', url);
    setCaptureState('CAPTURE_REQUESTED');
    window.postMessage({ type: 'WT_APP_OPEN_MOVIE_TAB', url }, '*');
  }, []);

  // Setup DataChannel listeners on Camera PC
  const setupDataChannel = useCallback((dc: RTCDataChannel) => {
    dataChannelRef.current = dc;
    setDataChannelState(dc.readyState as any);

    dc.onopen = () => {
      console.log('[CHAT] DataChannel open');
      setDataChannelState('open');
    };

    dc.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'chat') {
          addChatMessageRef.current({
            id: data.id || Math.random().toString(36).substring(2, 9),
            sender: 'remote',
            senderPeerId: data.senderPeerId,
            text: data.text,
            timestamp: data.timestamp || Date.now(),
          });
        }
      } catch (e) {
        console.error('[DATACHANNEL] Error parsing message:', e);
      }
    };

    dc.onerror = (err) => {
      console.error('[DATACHANNEL] DataChannel error:', err);
    };

    dc.onclose = () => {
      console.log('[DATACHANNEL] DataChannel closed');
      setDataChannelState('closed');
    };
  }, []);

  // Initialize local camera and microphone
  const initLocalMedia = useCallback(async (): Promise<MediaStream | null> => {
    if (localCameraStreamRef.current && localCameraStreamRef.current.getTracks().length > 0) {
      return localCameraStreamRef.current;
    }

    if (mediaPromiseRef.current) {
      return mediaPromiseRef.current;
    }

    const promise = (async () => {
      console.log('[MEDIA] Initializing local media (Camera & Microphone)...');
      let stream: MediaStream | null = null;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch (err1: any) {
        console.warn('[MEDIA] Ideal constraints failed, trying basic video:true, audio:true', err1?.name);
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        } catch (err2: any) {
          console.warn('[MEDIA] Video+Audio failed, trying audio only', err2?.name);
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            reportErrorRef.current('Camera unavailable or permission denied. Microphone active.');
          } catch (err3: any) {
            console.warn('[MEDIA] Audio only failed, trying video only', err3?.name);
            try {
              stream = await navigator.mediaDevices.getUserMedia({ video: true });
              reportErrorRef.current('Microphone unavailable or permission denied. Camera active.');
            } catch (err4: any) {
              console.error('[MEDIA] All getUserMedia requests failed:', err4);
              reportErrorRef.current('Could not access camera or microphone. Please check browser permissions.');
            }
          }
        }
      }

      if (stream) {
        setLocalCameraStream(stream);
        localCameraStreamRef.current = stream;

        const audioTrack = stream.getAudioTracks()[0];
        const videoTrack = stream.getVideoTracks()[0];

        if (audioTrack) console.log('[MEDIA] local audio track acquired:', audioTrack.id, audioTrack.label);
        if (videoTrack) console.log('[MEDIA] local video track acquired:', videoTrack.id, videoTrack.label);

        setMediaState((prev) => ({
          ...prev,
          isCameraOn: !!videoTrack && videoTrack.enabled,
          isMicOn: !!audioTrack && audioTrack.enabled,
          hasCameraPermission: !!videoTrack,
          hasMicPermission: !!audioTrack,
        }));
      }

      return stream;
    })();

    mediaPromiseRef.current = promise;
    const result = await promise;
    mediaPromiseRef.current = null;
    return result;
  }, []);
  const initLocalMediaRef = useRef(initLocalMedia);
  initLocalMediaRef.current = initLocalMedia;

  // =========================================================================
  // CAMERA & CHAT PEER CONNECTION
  // =========================================================================
  const createCameraPeerConnection = useCallback(
    (targetId: string) => {
      if (pcRef.current) {
        return pcRef.current;
      }

      console.log('[WEBRTC] createCameraPeerConnection for target:', targetId);

      const pc = new RTCPeerConnection(ICE_CONFIG);
      pcRef.current = pc;

      // Add local camera/mic tracks
      if (localCameraStreamRef.current) {
        localCameraStreamRef.current.getTracks().forEach((track) => {
          console.log(`[MEDIA] local ${track.kind} track added to camera PC:`, track.id, track.label);
          pc.addTrack(track, localCameraStreamRef.current!);
        });
      }

      // If initiator, create reliable & ordered DataChannel
      if (isInitiatorRef.current) {
        try {
          console.log('[DATACHANNEL] Creating DataChannel ("chat", ordered: true)');
          const dc = pc.createDataChannel('chat', { ordered: true });
          setupDataChannel(dc);
        } catch (err) {
          console.error('[DATACHANNEL] Error creating DataChannel:', err);
        }
      }

      // Receiver handles ondatachannel
      pc.ondatachannel = (event) => {
        console.log('[DATACHANNEL] DataChannel received from peer');
        setupDataChannel(event.channel);
      };

      // Handle local ICE candidates for Camera PC
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const destination = partnerPeerIdRef.current || targetId;
          sendSignalingRef.current({
            type: 'ice-candidate',
            candidate: event.candidate.toJSON(),
            targetPeerId: destination,
            senderPeerId: peerId,
          });
        }
      };

      // Handle remote tracks on Camera PC (Camera and Microphone ONLY)
      pc.ontrack = (event) => {
        const track = event.track;
        console.log(`[CAMERA PC ontrack] kind=${track.kind}, id=${track.id}`);

        if (track.kind === 'video') {
          setRemoteHasCamera(true);
          setRemoteCameraStream((prev) => {
            const existingTracks = prev ? prev.getTracks().filter((t) => t.id !== track.id && t.kind !== 'video') : [];
            const newStream = new MediaStream([...existingTracks, track]);
            remoteCameraStreamRef.current = newStream;
            return newStream;
          });

          track.onended = () => {
            console.log('[MEDIA] remote camera video track ended');
            setRemoteHasCamera(false);
          };
        } else if (track.kind === 'audio') {
          setRemoteHasMic(true);
          setRemoteCameraStream((prev) => {
            const existingTracks = prev ? prev.getTracks().filter((t) => t.id !== track.id && t.kind !== 'audio') : [];
            const newStream = new MediaStream([...existingTracks, track]);
            remoteCameraStreamRef.current = newStream;
            return newStream;
          });
        }
      };

      // Connection states
      pc.onconnectionstatechange = () => {
        console.log('[CAMERA PC] connectionState:', pc.connectionState);
        setConnState(pc.connectionState);
        if (pc.connectionState === 'connected') {
          setConnectionStatus('connected');
          setErrorMessage(null);
        } else if (pc.connectionState === 'connecting') {
          setConnectionStatus('connecting-peer');
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          setConnectionStatus('connecting-peer');
        } else if (pc.connectionState === 'closed') {
          setConnectionStatus('waiting-partner');
        }
      };

      pc.onsignalingstatechange = () => {
        setSignalingState(pc.signalingState);
      };

      pc.oniceconnectionstatechange = () => {
        setIceState(pc.iceConnectionState);
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          setConnectionStatus('connected');
          setErrorMessage(null);
        } else if (pc.iceConnectionState === 'failed') {
          pc.restartIce();
        }
      };

      return pc;
    },
    [peerId, setupDataChannel]
  );
  const createCameraPeerConnectionRef = useRef(createCameraPeerConnection);
  createCameraPeerConnectionRef.current = createCameraPeerConnection;

  // Clean up RTCPeerConnections
  const cleanupPeerConnections = useCallback(() => {
    if (pcRef.current) {
      console.log('[WEBRTC] Cleaning up Camera RTCPeerConnection');
      pcRef.current.ontrack = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
    stopMovieStreamingRef.current();
    setDataChannelState('idle');
    setRemoteCameraStream(null);
    remoteCameraStreamRef.current = null;
    setRemoteHasCamera(false);
    setRemoteHasMic(false);
    cameraIceQueueRef.current = [];
    movieIceQueueRef.current = [];
  }, []);
  const cleanupPeerConnectionsRef = useRef(cleanupPeerConnections);
  cleanupPeerConnectionsRef.current = cleanupPeerConnections;

  // Periodic WebRTC Outbound/Inbound Diagnostics (Part 8 & 14)
  useEffect(() => {
    statsIntervalRef.current = window.setInterval(async () => {
      const pc = moviePcRef.current;
      if (!pc) return;

      try {
        const stats = await pc.getStats();
        let framesEncoded = 0;
        let framesSent = 0;
        let outboundWidth = 0;
        let outboundHeight = 0;
        let bytesSent = 0;
        let outboundFps = 0;
        let framesReceived = 0;
        let framesDecoded = 0;
        let inboundWidth = 0;
        let inboundHeight = 0;
        let bytesReceived = 0;
        let inboundFps = 0;
        let packetsLost = 0;

        stats.forEach((report) => {
          if (report.type === 'outbound-rtp' && report.kind === 'video') {
            framesEncoded = report.framesEncoded || 0;
            framesSent = report.framesSent || 0;
            bytesSent = report.bytesSent || 0;
            outboundFps = report.framesPerSecond || 0;
            outboundWidth = report.frameWidth || 0;
            outboundHeight = report.frameHeight || 0;
          }
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            framesReceived = report.framesReceived || 0;
            framesDecoded = report.framesDecoded || 0;
            bytesReceived = report.bytesReceived || 0;
            inboundFps = report.framesPerSecond || 0;
            inboundWidth = report.frameWidth || 0;
            inboundHeight = report.frameHeight || 0;
            packetsLost = report.packetsLost || 0;
          }
        });

        setWebrtcStats({
          framesEncoded,
          framesSent,
          outboundWidth,
          outboundHeight,
          bytesSent,
          outboundFps,
          framesReceived,
          framesDecoded,
          inboundWidth,
          inboundHeight,
          bytesReceived,
          inboundFps,
          packetsLost,
        });
      } catch {
        // Ignore stats polling errors
      }
    }, 1000);

    return () => {
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
      }
    };
  }, []);

  // Toggle Camera
  const toggleCamera = useCallback(async () => {
    const stream = localCameraStreamRef.current;
    const videoTrack = stream ? stream.getVideoTracks()[0] : null;

    if (!videoTrack) {
      await initLocalMediaRef.current();
      return;
    }

    const newState = !videoTrack.enabled;
    videoTrack.enabled = newState;
    setMediaState((prev) => ({ ...prev, isCameraOn: newState }));
  }, []);

  // Toggle Microphone
  const toggleMic = useCallback(async () => {
    const stream = localCameraStreamRef.current;
    const audioTrack = stream ? stream.getAudioTracks()[0] : null;

    if (!audioTrack) {
      await initLocalMediaRef.current();
      return;
    }

    const newState = !audioTrack.enabled;
    audioTrack.enabled = newState;
    setMediaState((prev) => ({ ...prev, isMicOn: newState }));
  }, []);

  // Send Chat Message
  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const messageObj: ChatMessage = {
        id: 'msg-' + Math.random().toString(36).substring(2, 9),
        sender: 'local',
        senderPeerId: peerId,
        text: trimmed,
        timestamp: Date.now(),
      };

      addChatMessageRef.current(messageObj);

      let sent = false;
      if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
        try {
          dataChannelRef.current.send(
            JSON.stringify({
              type: 'chat',
              id: messageObj.id,
              text: messageObj.text,
              senderPeerId: peerId,
              timestamp: messageObj.timestamp,
            })
          );
          sent = true;
        } catch (e) {
          console.warn('[CHAT] DataChannel send error:', e);
        }
      }

      if (!sent && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        sendSignalingRef.current({
          type: 'chat-message',
          id: messageObj.id,
          text: messageObj.text,
          senderPeerId: peerId,
          timestamp: messageObj.timestamp,
        });
      }
    },
    [peerId]
  );

  // Leave Room
  const leaveRoom = useCallback(() => {
    isLeavingRef.current = true;

    if (localCameraStreamRef.current) {
      localCameraStreamRef.current.getTracks().forEach((t) => t.stop());
      localCameraStreamRef.current = null;
      setLocalCameraStream(null);
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      sendSignalingRef.current({
        type: 'leave-room',
        roomId,
        peerId,
      });
      wsRef.current.close();
      wsRef.current = null;
    }

    if (pingIntervalRef.current) {
      window.clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    cleanupPeerConnectionsRef.current();
    setConnectionStatus('idle');
    setPartnerPeerId(null);
    partnerPeerIdRef.current = null;
    setMediaSource(null);
    setMovieTabInfo(null);
    setMessages([]);
    setErrorMessage(null);
    setMediaState({
      isCameraOn: false,
      isMicOn: false,
      isScreenSharing: false,
      hasCameraPermission: false,
      hasMicPermission: false,
    });
  }, [peerId, roomId]);

  // Connect to Signaling Server and Join Room
  useEffect(() => {
    if (!roomId) return;

    isLeavingRef.current = false;
    setConnectionStatus('connecting-server');
    const signalingUrl = getSignalingServerUrl();

    console.log('[SIGNALING] connecting to:', getSignalingServerUrl());

    let ws: WebSocket;
    try {
      ws = new WebSocket(signalingUrl);
      wsRef.current = ws;
    } catch (e: any) {
      setConnectionStatus('error');
      reportErrorRef.current('Unable to connect to signaling server at ' + signalingUrl);
      return;
    }

    pingIntervalRef.current = window.setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 15000);

    ws.onopen = () => {
      console.log('[SIGNALING] connected');
      ws.send(JSON.stringify({ type: 'join-room', roomId, peerId }));
    };

    ws.onmessage = async (event) => {
      try {
        const msg: ServerSignalingMessage = JSON.parse(event.data);

        switch (msg.type) {
          case 'pong':
            break;

          case 'room-joined': {
            isInitiatorRef.current = msg.isInitiator;
            setIsHost(msg.isInitiator);

            if (msg.otherPeerId) {
              setPartnerPeerId(msg.otherPeerId);
              partnerPeerIdRef.current = msg.otherPeerId;
              setConnectionStatus('connecting-peer');
              addChatMessageRef.current({
                id: 'sys-joined',
                sender: 'system',
                text: 'Connected to room! Initializing camera and mic...',
                timestamp: Date.now(),
              });

              await initLocalMediaRef.current();
            } else {
              setConnectionStatus('waiting-partner');
              addChatMessageRef.current({
                id: 'sys-waiting',
                sender: 'system',
                text: 'You created the room (Host). Share the invite link with your partner to watch together!',
                timestamp: Date.now(),
              });

              await initLocalMediaRef.current();
            }
            break;
          }

          case 'partner-joined': {
            setPartnerPeerId(msg.peerId);
            partnerPeerIdRef.current = msg.peerId;
            setConnectionStatus('connecting-peer');
            addChatMessageRef.current({
              id: 'sys-partner-joined-' + Date.now(),
              sender: 'system',
              text: 'Partner joined! Connecting camera, audio, and cinema...',
              timestamp: Date.now(),
            });

            await initLocalMediaRef.current();
            const pc = createCameraPeerConnectionRef.current(msg.peerId);

            try {
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              sendSignalingRef.current({
                type: 'offer',
                sdp: offer,
                targetPeerId: msg.peerId,
                senderPeerId: peerId,
              });
            } catch (offerErr) {
              console.error('[WEBRTC] Error creating camera offer:', offerErr);
            }

            // Part 18: If Host is already streaming movie, automatically establish movie connection for new partner
            if (localMovieStreamRef.current && localMovieStreamRef.current.getTracks().length > 0) {
              console.log('[HOST] Re-establishing movie stream for new partner');
              startMovieStreamingRef.current(localMovieStreamRef.current);
            }
            break;
          }

          case 'partner-left': {
            setPartnerPeerId(null);
            partnerPeerIdRef.current = null;
            setConnectionStatus('partner-disconnected');

            if (pcRef.current) {
              pcRef.current.close();
              pcRef.current = null;
            }
            if (moviePcRef.current) {
              moviePcRef.current.close();
              moviePcRef.current = null;
            }
            setRemoteCameraStream(null);
            remoteCameraStreamRef.current = null;
            setRemoteMovieStream(null);
            remoteMovieStreamRef.current = null;
            setRemoteHasCamera(false);
            setRemoteHasMic(false);

            addChatMessageRef.current({
              id: 'sys-partner-left-' + Date.now(),
              sender: 'system',
              text: 'Partner disconnected. Waiting for partner to rejoin...',
              timestamp: Date.now(),
            });
            break;
          }

          case 'room-full': {
            setConnectionStatus('room-full');
            reportErrorRef.current(msg.message || 'This room already has 2 participants.');
            if (onRoomFullRef.current) onRoomFullRef.current(msg.message);
            break;
          }

          case 'offer': {
            setPartnerPeerId(msg.senderPeerId);
            partnerPeerIdRef.current = msg.senderPeerId;
            setConnectionStatus('connecting-peer');

            await initLocalMediaRef.current();
            const pc = createCameraPeerConnectionRef.current(msg.senderPeerId);

            try {
              await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));

              while (cameraIceQueueRef.current.length > 0) {
                const cand = cameraIceQueueRef.current.shift();
                if (cand) {
                  await pc.addIceCandidate(new RTCIceCandidate(cand));
                }
              }

              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);

              sendSignalingRef.current({
                type: 'answer',
                sdp: answer,
                targetPeerId: msg.senderPeerId,
                senderPeerId: peerId,
              });
            } catch (err) {
              console.error('[WEBRTC] Error handling camera offer:', err);
            }
            break;
          }

          case 'answer': {
            if (pcRef.current) {
              try {
                await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.sdp));

                while (cameraIceQueueRef.current.length > 0) {
                  const cand = cameraIceQueueRef.current.shift();
                  if (cand) {
                    await pcRef.current.addIceCandidate(new RTCIceCandidate(cand));
                  }
                }
              } catch (err) {
                console.error('[WEBRTC] Error setting remote camera answer:', err);
              }
            }
            break;
          }

          case 'ice-candidate': {
            if (msg.candidate) {
              if (pcRef.current && pcRef.current.remoteDescription && pcRef.current.remoteDescription.type) {
                try {
                  await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
                } catch (err) {
                  console.error('[ICE] Error adding camera candidate:', err);
                }
              } else {
                cameraIceQueueRef.current.push(msg.candidate);
              }
            }
            break;
          }

          // Dedicated Movie WebRTC Message Handlers
          case 'movie-offer': {
            console.log('[WEBRTC] Received movie-offer from:', msg.senderPeerId);
            handleMovieOfferRef.current(msg.sdp, msg.senderPeerId);
            break;
          }

          case 'movie-answer': {
            console.log('[WEBRTC] Received movie-answer from:', msg.senderPeerId);
            handleMovieAnswerRef.current(msg.sdp);
            break;
          }

          case 'movie-ice-candidate': {
            if (msg.candidate) {
              if (moviePcRef.current && moviePcRef.current.remoteDescription && moviePcRef.current.remoteDescription.type) {
                try {
                  await moviePcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
                } catch (err) {
                  console.error('[ICE] Error adding movie candidate:', err);
                }
              } else {
                movieIceQueueRef.current.push(msg.candidate);
              }
            }
            break;
          }

          case 'screen-share-status': {
            console.log('[WEBRTC] screen-share-status:', msg.isSharing);
            setMediaState((prev) => ({ ...prev, isScreenSharing: msg.isSharing }));
            if (!msg.isSharing) {
              if (moviePcRef.current) {
                moviePcRef.current.close();
                moviePcRef.current = null;
              }
              setRemoteMovieStream(null);
              remoteMovieStreamRef.current = null;
            }
            break;
          }

          case 'chat-message': {
            addChatMessageRef.current({
              id: msg.id,
              sender: 'remote',
              senderPeerId: msg.senderPeerId,
              text: msg.text,
              timestamp: msg.timestamp,
            });
            break;
          }

          case 'error': {
            reportErrorRef.current(msg.message);
            break;
          }
        }
      } catch (err) {
        console.error('[SIGNALING] Error processing message:', err);
      }
    };

    ws.onerror = () => {
      console.error('[SIGNALING] connection error');
      if (!isLeavingRef.current) {
        setConnectionStatus('error');
        reportErrorRef.current('Signaling server connection error. Ensure backend is running on port 3001.');
      }
    };

    ws.onclose = (event) => {
      console.log('[SIGNALING] closed', event.code, event.reason);
      if (!isLeavingRef.current && connectionStatus !== 'room-full') {
        setConnectionStatus('error');
      }
    };

    return () => {
      if (pingIntervalRef.current) {
        window.clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'leave-room', roomId, peerId }));
        ws.close();
      }
      cleanupPeerConnectionsRef.current();
    };
  }, [roomId, peerId]);

  return {
    connectionStatus,
    peerId,
    partnerPeerId,
    isHost,
    iceState,
    signalingState,
    connState,
    movieConnState,
    movieIceState,
    movieSignalingState,
    dataChannelState,
    messages,
    errorMessage,
    mediaState,
    remoteHasCamera,
    remoteHasMic,
    localCameraStream,
    remoteCameraStream,
    localMovieStream,
    remoteMovieStream,
    mediaSource,
    setMediaSource,
    movieTabInfo,
    isExtensionInstalled,
    captureState,
    webrtcStats,
    openMovieTab,
    startMovieStreaming,
    stopMovieStreaming,
    toggleCamera,
    toggleMic,
    sendMessage,
    leaveRoom,
    clearError: () => setErrorMessage(null),
  };
}
