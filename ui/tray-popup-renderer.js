const { ipcRenderer } = require('electron');

// Load data on startup
document.addEventListener('DOMContentLoaded', () => {
  loadPopupData();
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
    await ipcRenderer.invoke('trigger-tally-sync');
  } catch (error) {
    console.error('[TRAY-POPUP] Sync trigger failed:', error);
  }

  // Close popup after triggering
  setTimeout(() => window.close(), 500);
}

function openSettings(page) {
  ipcRenderer.send('open-settings-from-tray', page || 'tally-integration');
}

function openPartnerPortal() {
  require('electron').shell.openExternal('https://partner.bytephase.com');
}
