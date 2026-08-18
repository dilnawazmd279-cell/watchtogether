import { WebSocket } from 'ws';

const WS_URL = 'ws://localhost:3001';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testAudioAndChat() {
  console.log('--- Testing Bidirectional Audio Signaling and Chat Flow ---');

  const roomId = 'chat-audio-' + Math.random().toString(36).substring(2, 7);
  const peerA = 'peer-alice-' + Math.random().toString(36).substring(2, 6);
  const peerB = 'peer-bob-' + Math.random().toString(36).substring(2, 6);

  let aReceivedOfferResponse = false;
  let bReceivedOffer = false;
  let aReceivedChatFromB = false;
  let bReceivedChatFromA = false;
  let aReceivedIce = false;
  let bReceivedIce = false;

  const wsA = new WebSocket(WS_URL);

  // A connects and creates room
  await new Promise<void>((resolve) => {
    wsA.on('open', () => {
      wsA.send(JSON.stringify({ type: 'join-room', roomId, peerId: peerA }));
    });
    wsA.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'room-joined' && msg.isInitiator === true) {
        console.log('✓ 1. Alice joined as initiator');
        resolve();
      }
    });
  });

  // Setup Alice message handling
  wsA.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());

    if (msg.type === 'partner-joined') {
      console.log('✓ 2. Alice received partner-joined for Bob:', msg.peerId);
      // Alice sends Offer containing audio & video m-lines
      wsA.send(
        JSON.stringify({
          type: 'offer',
          sdp: {
            type: 'offer',
            sdp: 'v=0\r\no=- 12345 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n',
          },
          targetPeerId: peerB,
          senderPeerId: peerA,
        })
      );
    }

    if (msg.type === 'answer') {
      aReceivedOfferResponse = true;
      console.log('✓ 5. Alice received SDP Answer from Bob (with audio m-line)');
    }

    if (msg.type === 'ice-candidate') {
      aReceivedIce = true;
      console.log('✓ 6a. Alice received ICE Candidate from Bob');
    }

    if (msg.type === 'chat-message') {
      if (msg.senderPeerId === peerB && msg.text === 'Hello Alice from Bob!') {
        aReceivedChatFromB = true;
        console.log('✓ 8. Alice received realtime chat from Bob:', msg.text);
      }
    }
  });

  const wsB = new WebSocket(WS_URL);

  // Setup Bob message handling
  wsB.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());

    if (msg.type === 'offer') {
      bReceivedOffer = true;
      console.log('✓ 3. Bob received SDP Offer from Alice (with audio m-line)');

      // Bob sends Answer containing audio & video
      wsB.send(
        JSON.stringify({
          type: 'answer',
          sdp: {
            type: 'answer',
            sdp: 'v=0\r\no=- 54321 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n',
          },
          targetPeerId: peerA,
          senderPeerId: peerB,
        })
      );

      // Bob sends ICE Candidate
      wsB.send(
        JSON.stringify({
          type: 'ice-candidate',
          candidate: { candidate: 'candidate:1 1 UDP 2122260223 127.0.0.1 50000 typ host', sdpMid: '0', sdpMLineIndex: 0 },
          targetPeerId: peerA,
          senderPeerId: peerB,
        })
      );
    }

    if (msg.type === 'ice-candidate') {
      bReceivedIce = true;
      console.log('✓ 6b. Bob received ICE Candidate from Alice');
    }

    if (msg.type === 'chat-message') {
      if (msg.senderPeerId === peerA && msg.text === 'Hello Bob from Alice!') {
        bReceivedChatFromA = true;
        console.log('✓ 7. Bob received realtime chat from Alice:', msg.text);
      }
    }
  });

  // Bob connects and joins room
  await new Promise<void>((resolve) => {
    wsB.on('open', () => {
      wsB.send(JSON.stringify({ type: 'join-room', roomId, peerId: peerB }));
      resolve();
    });
  });

  await sleep(250);

  // Alice sends ICE candidate to Bob
  wsA.send(
    JSON.stringify({
      type: 'ice-candidate',
      candidate: { candidate: 'candidate:2 1 UDP 2122260223 127.0.0.1 50001 typ host', sdpMid: '0', sdpMLineIndex: 0 },
      targetPeerId: peerB,
      senderPeerId: peerA,
    })
  );

  // Alice sends chat message to Bob (A -> B)
  wsA.send(
    JSON.stringify({
      type: 'chat-message',
      id: 'chat-a-1',
      text: 'Hello Bob from Alice!',
      senderPeerId: peerA,
      timestamp: Date.now(),
    })
  );

  await sleep(150);

  // Bob sends chat message to Alice (B -> A)
  wsB.send(
    JSON.stringify({
      type: 'chat-message',
      id: 'chat-b-1',
      text: 'Hello Alice from Bob!',
      senderPeerId: peerB,
      timestamp: Date.now(),
    })
  );

  await sleep(300);

  wsA.close();
  wsB.close();
  await sleep(200);

  const passed =
    bReceivedOffer &&
    aReceivedOfferResponse &&
    aReceivedIce &&
    bReceivedIce &&
    bReceivedChatFromA &&
    aReceivedChatFromB;

  if (passed) {
    console.log('\n======================================================');
    console.log(' BIDIRECTIONAL AUDIO SIGNALING & CHAT TESTS PASSED! 🎉');
    console.log('======================================================\n');
    process.exit(0);
  } else {
    console.error('❌ Tests failed', {
      bReceivedOffer,
      aReceivedOfferResponse,
      aReceivedIce,
      bReceivedIce,
      bReceivedChatFromA,
      aReceivedChatFromB,
    });
    process.exit(1);
  }
}

testAudioAndChat().catch((e) => {
  console.error(e);
  process.exit(1);
});
