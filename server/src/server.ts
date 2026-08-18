import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { ClientMessage, ServerMessage, Room, Participant } from './types.js';

const PORT = parseInt(process.env.PORT || '3001', 10);
const rooms = new Map<string, Room>();
const socketToRoomPeer = new Map<WebSocket, { roomId: string; peerId: string }>();

// Simple HTTP server for health checks
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        activeRooms: rooms.size,
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

const wss = new WebSocketServer({ server });

function send(ws: WebSocket, message: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function handleLeave(ws: WebSocket) {
  const mapping = socketToRoomPeer.get(ws);
  if (!mapping) return;

  const { roomId, peerId } = mapping;
  socketToRoomPeer.delete(ws);

  const room = rooms.get(roomId);
  if (!room) return;

  // Only remove participant if this socket is the current active socket for the peer
  const currentParticipant = room.participants.get(peerId);
  if (currentParticipant && currentParticipant.ws === ws) {
    room.participants.delete(peerId);
    console.log(`[ROOM] [Room ${roomId}] Peer ${peerId} left. Remaining: ${room.participants.size}`);

    // Notify the other peer if present
    for (const [otherId, participant] of room.participants.entries()) {
      console.log(`[ROOM] [Room ${roomId}] Notifying partner ${otherId} that peer ${peerId} left`);
      send(participant.ws, {
        type: 'partner-left',
        peerId,
      });
    }

    if (room.participants.size === 0) {
      rooms.delete(roomId);
      console.log(`[ROOM] [Room ${roomId}] Closed empty room.`);
    }
  } else {
    console.log(`[ROOM] [Room ${roomId}] Old socket closed for peer ${peerId}; active socket preserved.`);
  }
}

wss.on('connection', (ws: WebSocket) => {
  console.log('[SIGNALING] New WebSocket client connected');

  ws.on('message', (rawData: string) => {
    try {
      const msg: ClientMessage = JSON.parse(rawData.toString());

      if (msg.type === 'ping') {
        send(ws, { type: 'pong' });
        return;
      }

      if (msg.type === 'join-room') {
        const { roomId, peerId } = msg;
        console.log(`[ROOM] Peer ${peerId} requesting to join room ${roomId}`);

        // Clean up any previous room mapping for this socket
        handleLeave(ws);

        let room = rooms.get(roomId);
        if (!room) {
          room = {
            id: roomId,
            participants: new Map<string, Participant>(),
            createdAt: Date.now(),
          };
          rooms.set(roomId, room);
          console.log(`[ROOM] Created new room ${roomId}`);
        }

        // Check if room is full (max 2 participants)
        if (room.participants.size >= 2 && !room.participants.has(peerId)) {
          console.warn(`[ROOM] Rejected ${peerId}: Room ${roomId} is full (has ${room.participants.size})`);
          send(ws, {
            type: 'room-full',
            roomId,
            message: 'This private room is full (maximum 2 participants allowed).',
          });
          return;
        }

        const isInitiator = room.participants.size === 0;
        let otherPeerId: string | undefined;

        if (room.participants.size === 1) {
          const firstPeer = Array.from(room.participants.keys())[0];
          otherPeerId = firstPeer;
        }

        // Add participant
        room.participants.set(peerId, {
          peerId,
          ws,
          joinedAt: Date.now(),
        });
        socketToRoomPeer.set(ws, { roomId, peerId });

        console.log(`[ROOM] [Room ${roomId}] Peer ${peerId} joined. isInitiator=${isInitiator}, otherPeer=${otherPeerId || 'none'}, total=${room.participants.size}`);

        // Acknowledge joining to the sender
        send(ws, {
          type: 'room-joined',
          roomId,
          peerId,
          isInitiator,
          otherPeerId,
        });

        // Notify existing participant that partner joined
        if (otherPeerId) {
          const existingParticipant = room.participants.get(otherPeerId);
          if (existingParticipant) {
            console.log(`[ROOM] [Room ${roomId}] Sending partner-joined to existing peer ${otherPeerId} for new peer ${peerId}`);
            send(existingParticipant.ws, {
              type: 'partner-joined',
              peerId,
            });
          }
        }
        return;
      }

      if (msg.type === 'leave-room') {
        handleLeave(ws);
        return;
      }

      const mapping = socketToRoomPeer.get(ws);
      if (!mapping) {
        send(ws, {
          type: 'error',
          message: 'You are not in a room.',
        });
        return;
      }

      const room = rooms.get(mapping.roomId);
      if (!room) return;

      // WebRTC Signaling Direct Routing (Never broadcast, never self-send)
      if (msg.type === 'offer') {
        console.log(`[SIGNALING] [Room ${mapping.roomId}] OFFER: ${msg.senderPeerId} -> ${msg.targetPeerId}`);
        const target = room.participants.get(msg.targetPeerId);
        if (target) {
          send(target.ws, {
            type: 'offer',
            sdp: msg.sdp,
            senderPeerId: msg.senderPeerId,
          });
        } else {
          console.warn(`[SIGNALING] OFFER target ${msg.targetPeerId} not found in room ${mapping.roomId}`);
        }
        return;
      }

      if (msg.type === 'answer') {
        console.log(`[SIGNALING] [Room ${mapping.roomId}] ANSWER: ${msg.senderPeerId} -> ${msg.targetPeerId}`);
        const target = room.participants.get(msg.targetPeerId);
        if (target) {
          send(target.ws, {
            type: 'answer',
            sdp: msg.sdp,
            senderPeerId: msg.senderPeerId,
          });
        } else {
          console.warn(`[SIGNALING] ANSWER target ${msg.targetPeerId} not found in room ${mapping.roomId}`);
        }
        return;
      }

      if (msg.type === 'ice-candidate') {
        console.log(`[SIGNALING] [Room ${mapping.roomId}] ICE: ${msg.senderPeerId} -> ${msg.targetPeerId}`);
        const target = room.participants.get(msg.targetPeerId);
        if (target) {
          send(target.ws, {
            type: 'ice-candidate',
            candidate: msg.candidate,
            senderPeerId: msg.senderPeerId,
          });
        } else {
          console.warn(`[SIGNALING] ICE target ${msg.targetPeerId} not found in room ${mapping.roomId}`);
        }
        return;
      }

      if (msg.type === 'movie-offer') {
        console.log(`[SIGNALING] [Room ${mapping.roomId}] MOVIE_OFFER: ${msg.senderPeerId} -> ${msg.targetPeerId}`);
        const target = room.participants.get(msg.targetPeerId);
        if (target) {
          send(target.ws, {
            type: 'movie-offer',
            sdp: msg.sdp,
            senderPeerId: msg.senderPeerId,
          });
        } else {
          console.warn(`[SIGNALING] MOVIE_OFFER target ${msg.targetPeerId} not found in room ${mapping.roomId}`);
        }
        return;
      }

      if (msg.type === 'movie-answer') {
        console.log(`[SIGNALING] [Room ${mapping.roomId}] MOVIE_ANSWER: ${msg.senderPeerId} -> ${msg.targetPeerId}`);
        const target = room.participants.get(msg.targetPeerId);
        if (target) {
          send(target.ws, {
            type: 'movie-answer',
            sdp: msg.sdp,
            senderPeerId: msg.senderPeerId,
          });
        } else {
          console.warn(`[SIGNALING] MOVIE_ANSWER target ${msg.targetPeerId} not found in room ${mapping.roomId}`);
        }
        return;
      }

      if (msg.type === 'movie-ice-candidate') {
        console.log(`[SIGNALING] [Room ${mapping.roomId}] MOVIE_ICE: ${msg.senderPeerId} -> ${msg.targetPeerId}`);
        const target = room.participants.get(msg.targetPeerId);
        if (target) {
          send(target.ws, {
            type: 'movie-ice-candidate',
            candidate: msg.candidate,
            senderPeerId: msg.senderPeerId,
          });
        } else {
          console.warn(`[SIGNALING] MOVIE_ICE target ${msg.targetPeerId} not found in room ${mapping.roomId}`);
        }
        return;
      }

      if (msg.type === 'screen-share-status') {
        console.log(`[SIGNALING] [Room ${mapping.roomId}] SCREEN_STATUS: ${msg.senderPeerId} -> ${msg.targetPeerId} (isSharing=${msg.isSharing})`);
        const target = room.participants.get(msg.targetPeerId);
        if (target) {
          send(target.ws, {
            type: 'screen-share-status',
            isSharing: msg.isSharing,
            senderPeerId: msg.senderPeerId,
          });
        }
        return;
      }

      if (msg.type === 'media-source') {
        console.log(`[SIGNALING] [Room ${mapping.roomId}] MEDIA_SOURCE: ${msg.senderPeerId} -> partner(s) (type=${msg.source?.type})`);
        for (const [id, participant] of room.participants.entries()) {
          if (id !== msg.senderPeerId) {
            send(participant.ws, {
              type: 'media-source',
              source: msg.source,
              senderPeerId: msg.senderPeerId,
            });
          }
        }
        return;
      }

      if (msg.type === 'media-play') {
        console.log(`[SIGNALING] [Room ${mapping.roomId}] MEDIA_PLAY: ${msg.senderPeerId} -> partner(s) (at ${msg.currentTime})`);
        for (const [id, participant] of room.participants.entries()) {
          if (id !== msg.senderPeerId) {
            send(participant.ws, {
              type: 'media-play',
              currentTime: msg.currentTime,
              sentAt: msg.sentAt,
              senderPeerId: msg.senderPeerId,
            });
          }
        }
        return;
      }

      if (msg.type === 'media-pause') {
        console.log(`[SIGNALING] [Room ${mapping.roomId}] MEDIA_PAUSE: ${msg.senderPeerId} -> partner(s) (at ${msg.currentTime})`);
        for (const [id, participant] of room.participants.entries()) {
          if (id !== msg.senderPeerId) {
            send(participant.ws, {
              type: 'media-pause',
              currentTime: msg.currentTime,
              sentAt: msg.sentAt,
              senderPeerId: msg.senderPeerId,
            });
          }
        }
        return;
      }

      if (msg.type === 'media-seek') {
        console.log(`[SIGNALING] [Room ${mapping.roomId}] MEDIA_SEEK: ${msg.senderPeerId} -> partner(s) (to ${msg.currentTime})`);
        for (const [id, participant] of room.participants.entries()) {
          if (id !== msg.senderPeerId) {
            send(participant.ws, {
              type: 'media-seek',
              currentTime: msg.currentTime,
              sentAt: msg.sentAt,
              senderPeerId: msg.senderPeerId,
            });
          }
        }
        return;
      }

      if (msg.type === 'media-sync') {
        for (const [id, participant] of room.participants.entries()) {
          if (id !== msg.senderPeerId) {
            send(participant.ws, {
              type: 'media-sync',
              currentTime: msg.currentTime,
              playing: msg.playing,
              sentAt: msg.sentAt,
              senderPeerId: msg.senderPeerId,
            });
          }
        }
        return;
      }

      if (msg.type === 'media-state') {
        console.log(`[SIGNALING] [Room ${mapping.roomId}] MEDIA_STATE: ${msg.senderPeerId} -> partner(s)`);
        for (const [id, participant] of room.participants.entries()) {
          if (id !== msg.senderPeerId) {
            send(participant.ws, {
              type: 'media-state',
              source: msg.source,
              currentTime: msg.currentTime,
              playing: msg.playing,
              sentAt: msg.sentAt,
              senderPeerId: msg.senderPeerId,
            });
          }
        }
        return;
      }

      if (msg.type === 'media-request-state') {
        console.log(`[SIGNALING] [Room ${mapping.roomId}] MEDIA_REQUEST_STATE from ${msg.senderPeerId}`);
        for (const [id, participant] of room.participants.entries()) {
          if (id !== msg.senderPeerId) {
            send(participant.ws, {
              type: 'media-request-state',
              senderPeerId: msg.senderPeerId,
            });
          }
        }
        return;
      }

      if (msg.type === 'media-action') {
        console.log(`[SIGNALING] [Room ${mapping.roomId}] MEDIA_ACTION: ${msg.senderPeerId} -> partner(s) (${msg.action} at ${msg.currentTime})`);
        for (const [id, participant] of room.participants.entries()) {
          if (id !== msg.senderPeerId) {
            send(participant.ws, {
              type: 'media-action',
              action: msg.action,
              currentTime: msg.currentTime,
              timestamp: msg.timestamp,
              senderPeerId: msg.senderPeerId,
            });
          }
        }
        return;
      }

      if (msg.type === 'media-request-sync') {
        for (const [id, participant] of room.participants.entries()) {
          if (id !== msg.senderPeerId) {
            send(participant.ws, {
              type: 'media-request-state',
              senderPeerId: msg.senderPeerId,
            });
          }
        }
        return;
      }

      if (msg.type === 'chat-message') {
        console.log(`[SIGNALING] [Room ${mapping.roomId}] CHAT: ${msg.senderPeerId} -> partner(s)`);
        for (const [id, participant] of room.participants.entries()) {
          if (id !== msg.senderPeerId) {
            send(participant.ws, {
              type: 'chat-message',
              id: msg.id,
              text: msg.text,
              senderPeerId: msg.senderPeerId,
              timestamp: msg.timestamp,
            });
          }
        }
        return;
      }
    } catch (err) {
      console.error('[SIGNALING] Error handling WebSocket message:', err);
    }
  });

  ws.on('close', () => {
    handleLeave(ws);
  });

  ws.on('error', (err) => {
    console.error('[SIGNALING] WebSocket client error:', err);
    handleLeave(ws);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 WatchTogether Signaling Server running on http/ws://localhost:${PORT}`);
});
