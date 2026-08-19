export function getIceServers(): RTCIceServer[] {
  const iceServers: RTCIceServer[] = [];

  const stunServer = import.meta.env.VITE_STUN_SERVER || 'stun:stun.l.google.com:19302';
  if (stunServer) {
    const urls = stunServer.split(',').map((s: string) => s.trim()).filter(Boolean);
    iceServers.push({ urls });
  }

  const turnServer = import.meta.env.VITE_TURN_SERVER;
  const turnUsername = import.meta.env.VITE_TURN_USERNAME;
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL;

  if (turnServer) {
    const urls = turnServer.split(',').map((s: string) => s.trim()).filter(Boolean);
    const turnConfig: RTCIceServer = { urls };
    if (turnUsername) {
      turnConfig.username = turnUsername;
    }
    if (turnCredential) {
      turnConfig.credential = turnCredential;
    }
    iceServers.push(turnConfig);
  }

  return iceServers;
}

export function getSignalingServerUrl(): string {
  const configured = import.meta.env.VITE_SIGNALING_SERVER_URL?.trim();

  if (configured) {
    const clean = configured.replace(/\/+$/, '');
    return clean.endsWith('/ws') ? clean : `${clean}/ws`;
  }

  if (import.meta.env.PROD) {
    return 'wss://watchtogether-h611.onrender.com/ws';
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const hostname = window.location.hostname || 'localhost';

  return `${protocol}//${hostname}:3001/ws`;
}

export function generateRoomId(): string {
  // Generate a friendly, readable 6-character room code (e.g., 'wt-7x9k')
  const chars = '23456789abcdefghjkmnpqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function generatePeerId(): string {
  return 'peer-' + Math.random().toString(36).substring(2, 9);
}
