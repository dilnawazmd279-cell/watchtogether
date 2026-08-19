import { WebSocket } from 'ws';

const WS_URL = 'ws://localhost:3001/ws';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testMediaSync() {
  console.log('--- Testing Full Playback Synchronization & Periodic Sync Flow ---');

  const roomId = 'sync-test-' + Math.random().toString(36).substring(2, 7);
  const peerA = 'peer-alice-' + Math.random().toString(36).substring(2, 6);
  const peerB = 'peer-bob-' + Math.random().toString(36).substring(2, 6);

  let bReceivedDirectVideo = false;
  let bReceivedPlay = false;
  let bReceivedPause = false;
  let bReceivedSeek = false;
  let aReceivedBPlay = false;
  let aReceivedBPause = false;
  let aReceivedBSeek = false;
  let bReceivedPeriodicSync = false;
  let bReceivedJoinState = false;

  const wsA = new WebSocket(WS_URL);

  // 1. Peer A joins as room creator
  await new Promise<void>((resolve) => {
    wsA.on('open', () => {
      wsA.send(JSON.stringify({ type: 'join-room', roomId, peerId: peerA }));
    });
    wsA.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'room-joined') {
        console.log('✓ 1. Alice joined as room creator');
        resolve();
      }
    });
  });

  // Setup Peer A message handling
  wsA.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());

    if (msg.type === 'media-play' && msg.senderPeerId === peerB) {
      aReceivedBPlay = true;
      console.log('✓ 5. Alice received Bob PLAY event (Reverse Play sync works - TEST 4 PASS)');
    }

    if (msg.type === 'media-pause' && msg.senderPeerId === peerB) {
      aReceivedBPause = true;
      console.log('✓ 6. Alice received Bob PAUSE event (Reverse Pause sync works - TEST 5 PASS)');
    }

    if (msg.type === 'media-seek' && msg.senderPeerId === peerB) {
      aReceivedBSeek = true;
      console.log('✓ 7. Alice received Bob SEEK event (Reverse Seek sync works - TEST 6 PASS)');
    }

    if (msg.type === 'media-request-state') {
      console.log('✓ 8a. Alice received media-request-state from Bob upon join');
      wsA.send(
        JSON.stringify({
          type: 'media-state',
          source: {
            url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
            type: 'direct-video',
            title: 'flower.mp4',
            currentTime: 24.5,
            isPlaying: true,
          },
          currentTime: 24.5,
          playing: true,
          sentAt: Date.now(),
          senderPeerId: peerA,
        })
      );
    }
  });

  const wsB = new WebSocket(WS_URL);

  // Setup Peer B message handling
  wsB.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());

    if (msg.type === 'media-source') {
      if (msg.source?.url === 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4') {
        bReceivedDirectVideo = true;
        console.log('✓ 2. Bob received Direct Video source from Alice (URL sync works)');
      }
    }

    if (msg.type === 'media-play') {
      bReceivedPlay = true;
      const latency = (Date.now() - (msg.sentAt || Date.now())) / 1000;
      console.log(`✓ 3. Bob received media-play from Alice: time=${msg.currentTime}s, latency=${latency.toFixed(3)}s (TEST 1 PASS)`);
    }

    if (msg.type === 'media-pause') {
      bReceivedPause = true;
      console.log(`✓ 4a. Bob received media-pause from Alice at ${msg.currentTime}s (TEST 2 PASS)`);
    }

    if (msg.type === 'media-seek' && msg.currentTime === 20.0) {
      bReceivedSeek = true;
      console.log(`✓ 4b. Bob received media-seek from Alice to 20.0s (TEST 3 PASS)`);
    }

    if (msg.type === 'media-sync') {
      bReceivedPeriodicSync = true;
      console.log(`✓ 8. Bob received periodic media-sync from Alice: time=${msg.currentTime}s, playing=${msg.playing} (TEST 7 PASS)`);
    }

    if (msg.type === 'media-state' && msg.currentTime === 24.5) {
      bReceivedJoinState = true;
      console.log(`✓ 8b. Bob received Join-In-Progress media-state: time=${msg.currentTime}s, playing=${msg.playing} (TEST 8 PASS)`);
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

  // Alice opens flower.mp4
  wsA.send(
    JSON.stringify({
      type: 'media-source',
      source: {
        url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
        type: 'direct-video',
        title: 'flower.mp4',
        currentTime: 0,
        isPlaying: false,
      },
      senderPeerId: peerA,
    })
  );

  await sleep(150);

  // TEST 1: Alice presses Play
  wsA.send(
    JSON.stringify({
      type: 'media-play',
      currentTime: 2.5,
      sentAt: Date.now(),
      senderPeerId: peerA,
    })
  );

  await sleep(150);

  // TEST 2: Alice presses Pause
  wsA.send(
    JSON.stringify({
      type: 'media-pause',
      currentTime: 10.0,
      sentAt: Date.now(),
      senderPeerId: peerA,
    })
  );

  await sleep(150);

  // TEST 3: Alice seeks to 20.0s
  wsA.send(
    JSON.stringify({
      type: 'media-seek',
      currentTime: 20.0,
      sentAt: Date.now(),
      senderPeerId: peerA,
    })
  );

  await sleep(150);

  // TEST 4: Bob presses Play
  wsB.send(
    JSON.stringify({
      type: 'media-play',
      currentTime: 20.0,
      sentAt: Date.now(),
      senderPeerId: peerB,
    })
  );

  await sleep(150);

  // TEST 5: Bob pauses
  wsB.send(
    JSON.stringify({
      type: 'media-pause',
      currentTime: 25.0,
      sentAt: Date.now(),
      senderPeerId: peerB,
    })
  );

  await sleep(150);

  // TEST 6: Bob seeks
  wsB.send(
    JSON.stringify({
      type: 'media-seek',
      currentTime: 5.0,
      sentAt: Date.now(),
      senderPeerId: peerB,
    })
  );

  await sleep(150);

  // TEST 7: Alice sends periodic sync (every 2s)
  wsA.send(
    JSON.stringify({
      type: 'media-sync',
      currentTime: 28.0,
      playing: true,
      sentAt: Date.now(),
      senderPeerId: peerA,
    })
  );

  await sleep(150);

  // TEST 8: Bob requests join-in-progress state
  wsB.send(
    JSON.stringify({
      type: 'media-request-state',
      senderPeerId: peerB,
    })
  );

  await sleep(300);

  wsA.close();
  wsB.close();
  await sleep(200);

  const passed =
    bReceivedDirectVideo &&
    bReceivedPlay &&
    bReceivedPause &&
    bReceivedSeek &&
    aReceivedBPlay &&
    aReceivedBPause &&
    aReceivedBSeek &&
    bReceivedPeriodicSync &&
    bReceivedJoinState;

  if (passed) {
    console.log('\n======================================================');
    console.log(' ALL 8 REALTIME PLAYBACK SYNC TESTS PASSED! 🎉');
    console.log('======================================================\n');
    process.exit(0);
  } else {
    console.error('❌ Playback sync tests failed', {
      bReceivedDirectVideo,
      bReceivedPlay,
      bReceivedPause,
      bReceivedSeek,
      aReceivedBPlay,
      aReceivedBPause,
      aReceivedBSeek,
      bReceivedPeriodicSync,
      bReceivedJoinState,
    });
    process.exit(1);
  }
}

testMediaSync().catch((e) => {
  console.error(e);
  process.exit(1);
});
