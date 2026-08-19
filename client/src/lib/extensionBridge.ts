/**
 * WatchTogether Chrome Extension Bridge & Tab Capture Engine
 */

export interface ExtensionStatus {
  isInstalled: boolean;
  version?: string;
  activeMovieTabId?: number | null;
}

let extensionStatus: ExtensionStatus = {
  isInstalled: false,
};

const statusListeners = new Set<(status: ExtensionStatus) => void>();
const streamListeners = new Set<(stream: MediaStream) => void>();

function notifyStatusListeners() {
  statusListeners.forEach((cb) => cb({ ...extensionStatus }));
}

// Listen for messages from content script
if (typeof window !== 'undefined') {
  window.addEventListener('message', async (event) => {
    if (event.source !== window || !event.data || typeof event.data !== 'object') return;

    const msg = event.data;

    if (msg.type === 'WT_EXTENSION_READY' || msg.type === 'WT_PONG') {
      console.log('[EXT] extension installed');
      extensionStatus = {
        isInstalled: true,
        version: msg.version || '1.0.2',
        activeMovieTabId: msg.activeMovieTabId,
      };
      notifyStatusListeners();
    }

    if (msg.type === 'WT_STREAM_ID_READY' && msg.streamId) {
      console.log('[EXT] getMediaStreamId = success, streamId =', msg.streamId);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            mandatory: {
              chromeMediaSource: 'tab',
              chromeMediaSourceId: msg.streamId,
            },
          },
          video: {
            mandatory: {
              chromeMediaSource: 'tab',
              chromeMediaSourceId: msg.streamId,
            },
          },
        } as any);

        const vTrack = stream.getVideoTracks()[0];
        const aTrack = stream.getAudioTracks()[0];
        console.log('[EXT] capture started');
        console.log('[EXT] video track =', vTrack ? 'live' : 'none');
        console.log('[EXT] audio track =', aTrack ? 'live' : 'unavailable');

        if (aTrack) {
          try {
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const source = audioCtx.createMediaStreamSource(stream);
            source.connect(audioCtx.destination);
          } catch (e) {
            console.warn('[EXT] Local tab audio playback warning:', e);
          }
        }

        streamListeners.forEach((cb) => cb(stream));
      } catch (err: any) {
        console.warn('[EXT] getUserMedia with tab streamId warning, falling back to direct tab capture:', err?.message);
      }
    }
  });

  // Initial ping
  window.postMessage({ type: 'WT_APP_PING' }, '*');
}

export function onExtensionStreamCaptured(callback: (stream: MediaStream) => void): () => void {
  streamListeners.add(callback);
  return () => {
    streamListeners.delete(callback);
  };
}

export function subscribeToExtensionStatus(callback: (status: ExtensionStatus) => void): () => void {
  statusListeners.add(callback);
  callback({ ...extensionStatus });
  return () => {
    statusListeners.delete(callback);
  };
}

export function getExtensionStatus(): ExtensionStatus {
  return { ...extensionStatus };
}

export async function pingExtension(): Promise<boolean> {
  return new Promise((resolve) => {
    const onMsg = (event: MessageEvent) => {
      if (event.source === window && (event.data?.type === 'WT_PONG' || event.data?.type === 'WT_EXTENSION_READY')) {
        window.removeEventListener('message', onMsg);
        extensionStatus.isInstalled = true;
        notifyStatusListeners();
        resolve(true);
      }
    };

    window.addEventListener('message', onMsg);
    window.postMessage({ type: 'WT_APP_PING' }, '*');

    setTimeout(() => {
      window.removeEventListener('message', onMsg);
      resolve(extensionStatus.isInstalled);
    }, 300);
  });
}

/**
 * Commands extension to open movie tab.
 */
export async function openMovieTabInExtension(url: string): Promise<{ success: boolean; tabId?: number; error?: string }> {
  return new Promise((resolve) => {
    const onMsg = (event: MessageEvent) => {
      if (event.source === window && event.data?.type === 'WT_MOVIE_TAB_OPENED') {
        window.removeEventListener('message', onMsg);
        resolve({
          success: !!event.data.success,
          tabId: event.data.tabId,
          error: event.data.error,
        });
      }
    };

    window.addEventListener('message', onMsg);
    window.postMessage({ type: 'WT_APP_OPEN_MOVIE_TAB', url }, '*');

    setTimeout(() => {
      window.removeEventListener('message', onMsg);
      resolve({ success: false, error: 'Extension response timeout.' });
    }, 2500);
  });
}

/**
 * Direct Browser Tab Capture (User-invoked fallback)
 */
export async function startDirectTabCapture(): Promise<MediaStream> {
  console.log('[EXT] Requesting browser display media for movie tab...');
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      displaySurface: 'browser',
      cursor: 'never',
    } as MediaTrackConstraints,
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    } as MediaTrackConstraints,
  });

  const vTrack = stream.getVideoTracks()[0];
  const aTrack = stream.getAudioTracks()[0];

  console.log('[EXT] capture started');
  console.log('[EXT] video track =', vTrack ? 'live' : 'none');
  console.log('[EXT] audio track =', aTrack ? 'live' : 'unavailable');

  if (vTrack) {
    console.log('[HOST MOVIE] video dimensions:', vTrack.getSettings()?.width, 'x', vTrack.getSettings()?.height);
  }

  if (aTrack) {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(audioCtx.destination);
    } catch (e) {
      console.warn('[EXT] Local tab audio playback warning:', e);
    }
  }

  return stream;
}

/**
 * Commands extension to stop tab capture.
 */
export function stopTabCaptureInExtension() {
  window.postMessage({ type: 'WT_APP_STOP_CINEMA' }, '*');
}
