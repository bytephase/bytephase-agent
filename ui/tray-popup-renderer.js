const { ipcRenderer } = require('electron');

// Load data on startup
document.addEventListener('DOMContentLoaded', () => {
  loadPopupData();

  // Listen for sync progress
  ipcRenderer.on('tally-sync-progress', (event, progress) => {
    const el = document.getElementById('traySyncProgress');
    if (!el) return;

    el.style.display = 'block';

    const percent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

    const label = document.getElementById('traySyncLabel');
    if (label) label.textContent = progress.message || 'Syncing...';

    const count = document.getElementById('traySyncCount');
    if (count) count.textContent = `${progress.current || 0} / ${progress.total || 0}`;

    const bar = document.getElementById('traySyncBar');
    if (bar) bar.style.width = `${percent}%`;
  });

  // Hide progress on sync complete
  ipcRenderer.on('tally-sync-complete', () => {
    const el = document.getElementById('traySyncProgress');
    if (el) el.style.display = 'none';

    // Refresh data
    loadPopupData();
  });
});

async function loadPopupData() {
  try {
    const data = await ipcRenderer.invoke('get-tray-popup-data');
    updateUI(data);
  } catch (error) {
    console.error('[TRAY-POPUP] Failed to load data:', error);
  }
}

function updateUI(data) {
  // Directory Scanner status
  const scannerDot = document.getElementById('scannerDot');
  const scannerBadge = document.getElementById('scannerBadge');
  const scannerMeta = document.getElementById('scannerMeta');

  if (data.scannerActive) {
    scannerDot.className = 'status-dot green';
    scannerBadge.textContent = 'Active';
    scannerBadge.className = 'status-badge active';
  } else {
    scannerDot.className = 'status-dot gray';
    scannerBadge.textContent = 'Inactive';
    scannerBadge.className = 'status-badge disconnected';
  }

  const lastScanText = data.stats && data.stats.lastScanTime
    ? `Last scan: ${formatRelativeTime(data.stats.lastScanTime)}`
    : 'No scans yet';
  scannerMeta.querySelector('span').textContent = lastScanText;

  // Tally Sync status
  const tallyDot = document.getElementById('tallyDot');
  const tallyBadge = document.getElementById('tallyBadge');
  const tallyLastSync = document.getElementById('tallyLastSync');
  const tallyItemCount = document.getElementById('tallyItemCount');

  if (data.tallyStatus && data.tallyStatus.connected) {
    tallyDot.className = 'status-dot green';
    tallyBadge.textContent = 'Connected';
    tallyBadge.className = 'status-badge connected';
  } else {
    tallyDot.className = 'status-dot yellow';
    tallyBadge.textContent = 'Disconnected';
    tallyBadge.className = 'status-badge disconnected';
  }

  const lastSyncTime = data.tallySyncStats && data.tallySyncStats.lastSyncTime
    ? `Last sync: ${formatRelativeTime(data.tallySyncStats.lastSyncTime)}`
    : 'No syncs yet';
  tallyLastSync.querySelector('span').textContent = lastSyncTime;

  const itemCount = data.tallySyncStats && data.tallySyncStats.totalItemsSynced
    ? `${data.tallySyncStats.totalItemsSynced.toLocaleString()} items synced`
    : '0 items synced';
  tallyItemCount.querySelector('span').textContent = itemCount;

  // Sync Now button state
  const syncBtn = document.getElementById('syncNowBtn');
  if (!data.registered || !data.tallyStatus || !data.tallyStatus.connected) {
    syncBtn.style.opacity = '0.5';
    syncBtn.style.pointerEvents = 'none';
  }

  // Version
  document.getElementById('versionLabel').textContent = `BytePhase Agent v${data.version || '2.0.0'}`;
}

function formatRelativeTime(isoString) {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;

  if (diffMs < 60000) return 'Just now';
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)} minutes ago`;
  if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)} hours ago`;
  return `${Math.floor(diffMs / 86400000)} days ago`;
}

async function triggerSync() {
  const btn = document.getElementById('syncNowBtn');
  btn.textContent = 'Syncing...';
  btn.style.opacity = '0.7';
  btn.style.pointerEvents = 'none';

  try {
    await ipcRenderer.invoke('trigger-tally-sync', 'delta');
  } catch (error) {
    console.error('[TRAY-POPUP] Sync trigger failed:', error);
  }

  // Re-enable button after sync starts
  setTimeout(() => {
    btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg> Sync Now';
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'auto';
  }, 3000);
}

function openSettings(page) {
  ipcRenderer.send('open-settings-from-tray', page || 'tally-integration');
}

function openPartnerPortal() {
  require('electron').shell.openExternal('https://partner.bytephase.com');
}

async function viewLogs() {
  await ipcRenderer.invoke('open-logs-folder');
}
