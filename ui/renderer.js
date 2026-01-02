const { ipcRenderer } = require('electron');

// Tab switching
function openTab(tabName) {
  const tabs = document.getElementsByClassName('tab-content');
  for (let tab of tabs) {
    tab.classList.remove('active');
  }

  const buttons = document.getElementsByClassName('tab-button');
  for (let button of buttons) {
    button.classList.remove('active');
  }

  document.getElementById(tabName).classList.add('active');
  event.target.classList.add('active');

  if (tabName === 'status') {
    refreshStatus();
  } else if (tabName === 'logs') {
    loadLogs();
  }
}

// Load initial data
window.addEventListener('DOMContentLoaded', async () => {
  await loadAgentInfo();
  setupFormHandlers();

  // Auto-refresh status every 5 seconds
  setInterval(() => {
    if (document.getElementById('status').classList.contains('active')) {
      refreshStatus();
    }
  }, 5000);
});

// Load agent information
async function loadAgentInfo() {
  try {
    const info = await ipcRenderer.invoke('get-agent-info');

    if (info.registered) {
      // Populate form
      document.getElementById('cloudUrl').value = info.agentInfo.cloudUrl || '';
      document.getElementById('agentId').value = info.agentInfo.agentId || '';
      document.getElementById('shopId').value = info.agentInfo.shopId || '';
      document.getElementById('apiKey').value = '••••••••••••••••'; // Masked

      // Update registration badge
      document.getElementById('registrationStatus').innerHTML =
        '<span class="badge badge-success">✓ Registered</span>';
    }

    // Update status tab
    updateStatusDisplay(info);
  } catch (error) {
    console.error('Error loading agent info:', error);
    showNotification('Error loading agent info', 'error');
  }
}

// Setup form handlers
function setupFormHandlers() {
  const form = document.getElementById('configForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const credentials = {
      cloudUrl: document.getElementById('cloudUrl').value.trim(),
      apiKey: document.getElementById('apiKey').value.trim(),
      agentId: document.getElementById('agentId').value.trim(),
      shopId: document.getElementById('shopId').value.trim()
    };

    // Validate
    if (!credentials.cloudUrl || !credentials.apiKey || !credentials.agentId || !credentials.shopId) {
      showNotification('Please fill all fields', 'error');
      return;
    }

    // Validate URL
    try {
      new URL(credentials.cloudUrl);
    } catch (error) {
      showNotification('Invalid cloud URL', 'error');
      return;
    }

    // Save credentials
    const result = await ipcRenderer.invoke('save-credentials', credentials);

    if (result.success) {
      showNotification('Configuration saved successfully! Agent is now running.', 'success');
      document.getElementById('registrationStatus').innerHTML =
        '<span class="badge badge-success">✓ Registered</span>';

      // Refresh status
      await loadAgentInfo();
    } else {
      showNotification(`Error: ${result.error}`, 'error');
    }
  });
}

