export type ConnectionStatus =
  | 'idle'
  | 'connecting-server'
  | 'waiting-partner'
  | 'partner-joined'
  | 'connecting-peer'
  | 'connected'
  | 'partner-disconnected'
  | 'room-full'
  | 'error';

export interface ChatMessage {
  id: string;
  sender: 'local' | 'remote' | 'system';
  senderPeerId?: string;
  text: string;
  timestamp: number;
}

export interface MediaState {
  isCameraOn: boolean;
  isMicOn: boolean;
  isScreenSharing: boolean;
  hasCameraPermission: boolean;
  hasMicPermission: boolean;
}

export interface RemoteMediaState {
  hasVideo: boolean;
  hasAudio: boolean;
  isScreenSharing: boolean;
}

export type MediaSourceType = 'direct-video' | 'webpage' | 'youtube' | 'iframe' | 'unsupported';

export interface MediaSourceState {
  url: string;
  type: MediaSourceType;
  title?: string;
  youtubeId?: string;
  currentTime?: number;
  isPlaying?: boolean;
  updatedAt?: number;
}

export interface SyncPlayEvent {
  type: 'media-play';
  currentTime: number;
  sentAt: number;
}

export interface SyncPauseEvent {
  type: 'media-pause';
  currentTime: number;
  sentAt: number;
}

export interface SyncSeekEvent {
  type: 'media-seek';
  currentTime: number;
  sentAt: number;
}

export interface SyncPositionEvent {
  type: 'media-sync';
  currentTime: number;
  playing: boolean;
  sentAt: number;
}

export interface SyncStateEvent {
  type: 'media-state';
  source: MediaSourceState | null;
  currentTime: number;
  playing: boolean;
  sentAt: number;
}

export type ClientSignalingMessage =
  | { type: 'join-room'; roomId: string; peerId: string }
  | { type: 'leave-room'; roomId: string; peerId: string }
  | { type: 'offer'; sdp: RTCSessionDescriptionInit; targetPeerId: string; senderPeerId: string }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit; targetPeerId: string; senderPeerId: string }
  | { type: 'ice-candidate'; candidate: RTCIceCandidateInit; targetPeerId: string; senderPeerId: string }
  | { type: 'movie-offer'; sdp: RTCSessionDescriptionInit; targetPeerId: string; senderPeerId: string }
  | { type: 'movie-answer'; sdp: RTCSessionDescriptionInit; targetPeerId: string; senderPeerId: string }
  | { type: 'movie-ice-candidate'; candidate: RTCIceCandidateInit; targetPeerId: string; senderPeerId: string }
  | { type: 'screen-share-status'; isSharing: boolean; targetPeerId: string; senderPeerId: string }
  | { type: 'chat-message'; id: string; text: string; senderPeerId: string; timestamp: number }
  | { type: 'media-source'; source: MediaSourceState | null; targetPeerId?: string; senderPeerId: string }
  | { type: 'media-play'; currentTime: number; sentAt: number; targetPeerId?: string; senderPeerId: string }
  | { type: 'media-pause'; currentTime: number; sentAt: number; targetPeerId?: string; senderPeerId: string }
  | { type: 'media-seek'; currentTime: number; sentAt: number; targetPeerId?: string; senderPeerId: string }
  | { type: 'media-sync'; currentTime: number; playing: boolean; sentAt: number; targetPeerId?: string; senderPeerId: string }
  | { type: 'media-state'; source: MediaSourceState | null; currentTime: number; playing: boolean; sentAt: number; targetPeerId?: string; senderPeerId: string }
  | { type: 'media-request-state'; targetPeerId?: string; senderPeerId: string }
  | { type: 'ping' };

export type ServerSignalingMessage =
  | { type: 'room-joined'; roomId: string; peerId: string; isInitiator: boolean; otherPeerId?: string }
  | { type: 'partner-joined'; peerId: string }
  | { type: 'partner-left'; peerId: string }
  | { type: 'room-full'; roomId: string; message: string }
  | { type: 'offer'; sdp: RTCSessionDescriptionInit; senderPeerId: string }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit; senderPeerId: string }
  | { type: 'ice-candidate'; candidate: RTCIceCandidateInit; senderPeerId: string }
  | { type: 'movie-offer'; sdp: RTCSessionDescriptionInit; senderPeerId: string }
  | { type: 'movie-answer'; sdp: RTCSessionDescriptionInit; senderPeerId: string }
  | { type: 'movie-ice-candidate'; candidate: RTCIceCandidateInit; senderPeerId: string }
  | { type: 'screen-share-status'; isSharing: boolean; senderPeerId: string }
  | { type: 'chat-message'; id: string; text: string; senderPeerId: string; timestamp: number }
  | { type: 'media-source'; source: MediaSourceState | null; senderPeerId: string }
  | { type: 'media-play'; currentTime: number; sentAt: number; senderPeerId: string }
  | { type: 'media-pause'; currentTime: number; sentAt: number; senderPeerId: string }
  | { type: 'media-seek'; currentTime: number; sentAt: number; senderPeerId: string }
  | { type: 'media-sync'; currentTime: number; playing: boolean; sentAt: number; senderPeerId: string }
  | { type: 'media-state'; source: MediaSourceState | null; currentTime: number; playing: boolean; sentAt: number; senderPeerId: string }
  | { type: 'media-request-state'; senderPeerId: string }
  | { type: 'error'; message: string }
  | { type: 'pong' };
