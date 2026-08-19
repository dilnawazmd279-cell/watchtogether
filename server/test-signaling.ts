import { WebSocket } from 'ws';

const WS_URL = 'ws://localhost:3001';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('--- Starting Signaling Server End-to-End Tests ---');

  // Test 1: HTTP Health check
  try {
    const res = await fetch('http://localhost:3001/health');
    const data = await res.json();
    console.log('✓ Health check passed:', data);
  } catch (e) {
    console.error('✗ Health check failed:', e);
    process.exit(1);
  }

  const roomId = 'test-room-' + Math.random().toString(36).substring(2, 7);
  const peer1 = 'peer-alice-' + Math.random().toString(36).substring(2, 6);
  const peer2 = 'peer-bob-' + Math.random().toString(36).substring(2, 6);
  const peer3 = 'peer-charlie-' + Math.random().toString(36).substring(2, 6);

  // Test 2: Alice joins room
  const ws1 = new WebSocket(WS_URL);
  let aliceJoined = false;
  let aliceGotPartner = false;
  let aliceGotAnswer = false;
  let aliceGotChat = false;
  let aliceGotScreenStatus = false;

  await new Promise<void>((resolve, reject) => {
    ws1.on('open', () => {
      ws1.send(JSON.stringify({ type: 'join-room', roomId, peerId: peer1 }));
    });

    ws1.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'room-joined') {
        if (msg.isInitiator === true && msg.peerId === peer1) {
          aliceJoined = true;
          console.log('✓ Alice joined as initiator');
          resolve();
        }
      }
    });

    ws1.on('error', reject);
  });

  // Test 3: Bob joins room
  const ws2 = new WebSocket(WS_URL);
  let bobJoined = false;
  let bobGotOffer = false;

  await new Promise<void>((resolve, reject) => {
    ws1.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'partner-joined' && msg.peerId === peer2) {
        aliceGotPartner = true;
        console.log('✓ Alice received partner-joined for Bob');
      }
    });

    ws2.on('open', () => {
      ws2.send(JSON.stringify({ type: 'join-room', roomId, peerId: peer2 }));
    });

    ws2.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'room-joined') {
        if (msg.isInitiator === false && msg.otherPeerId === peer1) {
          bobJoined = true;
          console.log('✓ Bob joined room, recognized Alice as other peer');
          resolve();
        }
      }
    });

    ws2.on('error', reject);
  });

  // Test 4: WebRTC Offer / Answer Relay
  ws2.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'offer') {
      bobGotOffer = true;
      console.log('✓ Bob received offer from Alice');
      // Bob sends answer back
      ws2.send(
        JSON.stringify({
          type: 'answer',
          sdp: { type: 'answer', sdp: 'fake-sdp-answer' },
          targetPeerId: peer1,
          senderPeerId: peer2,
        })
      );
    }
  });

  ws1.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'answer') {
      aliceGotAnswer = true;
      console.log('✓ Alice received answer from Bob');
    }
    if (msg.type === 'chat-message') {
      aliceGotChat = true;
      console.log('✓ Alice received chat message from Bob:', msg.text);
    }
    if (msg.type === 'screen-share-status') {
      aliceGotScreenStatus = true;
      console.log('✓ Alice received screen-share-status:', msg.isSharing);
    }
  });

  // Alice sends offer to Bob
  ws1.send(
    JSON.stringify({
      type: 'offer',
      sdp: { type: 'offer', sdp: 'fake-sdp-offer' },
      targetPeerId: peer2,
      senderPeerId: peer1,
    })
  );

  await sleep(300);

  // Bob sends chat message to Alice
  ws2.send(
    JSON.stringify({
      type: 'chat-message',
      id: 'msg-1',
      text: 'Hello Alice from Bob!',
      senderPeerId: peer2,
      timestamp: Date.now(),
    })
  );

  // Bob sends screen-share-status to Alice
  ws2.send(
    JSON.stringify({
      type: 'screen-share-status',
      isSharing: true,
      targetPeerId: peer1,
      senderPeerId: peer2,
    })
  );

  await sleep(300);

  // Test 5: Charlie attempts to join full room (Room max 2 check)
  let charlieRejected = false;
  const ws3 = new WebSocket(WS_URL);
  await new Promise<void>((resolve) => {
    ws3.on('open', () => {
      ws3.send(JSON.stringify({ type: 'join-room', roomId, peerId: peer3 }));
    });

    ws3.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'room-full') {
        charlieRejected = true;
        console.log('✓ Charlie was rejected with room-full:', msg.message);
        ws3.close();
        resolve();
      }
    });
  });

  // Cleanup
  ws1.close();
  ws2.close();
  await sleep(200);

  // Summary
  const allPassed =
    aliceJoined &&
    bobJoined &&
    aliceGotPartner &&
    bobGotOffer &&
    aliceGotAnswer &&
    aliceGotChat &&
    aliceGotScreenStatus &&
    charlieRejected;

  if (allPassed) {
    console.log('\n========================================');
    console.log(' ALL 8 SIGNALING & ROOM TESTS PASSED! 🎉');
    console.log('========================================\n');
    process.exit(0);
  } else {
    console.error('\n❌ Some tests failed!', {
      aliceJoined,
      bobJoined,
      aliceGotPartner,
      bobGotOffer,
      aliceGotAnswer,
      aliceGotChat,
      aliceGotScreenStatus,
      charlieRejected,
    });
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Test execution failed:', e);
  process.exit(1);
});
