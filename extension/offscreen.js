// WatchTogether Cinema Companion - Offscreen Document (Manifest V3)

console.log('[EXTENSION offscreen] Offscreen document loaded');

let currentStream = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[EXTENSION offscreen] Message received:', message.type);

  if (message.type === 'WT_OFFSCREEN_CAPTURE') {
    const streamId = message.streamId;
    if (!streamId) {
      sendResponse({ success: false, error: 'No streamId provided' });
      return true;
    }

    startOffscreenCapture(streamId)
      .then((streamInfo) => {
        sendResponse({ success: true, ...streamInfo });
      })
      .catch((err) => {
        console.error('[EXTENSION offscreen] Capture error:', err);
        sendResponse({
          success: false,
          errorName: err.name,
          errorMessage: err.message,
        });
      });

    return true;
  }

  if (message.type === 'WT_OFFSCREEN_STOP') {
    stopOffscreenCapture();
    sendResponse({ success: true });
    return true;
  }
});

async function startOffscreenCapture(streamId) {
  stopOffscreenCapture();

  console.log('[EXTENSION offscreen] Requesting getUserMedia with tab stream ID:', streamId);

  let stream;
  let audioTrackLive = false;

  try {
    // Attempt video + audio capture
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
        },
      },
      video: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
        },
      },
    });
    audioTrackLive = stream.getAudioTracks().length > 0;
  } catch (audioErr) {
    console.warn('[EXTENSION offscreen] Audio+Video capture failed, attempting video-only:', audioErr);
    // Fallback: video only
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
        },
      },
    });
  }

  currentStream = stream;
  const videoTrack = stream.getVideoTracks()[0];
  const audioTrack = stream.getAudioTracks()[0];

  console.log('[EXTENSION] capture started');
  console.log('[EXTENSION] video track =', videoTrack ? 'live' : 'none');
  console.log('[EXTENSION] audio track =', audioTrack ? 'live' : 'unavailable');

  // Play audio locally in offscreen context so Host continues hearing audio
  if (audioTrack) {
    try {
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(audioCtx.destination);
    } catch (e) {
      console.warn('[EXTENSION offscreen] Local audio routing warning:', e);
    }
  }

  return {
    videoTrackId: videoTrack?.id,
    videoTrackLabel: videoTrack?.label,
    audioTrackId: audioTrack?.id,
    hasAudio: !!audioTrack,
  };
}

function stopOffscreenCapture() {
  if (currentStream) {
    console.log('[EXTENSION offscreen] Stopping offscreen stream');
    currentStream.getTracks().forEach((track) => track.stop());
    currentStream = null;
  }
}
