// WatchTogether Cinema Companion - Content Script Bridge

console.log('[EXT content] Active on WatchTogether web app');

// Announce extension presence to the Web App
window.postMessage({ type: 'WT_EXTENSION_READY', version: '1.0.0' }, '*');

// Listen for messages from the Web Application
window.addEventListener('message', (event) => {
  if (event.source !== window || !event.data || typeof event.data !== 'object') return;

  const msg = event.data;
  if (!msg.type || !msg.type.startsWith('WT_APP_')) return;

  switch (msg.type) {
    case 'WT_APP_PING': {
      chrome.runtime.sendMessage({ type: 'WT_PING' }, (response) => {
        window.postMessage({
          type: 'WT_PONG',
          installed: true,
          version: response?.version || '1.0.0',
          activeMovieTabId: response?.activeMovieTabId,
        }, '*');
      });
      break;
    }

    case 'WT_APP_OPEN_MOVIE_TAB': {
      chrome.runtime.sendMessage({ type: 'WT_OPEN_MOVIE_TAB', url: msg.url }, (response) => {
        window.postMessage({
          type: 'WT_MOVIE_TAB_OPENED',
          success: response?.success,
          tabId: response?.tabId,
          error: response?.error,
        }, '*');
      });
      break;
    }

    case 'WT_APP_STOP_CINEMA': {
      chrome.runtime.sendMessage({ type: 'WT_STOP_CINEMA' }, (response) => {
        window.postMessage({
          type: 'WT_MOVIE_CAPTURE_STOPPED',
          reason: 'user_stopped',
        }, '*');
      });
      break;
    }
  }
});

// Listen for background notifications and relay them to the Web App
chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type && message.type.startsWith('WT_')) {
    console.log('[EXT content] Relaying background message to web app:', message.type);
    window.postMessage(message, '*');
  }
});
