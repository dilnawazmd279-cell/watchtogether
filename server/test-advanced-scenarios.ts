import { WebSocket } from 'ws';

const WS_URL = 'ws://localhost:3001';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runAdvancedTests() {
  console.log('--- Starting Advanced Signaling & Disconnection Tests ---');

  const roomId = 'reconnect-room-' + Math.random().toString(36).substring(2, 7);
  const peer1 = 'peer-user1-' + Math.random().toString(36).substring(2, 6);
  const peer2 = 'peer-user2-' + Math.random().toString(36).substring(2, 6);

  // 1. User 1 joins
  const ws1 = new WebSocket(WS_URL);
  await new Promise<void>((resolve) => {
    ws1.on('open', () => {
      ws1.send(JSON.stringify({ type: 'join-room', roomId, peerId: peer1 }));
    });
    ws1.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'room-joined' && msg.isInitiator === true) {
        console.log('✓ User 1 joined room as initiator');
        resolve();
      }
    });
  });

  // 2. User 2 joins
  let ws2: WebSocket | null = new WebSocket(WS_URL);
  let user1NotifiedPartnerJoined = false;

  ws1.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'partner-joined') {
      user1NotifiedPartnerJoined = true;
      console.log('✓ User 1 notified of User 2 joining');
    }
  });

  await new Promise<void>((resolve) => {
    ws2!.on('open', () => {
      ws2!.send(JSON.stringify({ type: 'join-room', roomId, peerId: peer2 }));
    });
    ws2!.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'room-joined' && msg.isInitiator === false) {
        console.log('✓ User 2 joined room');
        resolve();
      }
    });
  });

  await sleep(100);

  // 3. User 2 leaves room (simulating browser close / navigate away)
  let user1NotifiedPartnerLeft = false;
  ws1.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'partner-left' && msg.peerId === peer2) {
      user1NotifiedPartnerLeft = true;
      console.log('✓ User 1 notified that User 2 left');
    }
  });

  ws2.close();
  ws2 = null;

  await sleep(300);

  // 4. User 2 reconnects (same or new peer ID to the same room)
  const peer2Reconnected = 'peer-user2-reconnected';
  let user1NotifiedPartnerRejoined = false;

  ws1.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'partner-joined' && msg.peerId === peer2Reconnected) {
      user1NotifiedPartnerRejoined = true;
      console.log('✓ User 1 notified that User 2 reconnected!');
    }
  });

  const ws2Reconnect = new WebSocket(WS_URL);
  await new Promise<void>((resolve) => {
    ws2Reconnect.on('open', () => {
      ws2Reconnect.send(JSON.stringify({ type: 'join-room', roomId, peerId: peer2Reconnected }));
    });
    ws2Reconnect.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'room-joined' && msg.otherPeerId === peer1) {
        console.log('✓ User 2 successfully rejoined room');
        resolve();
      }
    });
  });

  await sleep(300);

  // Cleanup
  ws1.close();
  ws2Reconnect.close();
  await sleep(200);

  const passed =
    user1NotifiedPartnerJoined &&
    user1NotifiedPartnerLeft &&
    user1NotifiedPartnerRejoined;

  if (passed) {
    console.log('\n=============================================');
    console.log(' ADVANCED DISCONNECT/RECONNECT TESTS PASSED! ');
    console.log('=============================================\n');
    process.exit(0);
  } else {
    console.error('❌ Advanced test failed', {
      user1NotifiedPartnerJoined,
      user1NotifiedPartnerLeft,
      user1NotifiedPartnerRejoined,
    });
    process.exit(1);
  }
}

runAdvancedTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
