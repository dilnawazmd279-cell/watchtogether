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

// 2. Click [ START CINEMA ]
startBtn.addEventListener('click', async () => {
  if (!currentTab || !currentTab.id) return;

  hideError();
  startBtn.disabled = true;
  startBtn.textContent = 'Starting...';

  console.log('[EXT] activeTab invocation = true');
  console.log('[EXT] requesting tab capture for tab id:', currentTab.id);

  // Part 16: Duplicate capture protection
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

  // Query WatchTogether App tab for consumer authorization
  chrome.tabs.query({ url: WATCH_TOGETHER_URL_PATTERNS }, (wtTabs) => {
    const consumerTabId = wtTabs && wtTabs.length > 0 ? wtTabs[0].id : undefined;
    const captureOptions = consumerTabId
      ? { targetTabId: currentTab.id, consumerTabId }
      : { targetTabId: currentTab.id };

    try {
      chrome.tabCapture.getMediaStreamId(captureOptions, (streamId) => {
        if (chrome.runtime.lastError || !streamId) {
          const errName = chrome.runtime.lastError?.name || 'TabCaptureError';
          const errMsg = chrome.runtime.lastError?.message || 'Failed to capture tab';
          console.error('[EXT] getMediaStreamId error.name =', errName);
          console.error('[EXT] getMediaStreamId error.message =', errMsg);

          startBtn.disabled = false;
          startBtn.textContent = 'START CINEMA';
          setStatus('error', 'Error');
          showError('Capture failed: ' + errMsg);
          return;
        }

        console.log('[EXT] getMediaStreamId = success, streamId =', streamId);
        console.log('[EXT] movie capture started');

        // Forward stream ID to background service worker and WatchTogether tabs
        chrome.runtime.sendMessage(
          {
            type: 'WT_POPUP_CAPTURE_SUCCESS',
            streamId,
            tabId: currentTab.id,
            tabTitle: currentTab.title,
            tabUrl: currentTab.url,
          },
          () => {
            setStatus('streaming', 'Streaming');
            startBtn.style.display = 'none';
            stopBtn.style.display = 'flex';
          }
        );
      });
    } catch (err) {
      console.error('[EXT] capture exception:', err);
      startBtn.disabled = false;
      startBtn.textContent = 'START CINEMA';
      setStatus('error', 'Error');
      showError('Error starting tab capture: ' + (err?.message || 'Unknown error'));
    }
  });
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
