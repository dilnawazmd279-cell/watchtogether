// WatchTogether Cinema Companion - Background Service Worker (Manifest V3)

let activeMovieTabId = null;
let currentStreamId = null;
let captureState = 'IDLE';

console.log('[EXT] service worker initialized');

const WATCH_TOGETHER_URL_PATTERNS = [
  'http://localhost:5173/*',
  'http://127.0.0.1:5173/*',
  'https://qualitytimestogether.netlify.app/*',
];

// Notify all WatchTogether tabs of an event
function broadcastToWatchTogetherTabs(message) {
  chrome.tabs.query({ url: WATCH_TOGETHER_URL_PATTERNS }, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {});
      }
    });
  });
}

// Monitor tabCapture status changes (Part 19)
if (chrome.tabCapture && chrome.tabCapture.onStatusChanged) {
  chrome.tabCapture.onStatusChanged.addListener((info) => {
    console.log('[EXT tabCapture onStatusChanged]', info.tabId, info.status, info.fullscreen);
    if (info.status === 'stopped' || info.status === 'error') {
      captureState = 'IDLE';
      currentStreamId = null;
      broadcastToWatchTogetherTabs({
        type: 'WT_MOVIE_CAPTURE_STOPPED',
        tabId: info.tabId,
        reason: info.status,
      });
    } else if (info.status === 'active') {
      captureState = 'STREAMING';
    }
  });
}

// Listen for tab removals
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === activeMovieTabId) {
    console.log('[EXT] Movie tab closed by user:', tabId);
    activeMovieTabId = null;
    currentStreamId = null;
    captureState = 'IDLE';
    broadcastToWatchTogetherTabs({
      type: 'WT_MOVIE_CAPTURE_STOPPED',
      reason: 'tab_closed',
    });
  }
});

// Handle messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[EXT] message received:', request.type);

  switch (request.type) {
    case 'WT_PING': {
      sendResponse({
        success: true,
        version: '1.0.2',
        activeMovieTabId,
        captureState,
        hasActiveStream: !!currentStreamId,
      });
      return true;
    }

    case 'WT_OPEN_MOVIE_TAB': {
      const url = request.url;
      if (!url) {
        sendResponse({ success: false, error: 'No URL provided' });
        return true;
      }

      chrome.tabs.create({ url, active: true }, (tab) => {
        if (chrome.runtime.lastError || !tab) {
          const errMsg = chrome.runtime.lastError?.message || 'Failed to open tab';
          console.error('[EXT] Failed to open movie tab:', errMsg);
          sendResponse({ success: false, error: errMsg });
        } else {
          activeMovieTabId = tab.id;
          console.log('[EXT] Movie tab opened:', activeMovieTabId, url);
          sendResponse({
            success: true,
            tabId: tab.id,
            title: tab.title || '',
            url: tab.url || url,
          });

          broadcastToWatchTogetherTabs({
            type: 'WT_MOVIE_TAB_OPENED',
            tabId: tab.id,
            title: tab.title || '',
            url: url,
          });
        }
      });
      return true;
    }

    case 'WT_POPUP_CAPTURE_SUCCESS': {
      currentStreamId = request.streamId;
      activeMovieTabId = request.tabId;
      captureState = 'STREAMING';
      console.log('[EXT] Movie capture stream received from popup for tab:', activeMovieTabId);

      broadcastToWatchTogetherTabs({
        type: 'WT_STREAM_ID_READY',
        streamId: request.streamId,
        tabId: request.tabId,
        tabTitle: request.tabTitle,
        tabUrl: request.tabUrl,
      });

      sendResponse({ success: true });
      return true;
    }

    case 'WT_STOP_CINEMA': {
      console.log('[EXT] Stop cinema requested');
      currentStreamId = null;
      captureState = 'IDLE';

      broadcastToWatchTogetherTabs({
        type: 'WT_MOVIE_CAPTURE_STOPPED',
        reason: 'user_stopped',
      });

      sendResponse({ success: true });
      return true;
    }

    default:
      sendResponse({ success: false, error: 'Unknown message type' });
      return true;
  }
});
