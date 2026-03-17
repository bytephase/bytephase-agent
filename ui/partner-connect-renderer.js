const { ipcRenderer } = require('electron');

let connectionToken = null;

// Receive connection data from main process
ipcRenderer.on('init-connect', (event, data) => {
  connectionToken = data.token;

  document.getElementById('partnerName').textContent = data.partnerName || 'BytePhase Partner Platform';
  document.getElementById('partnerUrl').textContent = data.partnerUrl || 'partner.bytephase.com';
  document.getElementById('shopName').textContent = data.shopName || 'Unknown Shop';

  // Show truncated token
  if (data.token) {
    const truncated = data.token.substring(0, 24) + '...';
    document.getElementById('tokenPreview').textContent = `Connection Token: ${truncated}`;
  }
});

function showScreen(screenName) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(`screen-${screenName}`);
  if (screen) screen.classList.add('active');
}

async function approveConnection() {
  if (!connectionToken) return;

  const btn = document.getElementById('connectBtn');
  btn.textContent = 'Connecting...';
  btn.disabled = true;

  try {
    const result = await ipcRenderer.invoke('approve-partner-connection', connectionToken);

    if (result && result.success) {
      showScreen('success');

      // Auto-redirect to settings after 3 seconds
      setTimeout(() => {
        ipcRenderer.send('open-settings-from-tray', 'tally-integration');
        window.close();
      }, 3000);
    } else {
      showScreen('error');
      document.getElementById('errorMessage').textContent = result.error || 'Connection failed. Please try again.';
    }
  } catch (error) {
    showScreen('error');
    document.getElementById('errorMessage').textContent = error.message || 'An unexpected error occurred.';
  }
}

function cancelConnection() {
  ipcRenderer.send('cancel-partner-connection');
  window.close();
}
