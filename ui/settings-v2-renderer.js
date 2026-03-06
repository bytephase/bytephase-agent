const { ipcRenderer } = require('electron');

// ============ NAVIGATION ============

function navigateTo(page) {
  // Update sidebar
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });

  // Update content
  document.querySelectorAll('.page').forEach(p => {
    p.classList.toggle('active', p.id === `page-${page}`);
  });

  // Load page data
  if (page === 'overview') loadOverviewData();
  if (page === 'tally-integration') loadTallyData();
  if (page === 'system-tray') loadSystemTrayData();
}

function switchSubTab(tab) {
  document.querySelectorAll('.sub-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  document.querySelectorAll('.sub-content').forEach(c => {
    c.classList.toggle('active', c.id === `tab-${tab}`);
  });

  if (tab === 'sync-status') loadSyncStatusData();
}

// ============ TALLY CONFIGURATION ============

async function loadTallyData() {
  try {
    const result = await ipcRenderer.invoke('get-tally-config');
    if (result && result.success) {
      const config = result.config;
      document.getElementById('tallyHost').value = config.tallyHost || 'localhost';
      document.getElementById('tallyPort').value = config.tallyPort || 9000;
      document.getElementById('autoDetectCompany').checked = config.tallyCompany === null;
      document.getElementById('autoDetectVersion').checked = config.autoDetectVersion !== false;

      if (config.tallyCompany) {
        document.getElementById('tallyCompanyName').value = config.tallyCompany;
      }
    }
  } catch (error) {
    console.error('[SETTINGS] Failed to load tally config:', error);
  }

  // Check connection status
  await checkTallyStatus();
}

async function checkTallyStatus() {
  try {
    const result = await ipcRenderer.invoke('test-tally-connection');
    updateTallyStatusBanner(result.success);
  } catch (error) {
    updateTallyStatusBanner(false);
  }
}

function updateTallyStatusBanner(connected) {
  const banner = document.getElementById('tallyStatusBanner');
  const dot = document.getElementById('tallyStatusDot');
  const text = document.getElementById('tallyStatusText');
  const indicator = document.getElementById('tallyStatusIndicator');

  if (connected) {
    banner.className = 'status-banner connected';
    dot.className = 'status-dot-sm green';
    text.textContent = 'Connected';
    indicator.className = 'status-indicator green';
  } else {
    banner.className = 'status-banner disconnected';
    dot.className = 'status-dot-sm yellow';
    text.textContent = 'Disconnected';
    indicator.className = 'status-indicator yellow';
  }
}

async function testTallyConnection() {
  const btn = document.getElementById('testConnectionBtn');
  btn.textContent = 'Testing...';
  btn.disabled = true;

  try {
    const result = await ipcRenderer.invoke('test-tally-connection');
    updateTallyStatusBanner(result.success);

    if (result.success) {
      btn.textContent = 'Connected!';
      setTimeout(() => { btn.textContent = 'Test Connection'; btn.disabled = false; }, 2000);
    } else {
      btn.textContent = 'Failed';
      setTimeout(() => { btn.textContent = 'Test Connection'; btn.disabled = false; }, 2000);
    }
  } catch (error) {
    btn.textContent = 'Error';
    updateTallyStatusBanner(false);
    setTimeout(() => { btn.textContent = 'Test Connection'; btn.disabled = false; }, 2000);
  }
}

async function detectCompany() {
  const btn = document.getElementById('detectCompanyBtn');
  btn.textContent = 'Detecting...';
  btn.disabled = true;

  try {
    const result = await ipcRenderer.invoke('detect-tally-company');
    if (result && result.success && result.company) {
      document.getElementById('tallyCompanyName').value = result.company;
      btn.textContent = result.company;
    } else {
      btn.textContent = 'Not found';
    }
  } catch (error) {
    btn.textContent = 'Error';
  }

  setTimeout(() => { btn.textContent = 'Detect Company'; btn.disabled = false; }, 3000);
}

function testPartnerConnection() {
  // Simulate partner-connect deep link for testing
  ipcRenderer.send('test-partner-connect');
}

// Toggle handlers
document.addEventListener('DOMContentLoaded', () => {
  const autoCompany = document.getElementById('autoDetectCompany');
  const autoVersion = document.getElementById('autoDetectVersion');

  autoCompany.addEventListener('change', () => {
    document.getElementById('companyNameGroup').style.display = autoCompany.checked ? 'none' : 'block';
  });

  autoVersion.addEventListener('change', () => {
    document.getElementById('versionGroup').style.display = autoVersion.checked ? 'none' : 'block';
  });

  // Load initial data
  loadTallyData();

  // Listen for navigation from main process
  ipcRenderer.on('navigate-to', (event, page) => {
    navigateTo(page);
  });

  // Listen for status updates
  ipcRenderer.on('status-update', (event, data) => {
    updateStatusFromPush(data);
  });

  // Listen for sync progress
  ipcRenderer.on('tally-sync-progress', (event, progress) => {
    updateSyncProgress(progress);
  });
});

// ============ SYNC STATUS ============

