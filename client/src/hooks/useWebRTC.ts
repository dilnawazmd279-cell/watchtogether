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

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  iceCandidatePoolSize: 2,
};

export function useWebRTC({ roomId, onRoomFull, onError }: UseWebRTCOptions) {
  // State
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [peerId] = useState<string>(() => generatePeerId());
  const [partnerPeerId, setPartnerPeerId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // WebRTC Live States for Diagnostic Panel
  const [iceState, setIceState] = useState<string>('new');
  const [signalingState, setSignalingState] = useState<string>('stable');
  const [connState, setConnState] = useState<string>('new');

  // Local Media State
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
  const [remoteIsScreenSharing, setRemoteIsScreenSharing] = useState(false);

  // Host Media Source State
  const [mediaSource, setMediaSource] = useState<MediaSourceState | null>(null);

  // Streams
  const [localCameraStream, setLocalCameraStream] = useState<MediaStream | null>(null);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [remoteCameraStream, setRemoteCameraStream] = useState<MediaStream | null>(null);
  const [remoteScreenStream, setRemoteScreenStream] = useState<MediaStream | null>(null);

  // WebRTC Connection 1: Camera & Chat Connection
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const iceCandidateQueueRef = useRef<RTCIceCandidateInit[]>([]);

  // WebRTC Connection 2: Dedicated Movie Connection
  const moviePcRef = useRef<RTCPeerConnection | null>(null);
  const movieIceCandidateQueueRef = useRef<RTCIceCandidateInit[]>([]);

  const isInitiatorRef = useRef<boolean>(false);
  const partnerPeerIdRef = useRef<string | null>(null);
  const remoteIsScreenSharingRef = useRef<boolean>(false);
  const pingIntervalRef = useRef<number | null>(null);
  const mediaPromiseRef = useRef<Promise<MediaStream | null> | null>(null);
  const onRoomFullRef = useRef(onRoomFull);
  const onErrorRef = useRef(onError);

  // Stream Refs
  const localCameraStreamRef = useRef<MediaStream | null>(null);
  const localScreenStreamRef = useRef<MediaStream | null>(null);
  const remoteCameraStreamRef = useRef<MediaStream | null>(null);
  const remoteScreenStreamRef = useRef<MediaStream | null>(null);

  const isLeavingRef = useRef<boolean>(false);

  // Keep refs in sync
  useEffect(() => {
    partnerPeerIdRef.current = partnerPeerId;
  }, [partnerPeerId]);

  useEffect(() => {
    localCameraStreamRef.current = localCameraStream;
  }, [localCameraStream]);

  useEffect(() => {
    localScreenStreamRef.current = localScreenStream;
  }, [localScreenStream]);

  useEffect(() => {
    remoteCameraStreamRef.current = remoteCameraStream;
  }, [remoteCameraStream]);

  useEffect(() => {
    remoteScreenStreamRef.current = remoteScreenStream;
  }, [remoteScreenStream]);

  useEffect(() => {
    remoteIsScreenSharingRef.current = remoteIsScreenSharing;
  }, [remoteIsScreenSharing]);

  useEffect(() => {
    onRoomFullRef.current = onRoomFull;
  }, [onRoomFull]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  // Send message over WebSocket
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

  // Setup DataChannel listeners on Connection 1
  const setupDataChannel = useCallback((dc: RTCDataChannel) => {
    dataChannelRef.current = dc;

    dc.onopen = () => {
      console.log('[CHAT] DataChannel open');
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
        console.error('[CHAT] Error parsing DataChannel message:', e);
      }
    };

    dc.onerror = (err) => {
      console.error('[CHAT] DataChannel error:', err);
    };

    dc.onclose = () => {
      console.log('[CHAT] DataChannel closed');
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
  // CONNECTION 1: CAMERA & CHAT PEER CONNECTION
  // =========================================================================
  const createPeerConnection = useCallback(
    (targetId: string) => {
      if (pcRef.current) {
        return pcRef.current;
      }

      console.log('[WEBRTC] createPeerConnection for target:', targetId);

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
          console.log('[CHAT] DataChannel created ("chat", ordered: true)');
          const dc = pc.createDataChannel('chat', { ordered: true });
          setupDataChannel(dc);
        } catch (err) {
          console.error('[CHAT] Error creating DataChannel:', err);
        }
      }

      // Receiver handles ondatachannel
      pc.ondatachannel = (event) => {
        console.log('[CHAT] DataChannel received from peer');
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
  const createPeerConnectionRef = useRef(createPeerConnection);
  createPeerConnectionRef.current = createPeerConnection;

  // Clean up RTCPeerConnections
  const cleanupPeerConnections = useCallback(() => {
    if (pcRef.current) {
      console.log('[WEBRTC] Cleaning up Camera RTCPeerConnection');
      pcRef.current.ontrack = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    if (moviePcRef.current) {
      console.log('[WEBRTC] Cleaning up Movie RTCPeerConnection');
      moviePcRef.current.ontrack = null;
      moviePcRef.current.onicecandidate = null;
      moviePcRef.current.close();
      moviePcRef.current = null;
    }
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
    setRemoteCameraStream(null);
    setRemoteScreenStream(null);
    remoteCameraStreamRef.current = null;
    remoteScreenStreamRef.current = null;
    setRemoteHasCamera(false);
    setRemoteHasMic(false);
    setRemoteIsScreenSharing(false);
    remoteIsScreenSharingRef.current = false;
    iceCandidateQueueRef.current = [];
    movieIceCandidateQueueRef.current = [];
  }, []);
  const cleanupPeerConnectionsRef = useRef(cleanupPeerConnections);
  cleanupPeerConnectionsRef.current = cleanupPeerConnections;

  // =========================================================================
  // CONNECTION 2: DEDICATED MOVIE PEER CONNECTION LIFECYCLE
  // =========================================================================
  const startStreamingMedia = useCallback(
    async (stream: MediaStream) => {
      const videoTracks = stream.getVideoTracks();
      const audioTracks = stream.getAudioTracks();

      console.log('[HOST MOVIE] captureStream created');
      console.log('[HOST MOVIE] video tracks =', videoTracks.length);
      console.log('[HOST MOVIE] audio tracks =', audioTracks.length);

      setLocalScreenStream(stream);
      localScreenStreamRef.current = stream;
      setMediaState((prev) => ({ ...prev, isScreenSharing: true }));

      // Clean up previous movie connection if one existed
      if (moviePcRef.current) {
        moviePcRef.current.close();
        moviePcRef.current = null;
      }

      // Create DEDICATED movie RTCPeerConnection
      const moviePc = new RTCPeerConnection(ICE_CONFIG);
      moviePcRef.current = moviePc;

      // Add movie tracks
      videoTracks.forEach((track) => {
        moviePc.addTrack(track, stream);
        console.log('[HOST MOVIE PC] sender video =', track.id);
      });

      audioTracks.forEach((track) => {
        moviePc.addTrack(track, stream);
        console.log('[HOST MOVIE PC] sender audio =', track.id);
      });

      // Handle ICE candidates for Movie PC
      moviePc.onicecandidate = (event) => {
        if (event.candidate && partnerPeerIdRef.current) {
          sendSignalingRef.current({
            type: 'movie-ice-candidate',
            candidate: event.candidate.toJSON(),
            targetPeerId: partnerPeerIdRef.current,
            senderPeerId: peerId,
          });
        }
      };

      moviePc.onconnectionstatechange = () => {
        console.log('[HOST MOVIE PC] connectionState =', moviePc.connectionState);
      };

      // Create movie offer and send to Partner
      if (partnerPeerIdRef.current) {
        try {
          console.log('[HOST WEBRTC] movie renegotiation started');
          const offer = await moviePc.createOffer();
          await moviePc.setLocalDescription(offer);
          console.log('[HOST WEBRTC] offer sent');

          sendSignalingRef.current({
            type: 'movie-offer',
            sdp: offer,
            targetPeerId: partnerPeerIdRef.current,
            senderPeerId: peerId,
          });
        } catch (err) {
          console.error('[HOST MOVIE PC] Error creating movie offer:', err);
        }
      }
    },
    [peerId]
  );

  // Stop Streaming Movie Media
  const stopStreamingMedia = useCallback(async () => {
    console.log('[CINEMA] Stopping movie stream transmission...');
    if (localScreenStreamRef.current) {
      localScreenStreamRef.current.getTracks().forEach((track) => track.stop());
      setLocalScreenStream(null);
      localScreenStreamRef.current = null;
    }

    setMediaState((prev) => ({ ...prev, isScreenSharing: false }));

    if (moviePcRef.current) {
      moviePcRef.current.close();
      moviePcRef.current = null;
    }

    if (partnerPeerIdRef.current) {
      sendSignalingRef.current({
        type: 'screen-share-status',
        isSharing: false,
        targetPeerId: partnerPeerIdRef.current,
        senderPeerId: peerId,
      });
    }
  }, [peerId]);

  // Start Screen Sharing (Fallback for webpage tabs)
  const startScreenShare = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        reportErrorRef.current('Screen sharing is not supported by your browser.');
        return;
      }

      console.log('[ScreenShare] Requesting browser display media...');
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'browser',
          cursor: 'always',
        } as MediaTrackConstraints,
        audio: true,
      });

      console.log('[ScreenShare] Display media acquired');
      await startStreamingMedia(screenStream);
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        console.log('[ScreenShare] User cancelled screen share selection.');
      } else {
        console.error('[ScreenShare] Error:', err);
        reportErrorRef.current('Screen sharing failed: ' + (err.message || 'Unknown error'));
      }
    }
  }, [startStreamingMedia]);

  // Toggle Screen Sharing
  const toggleScreenShare = useCallback(() => {
    if (mediaState.isScreenSharing) {
      stopStreamingMedia();
    } else {
      startScreenShare();
    }
  }, [mediaState.isScreenSharing, startScreenShare, stopStreamingMedia]);

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

    if (localScreenStreamRef.current) {
      localScreenStreamRef.current.getTracks().forEach((t) => t.stop());
      localScreenStreamRef.current = null;
      setLocalScreenStream(null);
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
              text: 'Partner joined! Connecting audio, video, and cinema stream...',
              timestamp: Date.now(),
            });

            await initLocalMediaRef.current();
            const pc = createPeerConnectionRef.current(msg.peerId);

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
              console.error('[WEBRTC] Error creating/sending camera offer:', offerErr);
            }
            break;
          }

          case 'partner-left': {
            setPartnerPeerId(null);
            partnerPeerIdRef.current = null;
            setConnectionStatus('partner-disconnected');
            cleanupPeerConnectionsRef.current();
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

          // -----------------------------------------------------------------
          // CONNECTION 1 SIGNALING: CAMERA & CHAT
          // -----------------------------------------------------------------
          case 'offer': {
            setPartnerPeerId(msg.senderPeerId);
            partnerPeerIdRef.current = msg.senderPeerId;
            setConnectionStatus('connecting-peer');

            await initLocalMediaRef.current();
            const pc = createPeerConnectionRef.current(msg.senderPeerId);

            try {
              await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));

              while (iceCandidateQueueRef.current.length > 0) {
                const cand = iceCandidateQueueRef.current.shift();
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

                while (iceCandidateQueueRef.current.length > 0) {
                  const cand = iceCandidateQueueRef.current.shift();
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
                iceCandidateQueueRef.current.push(msg.candidate);
              }
            }
            break;
          }

          // -----------------------------------------------------------------
          // CONNECTION 2 SIGNALING: DEDICATED MOVIE PEER CONNECTION
          // -----------------------------------------------------------------
          case 'movie-offer': {
            console.log('[PARTNER WEBRTC] movie offer received');

            if (moviePcRef.current) {
              moviePcRef.current.close();
              moviePcRef.current = null;
            }

            const moviePc = new RTCPeerConnection(ICE_CONFIG);
            moviePcRef.current = moviePc;

            const remoteMovieStream = new MediaStream();

            moviePc.onconnectionstatechange = () => {
              console.log('[PARTNER MOVIE PC] connectionState:', moviePc.connectionState);
            };

            moviePc.ontrack = (event) => {
              console.log('[PARTNER MOVIE PC] TRACK RECEIVED:', event.track.kind, event.track.id);
              if (event.track.kind === 'video') {
                console.log('[PARTNER MOVIE] received video track');
                console.log('[PARTNER MOVIE] ontrack video');
              } else if (event.track.kind === 'audio') {
                console.log('[PARTNER MOVIE] received audio track');
                console.log('[PARTNER MOVIE] ontrack audio');
              }

              remoteMovieStream.addTrack(event.track);
              setRemoteScreenStream(remoteMovieStream);
              remoteScreenStreamRef.current = remoteMovieStream;
              setRemoteIsScreenSharing(true);
              remoteIsScreenSharingRef.current = true;
              console.log('[PARTNER MOVIE] remote stream created');
            };

            moviePc.onicecandidate = (event) => {
              if (event.candidate) {
                sendSignalingRef.current({
                  type: 'movie-ice-candidate',
                  candidate: event.candidate.toJSON(),
                  targetPeerId: msg.senderPeerId,
                  senderPeerId: peerId,
                });
              }
            };

            try {
              await moviePc.setRemoteDescription(new RTCSessionDescription(msg.sdp));

              while (movieIceCandidateQueueRef.current.length > 0) {
                const cand = movieIceCandidateQueueRef.current.shift();
                if (cand) {
                  await moviePc.addIceCandidate(new RTCIceCandidate(cand));
                }
              }

              const answer = await moviePc.createAnswer();
              await moviePc.setLocalDescription(answer);

              console.log('[PARTNER WEBRTC] answer sent');
              sendSignalingRef.current({
                type: 'movie-answer',
                sdp: answer,
                targetPeerId: msg.senderPeerId,
                senderPeerId: peerId,
              });
            } catch (err) {
              console.error('[PARTNER MOVIE PC] Error creating movie answer:', err);
            }
            break;
          }

          case 'movie-answer': {
            console.log('[HOST WEBRTC] answer received');
            if (moviePcRef.current) {
              try {
                await moviePcRef.current.setRemoteDescription(new RTCSessionDescription(msg.sdp));

                while (movieIceCandidateQueueRef.current.length > 0) {
                  const cand = movieIceCandidateQueueRef.current.shift();
                  if (cand) {
                    await moviePcRef.current.addIceCandidate(new RTCIceCandidate(cand));
                  }
                }
              } catch (err) {
                console.error('[HOST MOVIE PC] Error setting remote movie answer:', err);
              }
            }
            break;
          }

          case 'movie-ice-candidate': {
            if (msg.candidate) {
              if (moviePcRef.current && moviePcRef.current.remoteDescription && moviePcRef.current.remoteDescription.type) {
                try {
                  await moviePcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
                } catch (err) {
                  console.error('[MOVIE ICE] Error adding movie candidate:', err);
                }
              } else {
                movieIceCandidateQueueRef.current.push(msg.candidate);
              }
            }
            break;
          }

          case 'screen-share-status': {
            setRemoteIsScreenSharing(msg.isSharing);
            remoteIsScreenSharingRef.current = msg.isSharing;
            if (!msg.isSharing) {
              if (moviePcRef.current) {
                moviePcRef.current.close();
                moviePcRef.current = null;
              }
              setRemoteScreenStream(null);
              remoteScreenStreamRef.current = null;
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

    ws.onerror = (err) => {
      console.error('[SIGNALING] WebSocket error:', err);
      if (!isLeavingRef.current) {
        setConnectionStatus('error');
        reportErrorRef.current('Signaling server connection error. Ensure backend is running on port 3001.');
      }
    };

    ws.onclose = () => {
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
    messages,
    errorMessage,
    mediaState,
    remoteHasCamera,
    remoteHasMic,
    remoteIsScreenSharing,
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
    stopScreenShare: stopStreamingMedia,
    sendMessage,
    leaveRoom,
    clearError: () => setErrorMessage(null),
  };
}