// Test Tally connection
async function testTallyConnection() {
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = 'Testing...';

  try {
    const result = await ipcRenderer.invoke('test-tally-connection');

    if (result.success) {
      showNotification(
        `✓ Connected to Tally ${result.version}\nCompany: ${result.company}`,
        'success'
      );
    } else {
      showNotification(
        `✗ Failed to connect to Tally\n${result.error}`,
        'error'
      );
    }
  } catch (error) {
    showNotification('Error testing connection', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Test Tally';
  }
}

// Clear configuration
async function clearConfiguration() {
  if (!confirm('Are you sure you want to clear all configuration? The agent will stop running.')) {
    return;
  }

  const result = await ipcRenderer.invoke('clear-credentials');

  if (result.success) {
    // Clear form
    document.getElementById('cloudUrl').value = '';
    document.getElementById('apiKey').value = '';
    document.getElementById('agentId').value = '';
    document.getElementById('shopId').value = '';

    document.getElementById('registrationStatus').innerHTML =
      '<span class="badge badge-warning">Not Registered</span>';

    showNotification('Configuration cleared', 'success');
  } else {
    showNotification(`Error: ${result.error}`, 'error');
  }
}

// Refresh status
async function refreshStatus() {
  try {
    const info = await ipcRenderer.invoke('get-agent-info');
    updateStatusDisplay(info);
  } catch (error) {
    console.error('Error refreshing status:', error);
  }
}

// Update status display
function updateStatusDisplay(info) {
  // Registration
  document.getElementById('statusRegistered').innerHTML = info.registered
    ? '<span class="text-success">✓ Registered</span>'
    : '<span class="text-danger">✗ Not Registered</span>';

  // Tally
  document.getElementById('statusTally').innerHTML = info.tallyRunning
    ? '<span class="text-success">✓ Running</span>'
    : '<span class="text-danger">✗ Offline</span>';

  // Polling
  document.getElementById('statusPolling').innerHTML = info.stats.isRunning
    ? '<span class="text-success">✓ Active</span>'
    : '<span class="text-danger">✗ Stopped</span>';

  // Version (to be implemented in Tally service)
  document.getElementById('statusVersion').textContent = '-';

  // Stats
  document.getElementById('statusJobsProcessed').textContent = info.stats.jobsProcessed || 0;
  document.getElementById('statusJobsFailed').textContent = info.stats.jobsFailed || 0;
  document.getElementById('statusQueuePending').textContent = info.queueStats.pending || 0;

  // Last poll
  if (info.stats.lastPollTime) {
    const lastPoll = new Date(info.stats.lastPollTime);
    const now = new Date();
    const diffSeconds = Math.floor((now - lastPoll) / 1000);

    if (diffSeconds < 60) {
      document.getElementById('statusLastPoll').textContent = `${diffSeconds}s ago`;
    } else if (diffSeconds < 3600) {
      document.getElementById('statusLastPoll').textContent = `${Math.floor(diffSeconds / 60)}m ago`;
    } else {
      document.getElementById('statusLastPoll').textContent = lastPoll.toLocaleTimeString();
    }
  } else {
    document.getElementById('statusLastPoll').textContent = 'Never';
  }
}

// Show notification
function showNotification(message, type = 'info') {
  // Simple alert for now - can be replaced with toast notifications
  if (type === 'error') {
    alert('❌ ' + message);
  } else if (type === 'success') {
    alert('✓ ' + message);
  } else {
    alert(message);
  }
}

// Load and display logs
async function loadLogs() {
  try {
    const logs = await ipcRenderer.invoke('get-logs');
    const container = document.getElementById('logsContainer');
    container.innerHTML = '';

    if (logs.length === 0) {
      container.innerHTML = '<p class="text-muted">No logs yet...</p>';
      return;
    }

    logs.forEach(log => {
      appendLogEntry(log);
    });

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
  } catch (error) {
    console.error('Failed to load logs:', error);
  }
}

// Append a single log entry
function appendLogEntry(log) {
  const container = document.getElementById('logsContainer');

  // Remove placeholder text if exists
  const placeholder = container.querySelector('.text-muted');
  if (placeholder) {
    placeholder.remove();
  }

  const logEntry = document.createElement('div');
  logEntry.className = `log-entry log-${log.level}`;

  const timestamp = new Date(log.timestamp).toLocaleTimeString();

  logEntry.innerHTML = `
    <span class="log-time">${timestamp}</span>
    <span class="log-level">[${log.level.toUpperCase()}]</span>
    <span class="log-message">${escapeHtml(log.message)}</span>
  `;

  container.appendChild(logEntry);

  // Auto-scroll if near bottom
  const isScrolledToBottom = container.scrollHeight - container.clientHeight <= container.scrollTop + 100;
  if (isScrolledToBottom) {
    container.scrollTop = container.scrollHeight;
  }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Listen for new log entries
ipcRenderer.on('log-entry', (event, log) => {
  // Only update if logs tab is visible
  if (document.getElementById('logs').classList.contains('active')) {
    appendLogEntry(log);
  }
});

// Make functions globally available
window.openTab = openTab;
window.testTallyConnection = testTallyConnection;
window.clearConfiguration = clearConfiguration;
window.refreshStatus = refreshStatus;