async function loadSyncStatusData() {
  try {
    const result = await ipcRenderer.invoke('get-tally-sync-stats');
    if (result && result.success && result.syncStats) {
      const stats = result.syncStats;

      // Last sync time
      if (stats.lastSyncTime) {
        document.getElementById('lastSyncTime').innerHTML =
          `<svg width="14" height="14" viewBox="0 0 24 24" fill="#6b6b80"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>` +
          formatRelativeTime(stats.lastSyncTime);
        document.getElementById('lastSyncDate').textContent = new Date(stats.lastSyncTime).toLocaleString();
      }

      // Total items
      document.getElementById('totalItemsSynced').innerHTML =
        `<svg width="14" height="14" viewBox="0 0 24 24" fill="#10b981"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>` +
        (stats.totalItemsSynced || 0).toLocaleString();

      // Sync history
      renderSyncHistory(stats.syncHistory || []);
    }
  } catch (error) {
    console.error('[SETTINGS] Failed to load sync stats:', error);
  }
}

function renderSyncHistory(history) {
  const list = document.getElementById('syncHistoryList');

  if (!history || history.length === 0) {
    list.innerHTML = '<div class="empty-state"><p>No sync history yet</p></div>';
    return;
  }

  list.innerHTML = history.slice(0, 10).map((entry, index) => {
    const statusClass = entry.status || 'completed';
    const hasError = entry.error && (statusClass === 'failed' || statusClass === 'partial');
    const iconSvg = statusClass === 'completed'
      ? '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>'
      : statusClass === 'partial'
        ? '<svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>'
        : '<svg viewBox="0 0 24 24"><path d="M12 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm1-13h-2v6h2V7zm0 8h-2v2h2v-2z"/></svg>';

    const time = entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '--';
    const items = entry.itemCount ? `${entry.itemCount.toLocaleString()} items synced` : 'No items synced';

    return `
      <div class="sync-entry">
        <div class="sync-entry-header">
          <div class="sync-entry-left">
            <div class="sync-entry-icon ${statusClass}">${iconSvg}</div>
            <div>
              <span class="sync-entry-time">${time}</span>
              <span class="sync-entry-status ${statusClass}">${capitalize(statusClass)}</span>
            </div>
          </div>
          ${hasError ? `<div class="sync-entry-expand" onclick="toggleEntryDetails(${index})"><svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg></div>` : ''}
        </div>
        <div class="sync-entry-items">${items}</div>
        ${hasError ? `<div class="sync-entry-details" id="entry-details-${index}"><h4>Error Details</h4><p>${escapeHtml(entry.error)}</p></div>` : ''}
      </div>
    `;
  }).join('');
}

function toggleEntryDetails(index) {
  const details = document.getElementById(`entry-details-${index}`);
  const expand = details.previousElementSibling.querySelector('.sync-entry-expand');

  if (details) {
    details.classList.toggle('open');
    if (expand) expand.classList.toggle('open');
  }
}

async function triggerSyncNow() {
  const btn = document.getElementById('syncNowBtn');
  btn.disabled = true;
  btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg> Syncing...';

  try {
    await ipcRenderer.invoke('trigger-tally-sync');
  } catch (error) {
    console.error('[SETTINGS] Sync trigger failed:', error);
  }

  setTimeout(() => {
    btn.disabled = false;
    btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg> Sync Now';
    loadSyncStatusData();
  }, 3000);
}

function saveSyncInterval() {
  const interval = document.getElementById('syncIntervalSelect').value;
  ipcRenderer.invoke('save-tally-config', { syncIntervalMinutes: parseInt(interval) });
}

// ============ SYNC PROGRESS MODAL ============

function showSyncModal() {
  document.getElementById('syncProgressModal').classList.add('active');
}

function closeSyncModal() {
  document.getElementById('syncProgressModal').classList.remove('active');
}

function updateSyncProgress(progress) {
  showSyncModal();

  const percent = progress.percent || 0;
  document.getElementById('syncProgressBar').style.width = `${percent}%`;
  document.getElementById('syncPercentage').textContent = `${Math.round(percent)}% complete`;
  document.getElementById('syncItemProgress').textContent = `${(progress.processed || 0).toLocaleString()} / ${(progress.total || 0).toLocaleString()}`;
  document.getElementById('syncCurrentOp').textContent = progress.operation || 'Processing...';
  document.getElementById('syncProcessedCount').textContent = (progress.processed || 0).toLocaleString();
  document.getElementById('syncTotalCount').textContent = (progress.total || 0).toLocaleString();

  if (percent >= 100) {
    setTimeout(() => closeSyncModal(), 2000);
  }
}

function cancelSync() {
  ipcRenderer.send('cancel-tally-sync');
  closeSyncModal();
}

// ============ OVERVIEW PAGE ============

async function loadOverviewData() {
  try {
    const info = await ipcRenderer.invoke('get-agent-info');
    updateOverviewUI(info);
  } catch (error) {
    console.error('[SETTINGS] Failed to load overview data:', error);
  }
}

