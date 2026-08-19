import { WebSocket } from 'ws';

const WS_URL = 'ws://localhost:3001/ws';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testFullWebRTCFlow() {
  console.log('--- Testing Full Deterministic WebRTC Signaling Flow ---');

  const roomId = 'flow-test-' + Math.random().toString(36).substring(2, 7);
  const peer1 = 'peer-creator-' + Math.random().toString(36).substring(2, 6);
  const peer2 = 'peer-joiner-' + Math.random().toString(36).substring(2, 6);

  let peer1ReceivedPartnerJoined = false;
  let peer1SentOffer = false;
  let peer2ReceivedOffer = false;
  let peer2SentAnswer = false;
  let peer1ReceivedAnswer = false;
  let peer1ReceivedIce = false;
  let peer2ReceivedIce = false;
  let peer1ReceivedScreenStatus = false;

  // 1. Peer 1 joins as creator
  const ws1 = new WebSocket(WS_URL);
  await new Promise<void>((resolve) => {
    ws1.on('open', () => {
      ws1.send(JSON.stringify({ type: 'join-room', roomId, peerId: peer1 }));
    });
    ws1.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'room-joined' && msg.isInitiator === true) {
        console.log('✓ 1. Peer 1 joined room as Initiator');
        resolve();
      }
    });
  });

  // 2. Setup Peer 1 message handler
  ws1.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());

    if (msg.type === 'partner-joined') {
      peer1ReceivedPartnerJoined = true;
      console.log('✓ 2. Peer 1 received partner-joined for:', msg.peerId);

      // Peer 1 (Initiator) creates and sends Offer
      peer1SentOffer = true;
      console.log('✓ 3. Peer 1 creating and sending SDP Offer to Peer 2');
      ws1.send(
        JSON.stringify({
          type: 'offer',
          sdp: { type: 'offer', sdp: 'v=0\r\no=- 12345 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' },
          targetPeerId: msg.peerId,
          senderPeerId: peer1,
        })
      );
    }

    if (msg.type === 'answer') {
      peer1ReceivedAnswer = true;
      console.log('✓ 6. Peer 1 received SDP Answer from Peer 2');
    }

    if (msg.type === 'ice-candidate') {
      peer1ReceivedIce = true;
      console.log('✓ 7. Peer 1 received ICE Candidate from Peer 2');
    }

    if (msg.type === 'screen-share-status') {
      peer1ReceivedScreenStatus = true;
      console.log('✓ 8. Peer 1 received screen-share-status:', msg.isSharing);
    }
  });

  // 3. Peer 2 joins
  const ws2 = new WebSocket(WS_URL);
  ws2.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());

    if (msg.type === 'room-joined') {
      console.log('✓ 4. Peer 2 joined room as Joiner (isInitiator = false, otherPeerId =', msg.otherPeerId, ')');
    }

    if (msg.type === 'offer') {
      peer2ReceivedOffer = true;
      console.log('✓ 5. Peer 2 received SDP Offer from Peer 1');

      // Peer 2 responds with Answer
      peer2SentAnswer = true;
      ws2.send(
        JSON.stringify({
          type: 'answer',
          sdp: { type: 'answer', sdp: 'v=0\r\no=- 54321 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' },
          targetPeerId: msg.senderPeerId,
          senderPeerId: peer2,
        })
      );

      // Peer 2 sends ICE candidate
      ws2.send(
        JSON.stringify({
          type: 'ice-candidate',
          candidate: { candidate: 'candidate:1 1 UDP 2122260223 127.0.0.1 50000 typ host', sdpMid: '0', sdpMLineIndex: 0 },
          targetPeerId: msg.senderPeerId,
          senderPeerId: peer2,
        })
      );
    }

    if (msg.type === 'ice-candidate') {
      peer2ReceivedIce = true;
      console.log('✓ 7b. Peer 2 received ICE Candidate from Peer 1');
    }
  });

  await new Promise<void>((resolve) => {
    ws2.on('open', () => {
      ws2.send(JSON.stringify({ type: 'join-room', roomId, peerId: peer2 }));
      resolve();
    });
  });

  await sleep(400);

  // Peer 1 sends ICE candidate to Peer 2
  ws1.send(
    JSON.stringify({
      type: 'ice-candidate',
      candidate: { candidate: 'candidate:2 1 UDP 2122260223 127.0.0.1 50001 typ host', sdpMid: '0', sdpMLineIndex: 0 },
      targetPeerId: peer2,
      senderPeerId: peer1,
    })
  );

  // Peer 2 starts screen sharing
  ws2.send(
    JSON.stringify({
      type: 'screen-share-status',
      isSharing: true,
      targetPeerId: peer1,
      senderPeerId: peer2,
    })
  );

  await sleep(400);

  ws1.close();
  ws2.close();
  await sleep(200);

  const passed =
    peer1ReceivedPartnerJoined &&
    peer1SentOffer &&
    peer2ReceivedOffer &&
    peer2SentAnswer &&
    peer1ReceivedAnswer &&
    peer1ReceivedIce &&
    peer2ReceivedIce &&
    peer1ReceivedScreenStatus;

  if (passed) {
    console.log('\n===========================================');
    console.log(' COMPLETE WEBRTC FLOW VERIFICATION PASSED! ');
    console.log('===========================================\n');
    process.exit(0);
  } else {
    console.error('❌ Verification failed', {
      peer1ReceivedPartnerJoined,
      peer1SentOffer,
      peer2ReceivedOffer,
      peer2SentAnswer,
      peer1ReceivedAnswer,
      peer1ReceivedIce,
      peer2ReceivedIce,
      peer1ReceivedScreenStatus,
    });
    process.exit(1);
  }
}

testFullWebRTCFlow().catch((e) => {
  console.error(e);
  process.exit(1);
});
