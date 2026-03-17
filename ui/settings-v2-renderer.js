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
  if (page === 'logs') loadLogs();
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

// Track loaded sync config for the current session
let _currentSyncConfig = {};
let _stockGroups = [];

async function loadTallyData() {
  try {
    const result = await ipcRenderer.invoke('get-tally-config');
    if (result && result.success) {
      const config = result.config;
      _currentSyncConfig = config;

      document.getElementById('tallyHost').value = config.tallyHost || 'localhost';
      document.getElementById('tallyPort').value = config.tallyPort || 9000;
      document.getElementById('autoDetectCompany').checked = config.tallyCompany === null;
      document.getElementById('autoDetectVersion').checked = config.autoDetectVersion !== false;

      if (config.tallyCompany) {
        document.getElementById('tallyCompanyName').value = config.tallyCompany;
      }

      // Set sync interval dropdown
      const intervalSelect = document.getElementById('syncIntervalSelect');
      if (intervalSelect && config.syncIntervalMinutes) {
        intervalSelect.value = String(config.syncIntervalMinutes);
      }

      // If a company is already selected, show the config cards
      if (config.selectedCompany) {
        await showCompanySelection();
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
    // Save host/port before testing so the backend uses the current values
    const host = document.getElementById('tallyHost').value || 'localhost';
    const port = parseInt(document.getElementById('tallyPort').value) || 9000;
    await ipcRenderer.invoke('save-tally-config', { tallyHost: host, tallyPort: port });

    const result = await ipcRenderer.invoke('test-tally-connection');
    updateTallyStatusBanner(result.success);

    if (result.success) {
      btn.textContent = 'Connected!';
      // Show company selection on successful connection
      showCompanySelection();
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

// ============ COMPANY SELECTION & STOCK GROUPS ============

async function showCompanySelection() {
  const card = document.getElementById('companySelectionCard');
  card.style.display = 'block';
  await refreshCompanies();
}

async function refreshCompanies() {
  const select = document.getElementById('companySelect');
  const btn = document.getElementById('refreshCompaniesBtn');

  if (btn) btn.disabled = true;

  try {
    const result = await ipcRenderer.invoke('list-tally-companies');
    if (result && result.success && result.companies) {
      select.innerHTML = '<option value="">-- Select Company --</option>';
      for (const company of result.companies) {
        const opt = document.createElement('option');
        opt.value = company;
        opt.textContent = company;
        if (company === _currentSyncConfig.selectedCompany) {
          opt.selected = true;
        }
        select.appendChild(opt);
      }

      // If company was already selected, load stock groups
      if (_currentSyncConfig.selectedCompany) {
        await loadStockGroups(_currentSyncConfig.selectedCompany);
      }
    }
  } catch (error) {
    console.error('[SETTINGS] Failed to load companies:', error);
  }

  if (btn) btn.disabled = false;
}

async function onCompanySelected() {
  const select = document.getElementById('companySelect');
  const company = select.value;

  if (!company) {
    document.getElementById('stockGroupCard').style.display = 'none';
    return;
  }

  await loadStockGroups(company);
}

async function loadStockGroups(companyName) {
  const card = document.getElementById('stockGroupCard');
  const tree = document.getElementById('stockGroupTree');

  card.style.display = 'block';
  tree.innerHTML = '<div class="empty-state"><p>Loading stock groups...</p></div>';

  try {
    const result = await ipcRenderer.invoke('list-tally-stock-groups', companyName);
    if (result && result.success && result.groups) {
      _stockGroups = result.groups;
      renderStockGroupTree(result.groups);
    } else {
      tree.innerHTML = '<div class="empty-state"><p>Failed to load stock groups</p></div>';
    }
  } catch (error) {
    tree.innerHTML = `<div class="empty-state"><p>Error: ${error.message}</p></div>`;
  }
}

function renderStockGroupTree(groups) {
  const tree = document.getElementById('stockGroupTree');
  const selectedGroups = _currentSyncConfig.syncGroups || [];

  // Build parent-child hierarchy
  const roots = groups.filter(g => !g.parent);
  const childrenOf = (parentName) => groups.filter(g => g.parent === parentName);

  let html = '';

  function renderGroup(group, isChild) {
    const checked = selectedGroups.length === 0 || selectedGroups.includes(group.name);
    const children = childrenOf(group.name);

    html += `
      <div class="group-item ${isChild ? 'child' : ''}" data-group="${escapeHtml(group.name)}" data-parent="${escapeHtml(group.parent || '')}">
        <input type="checkbox" ${checked ? 'checked' : ''} onchange="onGroupToggled(this)">
        <span class="group-item-label">${escapeHtml(group.name)}</span>
      </div>
    `;

    for (const child of children) {
      renderGroup(child, true);
    }
  }

  for (const root of roots) {
    renderGroup(root, false);
  }

  // Also render any orphan groups (parent not in list)
  const allNames = new Set(groups.map(g => g.name));
  const orphans = groups.filter(g => g.parent && !allNames.has(g.parent) && !roots.includes(g));
  for (const orphan of orphans) {
    renderGroup(orphan, false);
  }

  if (!html) {
    tree.innerHTML = '<div class="empty-state"><p>No stock groups found</p></div>';
    return;
  }

  tree.innerHTML = html;
  updateGroupSelectionCount();
}

function onGroupToggled(checkbox) {
  const item = checkbox.closest('.group-item');
  const groupName = item.dataset.group;

  // Toggle children if this is a parent
  const children = document.querySelectorAll(`.group-item[data-parent="${groupName}"]`);
  children.forEach(child => {
    child.querySelector('input[type="checkbox"]').checked = checkbox.checked;
  });

  updateGroupSelectionCount();
}

function selectAllGroups() {
  document.querySelectorAll('#stockGroupTree input[type="checkbox"]').forEach(cb => cb.checked = true);
  updateGroupSelectionCount();
}

function deselectAllGroups() {
  document.querySelectorAll('#stockGroupTree input[type="checkbox"]').forEach(cb => cb.checked = false);
  updateGroupSelectionCount();
}

function updateGroupSelectionCount() {
  const checked = document.querySelectorAll('#stockGroupTree input[type="checkbox"]:checked').length;
  const total = document.querySelectorAll('#stockGroupTree input[type="checkbox"]').length;
  const el = document.getElementById('groupSelectionCount');
  if (el) el.textContent = `${checked} / ${total} groups selected`;
}

function getSelectedGroups() {
  const groups = [];
  document.querySelectorAll('#stockGroupTree .group-item').forEach(item => {
    const cb = item.querySelector('input[type="checkbox"]');
    if (cb && cb.checked) {
      groups.push(item.dataset.group);
    }
  });
  return groups;
}

async function saveSyncConfig() {
  const company = document.getElementById('companySelect').value;
  const syncGroups = getSelectedGroups();
  const allGroups = document.querySelectorAll('#stockGroupTree input[type="checkbox"]').length;

  // If all groups are selected, pass empty array (means "sync all")
  const effectiveGroups = syncGroups.length === allGroups ? [] : syncGroups;

  const config = {
    selectedCompany: company || null,
    syncGroups: effectiveGroups
  };

  try {
    const result = await ipcRenderer.invoke('save-tally-sync-config', config);
    if (result.success) {
      _currentSyncConfig = { ..._currentSyncConfig, ...config };
      alert('Sync configuration saved successfully');
    } else {
      alert('Failed to save: ' + (result.error || 'Unknown error'));
    }
  } catch (error) {
    alert('Error saving config: ' + error.message);
  }
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

  // Listen for sync completion
  ipcRenderer.on('tally-sync-complete', (event, data) => {
    // Hide inline progress
    const inlineEl = document.getElementById('syncProgressInline');
    if (inlineEl) inlineEl.style.display = 'none';

    // Close modal
    closeSyncModal();

    // Reload sync status
    const syncTab = document.getElementById('tab-sync-status');
    if (syncTab && syncTab.classList.contains('active')) {
      loadSyncStatusData();
    }
  });

  // Listen for sync errors
  ipcRenderer.on('tally-sync-error', (event, data) => {
    const inlineEl = document.getElementById('syncProgressInline');
    if (inlineEl) inlineEl.style.display = 'none';

    closeSyncModal();

    const syncTab = document.getElementById('tab-sync-status');
    if (syncTab && syncTab.classList.contains('active')) {
      loadSyncStatusData();
    }
  });
});

// ============ SYNC STATUS ============

async function loadSyncStatusData() {
  try {
    const result = await ipcRenderer.invoke('get-tally-sync-stats');
    if (result && result.success && result.syncStats) {
      const stats = result.syncStats;
      const clockSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="#6b6b80"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>';

      // Last delta sync
      const deltaSyncEl = document.getElementById('lastDeltaSyncTime');
      const deltaSyncDateEl = document.getElementById('lastDeltaSyncDate');
      if (stats.lastDeltaSyncTime) {
        deltaSyncEl.innerHTML = clockSvg + formatRelativeTime(stats.lastDeltaSyncTime);
        deltaSyncDateEl.textContent = new Date(stats.lastDeltaSyncTime).toLocaleString();
      } else {
        deltaSyncEl.innerHTML = clockSvg + 'Never';
        deltaSyncDateEl.textContent = '--';
      }

      // Last full sync
      const fullSyncEl = document.getElementById('lastFullSyncTime');
      const fullSyncDateEl = document.getElementById('lastFullSyncDate');
      if (stats.lastFullSyncTime) {
        fullSyncEl.innerHTML = clockSvg + formatRelativeTime(stats.lastFullSyncTime);
        fullSyncDateEl.textContent = new Date(stats.lastFullSyncTime).toLocaleString();
      } else {
        fullSyncEl.innerHTML = clockSvg + 'Never';
        fullSyncDateEl.textContent = '--';
      }

      // Sync status
      const statusEl = document.getElementById('syncCurrentStatus');
      const syncStatus = stats.syncStatus || 'idle';
      statusEl.innerHTML = `<span class="sync-status-badge ${syncStatus}">${capitalize(syncStatus)}</span>`;

      // Failure count
      const failureEl = document.getElementById('syncFailureCount');
      const failures = stats.consecutiveFailures || 0;
      failureEl.textContent = failures > 0 ? `${failures} consecutive failure${failures > 1 ? 's' : ''}` : 'No failures';

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
    const hasError = entry.error && (statusClass === 'failed' || statusClass === 'partial' || statusClass === 'abandoned');
    const syncType = entry.syncType || 'delta';
    const iconSvg = statusClass === 'completed'
      ? '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>'
      : statusClass === 'partial' || statusClass === 'abandoned'
        ? '<svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>'
        : '<svg viewBox="0 0 24 24"><path d="M12 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm1-13h-2v6h2V7zm0 8h-2v2h2v-2z"/></svg>';

    const time = entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '--';
    const itemsSynced = entry.itemsSynced || entry.itemCount || 0;
    const items = itemsSynced > 0 ? `${itemsSynced.toLocaleString()} items synced` : 'No items synced';
    const duration = entry.duration ? ` (${Math.round(entry.duration / 1000)}s)` : '';

    return `
      <div class="sync-entry">
        <div class="sync-entry-header">
          <div class="sync-entry-left">
            <div class="sync-entry-icon ${statusClass}">${iconSvg}</div>
            <div>
              <span class="sync-entry-time">${time}</span>
              <span class="sync-type-badge ${syncType}">${capitalize(syncType)}</span>
              <span class="sync-entry-status ${statusClass}">${capitalize(statusClass)}${duration}</span>
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

async function triggerSyncNow(syncType = 'delta') {
  const deltaBtn = document.getElementById('deltaSyncNowBtn');
  const fullBtn = document.getElementById('fullSyncNowBtn');

  if (deltaBtn) deltaBtn.disabled = true;
  if (fullBtn) fullBtn.disabled = true;

  try {
    const result = await ipcRenderer.invoke('trigger-tally-sync', syncType);
    if (result && !result.success) {
      console.error('[SETTINGS] Sync failed:', result.error);
    }
  } catch (error) {
    console.error('[SETTINGS] Sync trigger failed:', error);
  }

  setTimeout(() => {
    if (deltaBtn) deltaBtn.disabled = false;
    if (fullBtn) fullBtn.disabled = false;
    loadSyncStatusData();
  }, 2000);
}

function saveSyncInterval() {
  const interval = document.getElementById('syncIntervalSelect').value;
  ipcRenderer.invoke('save-tally-sync-config', { syncIntervalMinutes: parseInt(interval) });
}

// ============ SYNC PROGRESS MODAL ============

function showSyncModal() {
  document.getElementById('syncProgressModal').classList.add('active');
}

function closeSyncModal() {
  document.getElementById('syncProgressModal').classList.remove('active');
}

function updateSyncProgress(progress) {
  // Update inline progress indicator
  const inlineEl = document.getElementById('syncProgressInline');
  if (inlineEl) {
    inlineEl.style.display = 'block';

    const percent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

    const badge = document.getElementById('syncProgressBadge');
    if (badge) badge.textContent = `${capitalize(progress.syncType || 'delta')} Sync`;

    const msg = document.getElementById('syncProgressMessage');
    if (msg) msg.textContent = progress.message || 'Processing...';

    const bar = document.getElementById('syncInlineProgressBar');
    if (bar) bar.style.width = `${percent}%`;

    const detail = document.getElementById('syncProgressDetail');
    if (detail) detail.textContent = `${(progress.current || 0).toLocaleString()} / ${(progress.total || 0).toLocaleString()} items`;
  }

  // Also update modal if open
  const percent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  const progressBar = document.getElementById('syncProgressBar');
  if (progressBar) progressBar.style.width = `${percent}%`;

  const percentEl = document.getElementById('syncPercentage');
  if (percentEl) percentEl.textContent = `${percent}% complete`;

  const itemProgress = document.getElementById('syncItemProgress');
  if (itemProgress) itemProgress.textContent = `${(progress.current || 0).toLocaleString()} / ${(progress.total || 0).toLocaleString()}`;

  const opEl = document.getElementById('syncCurrentOp');
  if (opEl) opEl.textContent = progress.message || 'Processing...';

  const processedEl = document.getElementById('syncProcessedCount');
  if (processedEl) processedEl.textContent = (progress.current || 0).toLocaleString();

  const totalEl = document.getElementById('syncTotalCount');
  if (totalEl) totalEl.textContent = (progress.total || 0).toLocaleString();

  // Update sync status badge
  const statusEl = document.getElementById('syncCurrentStatus');
  if (statusEl) statusEl.innerHTML = '<span class="sync-status-badge syncing">Syncing</span>';
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

// ============ LOGS ============

async function loadLogs() {
  try {
    const logs = await ipcRenderer.invoke('get-logs');
    const container = document.getElementById('logsContainer');
    container.innerHTML = '';

    if (logs.length === 0) {
      container.innerHTML = '<p class="logs-placeholder">No logs yet...</p>';
      updateLogsCount(0);
      return;
    }

    logs.forEach(log => appendLogEntry(log));
    updateLogsCount(logs.length);
    container.scrollTop = container.scrollHeight;
  } catch (error) {
    console.error('[SETTINGS] Failed to load logs:', error);
  }
}

function appendLogEntry(log) {
  const container = document.getElementById('logsContainer');

  // Remove placeholder if present
  const placeholder = container.querySelector('.logs-placeholder');
  if (placeholder) placeholder.remove();

  const entry = document.createElement('div');
  entry.className = `log-entry log-${log.level}`;

  const time = new Date(log.timestamp).toLocaleTimeString();

  entry.innerHTML = `
    <span class="log-time">${time}</span>
    <span class="log-level">[${log.level.toUpperCase()}]</span>
    <span class="log-message">${escapeHtml(log.message)}</span>
  `;

  container.appendChild(entry);

  // Auto-scroll if near bottom
  const nearBottom = container.scrollHeight - container.clientHeight <= container.scrollTop + 100;
  if (nearBottom) {
    container.scrollTop = container.scrollHeight;
  }
}

function clearLogs() {
  const container = document.getElementById('logsContainer');
  container.innerHTML = '<p class="logs-placeholder">Logs cleared</p>';
  updateLogsCount(0);
}

function updateLogsCount(count) {
  const el = document.getElementById('logsCount');
  if (el) el.textContent = `${count} ${count === 1 ? 'entry' : 'entries'}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function viewLogs() {
  ipcRenderer.invoke('open-logs-folder');
}

// Listen for real-time log entries
ipcRenderer.on('log-entry', (event, log) => {
  const logsPage = document.getElementById('page-logs');
  if (logsPage && logsPage.classList.contains('active')) {
    appendLogEntry(log);
    const container = document.getElementById('logsContainer');
    const count = container.querySelectorAll('.log-entry').length;
    updateLogsCount(count);
  }
});

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
