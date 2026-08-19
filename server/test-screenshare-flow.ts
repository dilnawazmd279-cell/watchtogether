import { WebSocket } from 'ws';

const WS_URL = 'ws://localhost:3001/ws';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testScreenShareFlow() {
  console.log('--- Testing Full Screen Sharing Lifecycle & Renegotiation ---');

  const roomId = 'screen-test-' + Math.random().toString(36).substring(2, 7);
  const peerA = 'peer-sharer-' + Math.random().toString(36).substring(2, 6);
  const peerB = 'peer-viewer-' + Math.random().toString(36).substring(2, 6);

  let bReceivedInitialOffer = false;
  let aReceivedInitialAnswer = false;
  let bReceivedScreenStatusTrue = false;
  let bReceivedScreenOffer = false;
  let aReceivedScreenAnswer = false;
  let bReceivedScreenStatusFalse = false;
  let bReceivedStopOffer = false;
  let aReceivedStopAnswer = false;

  const wsA = new WebSocket(WS_URL);

  // 1. Peer A joins as creator
  await new Promise<void>((resolve) => {
    wsA.on('open', () => {
      wsA.send(JSON.stringify({ type: 'join-room', roomId, peerId: peerA }));
    });
    wsA.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'room-joined' && msg.isInitiator === true) {
        console.log('✓ 1. Peer A created room as Initiator');
        resolve();
      }
    });
  });

  // Setup Peer A message handling
  wsA.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());

    if (msg.type === 'partner-joined') {
      console.log('✓ 2. Peer A received partner-joined for Peer B');
      wsA.send(
        JSON.stringify({
          type: 'offer',
          sdp: { type: 'offer', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n' },
          targetPeerId: peerB,
          senderPeerId: peerA,
        })
      );
    }

    if (msg.type === 'answer') {
      if (!aReceivedInitialAnswer) {
        aReceivedInitialAnswer = true;
        console.log('✓ 4. Peer A received initial Answer from Peer B (Initial handshake complete)');
      } else if (!aReceivedScreenAnswer) {
        aReceivedScreenAnswer = true;
        console.log('✓ 7. Peer A received renegotiation Answer for Screen Share');
      } else if (!aReceivedStopAnswer) {
        aReceivedStopAnswer = true;
        console.log('✓ 10. Peer A received renegotiation Answer for Screen Share Stop');
      }
    }
  });

  const wsB = new WebSocket(WS_URL);

  // Setup Peer B message handling
  wsB.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());

    if (msg.type === 'offer') {
      if (!bReceivedInitialOffer) {
        bReceivedInitialOffer = true;
        console.log('✓ 3. Peer B received initial Offer from Peer A');
        wsB.send(
          JSON.stringify({
            type: 'answer',
            sdp: { type: 'answer', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n' },
            targetPeerId: peerA,
            senderPeerId: peerB,
          })
        );
      } else if (!bReceivedScreenOffer) {
        bReceivedScreenOffer = true;
        console.log('✓ 6. Peer B received Screen Share Renegotiation Offer from Peer A');
        wsB.send(
          JSON.stringify({
            type: 'answer',
            sdp: { type: 'answer', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\nm=video 9 UDP/TLS/RTP/SAVPF 97\r\n' },
            targetPeerId: peerA,
            senderPeerId: peerB,
          })
        );
      } else if (!bReceivedStopOffer) {
        bReceivedStopOffer = true;
        console.log('✓ 9. Peer B received Screen Share Stop Renegotiation Offer from Peer A');
        wsB.send(
          JSON.stringify({
            type: 'answer',
            sdp: { type: 'answer', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n' },
            targetPeerId: peerA,
            senderPeerId: peerB,
          })
        );
      }
    }

    if (msg.type === 'screen-share-status') {
      if (msg.isSharing === true) {
        bReceivedScreenStatusTrue = true;
        console.log('✓ 5. Peer B received screen-share-status: true');
      } else if (msg.isSharing === false) {
        bReceivedScreenStatusFalse = true;
        console.log('✓ 8. Peer B received screen-share-status: false (Screen sharing stopped)');
      }
    }
  });

  // Peer B joins
  await new Promise<void>((resolve) => {
    wsB.on('open', () => {
      wsB.send(JSON.stringify({ type: 'join-room', roomId, peerId: peerB }));
      resolve();
    });
  });

  await sleep(250);

  // 2. Peer A starts Screen Sharing
  wsA.send(
    JSON.stringify({
      type: 'screen-share-status',
      isSharing: true,
      targetPeerId: peerB,
      senderPeerId: peerA,
    })
  );
  wsA.send(
    JSON.stringify({
      type: 'offer',
      sdp: { type: 'offer', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\nm=video 9 UDP/TLS/RTP/SAVPF 97\r\n' },
      targetPeerId: peerB,
      senderPeerId: peerA,
    })
  );

  await sleep(250);

  // 3. Peer A stops Screen Sharing
  wsA.send(
    JSON.stringify({
      type: 'screen-share-status',
      isSharing: false,
      targetPeerId: peerB,
      senderPeerId: peerA,
    })
  );
  wsA.send(
    JSON.stringify({
      type: 'offer',
      sdp: { type: 'offer', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n' },
      targetPeerId: peerB,
      senderPeerId: peerA,
    })
  );

  await sleep(300);

  wsA.close();
  wsB.close();
  await sleep(200);

  const passed =
    bReceivedInitialOffer &&
    aReceivedInitialAnswer &&
    bReceivedScreenStatusTrue &&
    bReceivedScreenOffer &&
    aReceivedScreenAnswer &&
    bReceivedScreenStatusFalse &&
    bReceivedStopOffer &&
    aReceivedStopAnswer;

  if (passed) {
    console.log('\n======================================================');
    console.log(' SCREEN SHARE FULL LIFECYCLE VERIFICATION PASSED! 🎉');
    console.log('======================================================\n');
    process.exit(0);
  } else {
    console.error('❌ Screen Share test failed', {
      bReceivedInitialOffer,
      aReceivedInitialAnswer,
      bReceivedScreenStatusTrue,
      bReceivedScreenOffer,
      aReceivedScreenAnswer,
      bReceivedScreenStatusFalse,
      bReceivedStopOffer,
      aReceivedStopAnswer,
    });
    process.exit(1);
  }
}

testScreenShareFlow().catch((e) => {
  console.error(e);
  process.exit(1);
});