function updateOverviewUI(info) {
  // Registration banner
  const banner = document.getElementById('registrationBanner');
  const regDot = document.getElementById('regStatusDot');
  const regText = document.getElementById('regStatusText');
  const regIndicator = document.getElementById('regStatusIndicator');

  if (info.registered) {
    banner.className = 'status-banner connected';
    regDot.className = 'status-dot-sm green';
    regText.textContent = `Registered (${info.agentInfo?.shopId || 'Unknown'})`;
    regIndicator.className = 'status-indicator green';
  } else {
    banner.className = 'status-banner disconnected';
    regDot.className = 'status-dot-sm yellow';
    regText.textContent = 'Not Registered';
    regIndicator.className = 'status-indicator yellow';
  }

  // Stats
  document.getElementById('overviewRegStatus').textContent = info.registered ? 'Active' : 'Not Registered';
  document.getElementById('overviewRegStatus').className = `stat-card-value ${info.registered ? 'success' : 'warning'}`;

  const modules = info.modules || [];
  const enabledCount = modules.filter(m => m.enabled).length;
  document.getElementById('overviewModules').textContent = `${enabledCount}/${modules.length}`;

  document.getElementById('overviewJobs').textContent = info.stats?.jobsProcessed || '0';

  const lastPoll = info.stats?.lastPollTime
    ? formatRelativeTime(info.stats.lastPollTime)
    : 'Never';
  document.getElementById('overviewLastPoll').textContent = lastPoll;
}

async function loadSystemTrayData() {
  try {
    const info = await ipcRenderer.invoke('get-agent-info');
    document.getElementById('pollingStatusValue').textContent = info.stats?.isPolling ? 'Active' : 'Stopped';
    document.getElementById('pollingStatusValue').className = `stat-card-value ${info.stats?.isPolling ? 'success' : 'warning'}`;
    document.getElementById('jobsProcessedValue').textContent = info.stats?.jobsProcessed || '0';
    document.getElementById('queuePendingValue').textContent = info.queueStats?.pending || '0';
  } catch (error) {
    console.error('[SETTINGS] Failed to load system tray data:', error);
  }
}

// Setup toggle
function toggleSetup(mode) {
  document.getElementById('quickSetupToggle').classList.toggle('active', mode === 'quick');
  document.getElementById('advancedSetupToggle').classList.toggle('active', mode === 'advanced');
  document.getElementById('quickSetupCard').style.display = mode === 'quick' ? 'block' : 'none';
  document.getElementById('advancedSetupCard').style.display = mode === 'advanced' ? 'block' : 'none';
}

// Quick connect
async function quickConnect() {
  const apiKey = document.getElementById('quickApiKey').value.trim();
  if (!apiKey) return;

  const btn = document.getElementById('quickConnectBtn');
  btn.textContent = 'Connecting...';
  btn.disabled = true;

  try {
    const result = await ipcRenderer.invoke('connect-with-api-key', apiKey);
    if (result.success) {
      btn.textContent = 'Connected!';
      loadOverviewData();
    } else {
      btn.textContent = 'Failed: ' + (result.error || 'Unknown error');
    }
  } catch (error) {
    btn.textContent = 'Error';
  }

  setTimeout(() => { btn.textContent = 'Connect'; btn.disabled = false; }, 3000);
}

// Advanced save
async function saveAdvancedConfig() {
  const btn = document.getElementById('advSaveBtn');
  btn.textContent = 'Saving...';
  btn.disabled = true;

  const credentials = {
    cloudUrl: document.getElementById('advCloudUrl').value.trim(),
    apiKey: document.getElementById('advApiKey').value.trim(),
    agentId: document.getElementById('advAgentId').value.trim(),
    shopId: document.getElementById('advShopId').value.trim()
  };

  try {
    const result = await ipcRenderer.invoke('save-credentials', credentials);
    if (result.success) {
      btn.textContent = 'Saved!';
      loadOverviewData();
    } else {
      btn.textContent = 'Failed';
    }
  } catch (error) {
    btn.textContent = 'Error';
  }

  setTimeout(() => { btn.textContent = 'Save Configuration'; btn.disabled = false; }, 2000);
}

// Clear configuration
async function clearConfiguration() {
  if (!confirm('Are you sure you want to clear all configuration? This will disconnect the agent.')) return;

  try {
    await ipcRenderer.invoke('clear-credentials');
    loadOverviewData();
  } catch (error) {
    console.error('[SETTINGS] Clear failed:', error);
  }
}

// Status push handler
function updateStatusFromPush(data) {
  // Update system tray page if visible
  if (document.getElementById('page-system-tray').classList.contains('active')) {
    document.getElementById('pollingStatusValue').textContent = data.polling ? 'Active' : 'Stopped';
    document.getElementById('jobsProcessedValue').textContent = data.stats?.jobsProcessed || '0';
  }
}

// ============ UTILITIES ============

function formatRelativeTime(isoString) {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;

  if (diffMs < 60000) return 'Just now';
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)} minutes ago`;
  if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)} hours ago`;
  return `${Math.floor(diffMs / 86400000)} days ago`;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
