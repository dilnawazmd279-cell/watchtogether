// WatchTogether Cinema Companion - Popup Action Script

let currentTab = null;

const tabTitleEl = document.getElementById('tab-title');
const statusBadgeEl = document.getElementById('status-badge');
const statusDotEl = document.getElementById('status-dot');
const statusTextEl = document.getElementById('status-text');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const errorBox = document.getElementById('error-box');

function setStatus(state, text) {
  statusBadgeEl.className = 'status-badge status-' + state;
  statusDotEl.className = 'dot dot-' + state;
  statusTextEl.textContent = text;
}

function showError(msg) {
  errorBox.style.display = 'block';
  errorBox.textContent = msg;
}

function hideError() {
  errorBox.style.display = 'none';
  errorBox.textContent = '';
}

// 1. Inspect Current Active Tab & Active Streaming State
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  currentTab = tabs[0];

  if (!currentTab || !currentTab.id) {
    tabTitleEl.textContent = 'No active tab found';
    startBtn.disabled = true;
    showError('Unable to identify active tab.');
    return;
  }

  const url = currentTab.url || '';
  const title = currentTab.title || 'Untitled Tab';
  tabTitleEl.textContent = title;

  console.log('[EXT] current tab id =', currentTab.id);
  console.log('[EXT] current tab url =', url);

  // Check if Chrome internal page
  if (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    url.startsWith('view-source:')
  ) {
    startBtn.disabled = true;
    setStatus('error', 'Unsupported');
    showError('Chrome internal pages cannot be captured. Switch to a normal movie tab.');
    return;
  }

const WATCH_TOGETHER_URL_PATTERNS = [
  'http://localhost:5173/*',
  'http://127.0.0.1:5173/*',
  'https://qualitytimestogether.netlify.app/*',
];

// Check if this tab is the WatchTogether app itself
  if (
    url.includes('localhost:5173') ||
    url.includes('127.0.0.1:5173') ||
    url.includes('qualitytimestogether.netlify.app')
  ) {
    tabTitleEl.textContent = 'WatchTogether App Tab';
    startBtn.disabled = true;
    setStatus('ready', 'Select Movie Tab');
    showError('Please switch to your movie tab first, then click this extension icon to capture it.');
    return;
  }

  // Check background service worker state
  chrome.runtime.sendMessage({ type: 'WT_PING' }, (resp) => {
    if (resp && resp.captureState === 'STREAMING' && resp.activeMovieTabId === currentTab.id) {
      setStatus('streaming', 'Streaming');
      startBtn.style.display = 'none';
      stopBtn.style.display = 'flex';
    } else {
      setStatus('ready', 'Ready');
      startBtn.disabled = false;
    }
  });
});

function getMediaStreamId(options) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      console.error('[EXT] tabCapture timed out');
      reject(new Error('Chrome tab capture timed out.'));
    }, 10000);

    chrome.tabCapture.getMediaStreamId(
      options,
      (streamId) => {
        clearTimeout(timer);

        if (settled) return;
        settled = true;

        if (chrome.runtime.lastError) {
          reject(
            new Error(
              chrome.runtime.lastError.message ||
              'Failed to capture tab.'
            )
          );
          return;
        }

        if (!streamId) {
          reject(new Error('Chrome returned no stream ID.'));
          return;
        }

        resolve(streamId);
      }
    );
  });
}

// 2. Click [ START CINEMA ]
startBtn.addEventListener('click', async () => {
  if (!currentTab || !currentTab.id) return;

  hideError();
  startBtn.disabled = true;
  startBtn.textContent = 'Starting...';

  console.log('[EXT] START CINEMA clicked');
  console.log('[EXT] target tab:', currentTab.id, currentTab.url);

  try {
    // 1. Get the WatchTogether consumer tab
    const wtTabs = await chrome.tabs.query({
      url: WATCH_TOGETHER_URL_PATTERNS,
    });

    const consumerTabId = wtTabs?.find(
      (tab) => tab.id && tab.id !== currentTab.id
    )?.id;

    console.log('[EXT] consumer tab:', consumerTabId);

    if (!consumerTabId) {
      showError('WatchTogether room tab not found. Keep the WatchTogether room open.');
      startBtn.disabled = false;
      startBtn.textContent = 'START CINEMA';
      return;
    }

    // 2. Ensure the movie tab is active before tabCapture is requested
    await chrome.tabs.update(currentTab.id, {
      active: true,
    });
    await new Promise((r) => setTimeout(r, 150));

    // 3. Duplicate capture protection
    if (chrome.tabCapture && typeof chrome.tabCapture.getCapturedTabs === 'function') {
      try {
        const capturedTabs = await chrome.tabCapture.getCapturedTabs();
        const alreadyCaptured = capturedTabs.some((c) => c.tabId === currentTab.id && c.status === 'active');
        if (alreadyCaptured) {
          console.log('[EXT] Tab is already captured, reusing state');
          setStatus('streaming', 'Streaming');
          startBtn.style.display = 'none';
          stopBtn.style.display = 'flex';
          return;
        }
      } catch (e) {
        console.warn('[EXT] getCapturedTabs check warning:', e);
      }
    }

    // 4. Capture strategy
    let streamId;
    try {
      console.log('[EXT] capture strategy A: targetTabId only');
      streamId = await getMediaStreamId({
        targetTabId: currentTab.id,
      });
      console.log('[EXT] capture strategy A success');
    } catch (firstError) {
      console.warn('[EXT] strategy A failed:', firstError);

      if (!consumerTabId) {
        throw firstError;
      }

      console.log('[EXT] capture strategy B: targetTabId + consumerTabId');
      streamId = await getMediaStreamId({
        targetTabId: currentTab.id,
        consumerTabId,
      });
      console.log('[EXT] capture strategy B success');
    }

    console.log('[EXT] streamId received');

    // 5. Send capture success to background
    chrome.runtime.sendMessage({
      type: 'WT_POPUP_CAPTURE_SUCCESS',
      streamId,
      tabId: currentTab.id,
      tabTitle: currentTab.title,
      tabUrl: currentTab.url,
    });

    setStatus('streaming', 'Streaming');
    startBtn.style.display = 'none';
    stopBtn.style.display = 'flex';
  } catch (error) {
    console.error('[EXT] Capture error:', error);
    startBtn.disabled = false;
    startBtn.textContent = 'START CINEMA';
    setStatus('error', 'Error');
    showError(error.message || 'Failed to capture movie tab.');
  }
});

// 3. Click [ STOP CINEMA ]
stopBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'WT_STOP_CINEMA' }, () => {
    setStatus('ready', 'Ready');
    startBtn.style.display = 'flex';
    startBtn.disabled = false;
    startBtn.textContent = 'START CINEMA';
    stopBtn.style.display = 'none';
  });
});
