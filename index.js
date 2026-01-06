const { app, Tray, Menu, nativeImage, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// Services
const authService = require('./services/auth.service');
const tallyService = require('./services/tally.service');
const pollingService = require('./services/polling.service');
const queueService = require('./services/queue.service');
const deepLinkService = require('./services/deeplink.service');

// Utilities
const NotificationHelper = require('./utils/notification.helper');

let tray = null;
let settingsWindow = null;
let agentStatus = {
  registered: false,
  tallyRunning: false,
  polling: false,
  lastPoll: null,
  stats: {}
};

// Log buffer for UI display
const logBuffer = [];
const MAX_LOGS = 100;

// Capture console output
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

console.log = function(...args) {
  const message = args.join(' ');
  addLog('info', message);
  originalConsoleLog.apply(console, args);
};

console.warn = function(...args) {
  const message = args.join(' ');
  addLog('warning', message);
  originalConsoleWarn.apply(console, args);
};

console.error = function(...args) {
  const message = args.join(' ');
  addLog('error', message);
  originalConsoleError.apply(console, args);
};

function addLog(level, message) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message
  };

  logBuffer.push(logEntry);

  // Keep only last MAX_LOGS entries
  if (logBuffer.length > MAX_LOGS) {
    logBuffer.shift();
  }

  // Send to settings window if open
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('log-entry', logEntry);
  }
}

/**
 * Protocol registration for bytephase:// deep links
 */
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('bytephase', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('bytephase');
}

/**
 * Single instance lock - ensures only one instance of the app runs
 */
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('[APP] Another instance is already running. Sending deep link and quitting...');
  app.quit();
} else {
  // Handle deep links from second instance (warm start)
  app.on('second-instance', async (event, commandLine, workingDirectory) => {
    console.log('[APP] Second instance detected, processing deep link...');

    // Extract deep link URL from command line
    const deeplinkUrl = commandLine.find(arg => arg.startsWith('bytephase://'));

    if (deeplinkUrl) {
      await handleDeepLink(deeplinkUrl);
    }

    // Focus settings window if open
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.focus();
    }
  });

  // macOS: Handle deep links via 'open-url' event
  app.on('open-url', async (event, url) => {
    event.preventDefault();
    console.log('[APP] Deep link opened (macOS):', url);
    await handleDeepLink(url);
  });
}

/**
 * Initialize application
 */
app.whenReady().then(async () => {
  console.log('[APP] Application started');

  // Initialize queue database
  await queueService.init();

  // Create system tray
  createTray();

  // Check if agent is registered
  agentStatus.registered = authService.isRegistered();

  // Handle deep link on cold start (Windows/Linux)
  const deeplinkUrl = process.argv.find(arg => arg.startsWith('bytephase://'));
  if (deeplinkUrl) {
    console.log('[APP] Cold start with deep link:', deeplinkUrl);
    await handleDeepLink(deeplinkUrl);
  } else {
    // Normal startup flow
    if (agentStatus.registered) {
      // Start polling service
      await pollingService.start();
      agentStatus.polling = true;
      console.log('[APP] Polling service started');
    } else {
      console.log('[APP] Agent not registered. Please configure settings.');
    }
  }

  // TEMP: Always auto-open settings for testing
  setTimeout(() => {
    openSettings();
  }, 1000);

  // Start status update loop
  startStatusUpdates();

  // Cleanup old queue items every hour
  setInterval(() => {
    queueService.cleanup();
  }, 60 * 60 * 1000);

  // Cleanup expired token nonces every hour
  setInterval(() => {
    require('./services/token.service').cleanupExpiredNonces();
  }, 60 * 60 * 1000);
});

/**
 * Create system tray icon and menu
 */
function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  let trayIcon;

  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) {
      console.warn('[TRAY] Icon not found, using default');
      trayIcon = null;
    }
  } catch (error) {
    console.warn('[TRAY] Error loading icon:', error.message);
    trayIcon = null;
  }

  tray = new Tray(trayIcon || nativeImage.createEmpty());
  tray.setToolTip('BytePhase Agent');

  updateTrayMenu();
}

/**
 * Update tray menu with current status
 */
function updateTrayMenu() {
  const registered = authService.isRegistered();
  const agentInfo = registered ? authService.getAgentInfo() : {};
  const stats = pollingService.getStats();
  const queueStats = queueService.getStats();

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'BytePhase Agent',
      enabled: false,
      icon: nativeImage.createEmpty()
    },
    { type: 'separator' },
    {
      label: registered ? `✓ Registered (${agentInfo.shopId})` : '✗ Not Registered',
      enabled: false
    },
    {
      label: agentStatus.tallyRunning ? '✓ Tally Running' : '✗ Tally Offline',
      enabled: false
    },
    {
      label: agentStatus.polling ? '✓ Polling Active' : '✗ Polling Stopped',
      enabled: false
    },
    { type: 'separator' },
    {
      label: `Jobs Processed: ${stats.jobsProcessed || 0}`,
      enabled: false
    },
    {
      label: `Queue: ${queueStats.pending || 0} pending`,
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => openSettings()
    },
    {
      label: registered ? 'Stop Polling' : 'Start Polling',
      enabled: registered,
      click: () => togglePolling()
    },
    {
      label: 'View Logs',
      click: () => {
        const logsPath = path.join(app.getPath('userData'), 'logs');
        require('electron').shell.openPath(logsPath);
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        pollingService.stop();
        queueService.close();
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

/**
 * Open settings window
 */
function openSettings() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 600,
    height: 700,
    title: 'BytePhase Agent - Settings',
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  settingsWindow.loadFile(path.join(__dirname, 'ui', 'settings.html'));

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

/**
 * Handle deep link URL
 * @param {string} url - The deep link URL (bytephase://...)
 */
async function handleDeepLink(url) {
  console.log('[APP] Processing deep link:', url);

  try {
    // Process the deep link
    const result = await deepLinkService.processDeepLink(url);

    if (result.success) {
      // Show success notification
      NotificationHelper.showConnectionSuccess(result.shopId);

      // Start polling if not already running
      if (!agentStatus.polling) {
        await pollingService.start();
        agentStatus.polling = true;
        console.log('[APP] Polling started after deep link connection');
      }

      agentStatus.registered = true;
      updateTrayMenu();

      console.log('[APP] Deep link connection successful');

    } else {
      // Show error notification
      NotificationHelper.showConnectionError(result.error);

      // Open settings window to allow manual entry
      console.error('[APP] Deep link connection failed:', result.error);
      setTimeout(() => {
        openSettings();
      }, 2000); // Delay to allow notification to show
    }

  } catch (error) {
    console.error('[APP] Error handling deep link:', error);
    NotificationHelper.showConnectionError(error.message);
    setTimeout(() => {
      openSettings();
    }, 2000);
  }
}

/**
 * Toggle polling service
 */
async function togglePolling() {
  if (agentStatus.polling) {
    pollingService.stop();
    agentStatus.polling = false;
    console.log('[APP] Polling stopped');
  } else {
    if (!authService.isRegistered()) {
      console.error('[APP] Cannot start polling - agent not registered');
      return;
    }
    await pollingService.start();
    agentStatus.polling = true;
    console.log('[APP] Polling started');
  }
  updateTrayMenu();
}

/**
 * Start periodic status updates
 */
function startStatusUpdates() {
  setInterval(async () => {
    // Check Tally status
    agentStatus.tallyRunning = await tallyService.isRunning();

    // Get polling stats
    agentStatus.stats = pollingService.getStats();
    agentStatus.lastPoll = agentStatus.stats.lastPollTime;

    // Update tray menu
    updateTrayMenu();
  }, 5000); // Update every 5 seconds
}

/**
 * IPC Handlers for settings window
 */
ipcMain.handle('get-agent-info', () => {
  return {
    registered: authService.isRegistered(),
    agentInfo: authService.getAgentInfo(),
    stats: pollingService.getStats(),
    queueStats: queueService.getStats(),
    tallyRunning: agentStatus.tallyRunning
  };
});

ipcMain.handle('save-credentials', async (event, credentials) => {
  try {
    await authService.setCredentials(credentials);

    // Start polling if not already running
    if (!agentStatus.polling) {
      await pollingService.start();
      agentStatus.polling = true;
    }

    agentStatus.registered = true;
    updateTrayMenu();

    return { success: true };
  } catch (error) {
    console.error('[APP] Error saving credentials:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('clear-credentials', () => {
  try {
    pollingService.stop();
    authService.clearCredentials();
    agentStatus.registered = false;
    agentStatus.polling = false;
    updateTrayMenu();

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('test-tally-connection', async () => {
  try {
    const running = await tallyService.isRunning();
    if (!running) {
      return { success: false, error: 'Tally is not running' };
    }

    const version = await tallyService.getVersion();
    const company = await tallyService.getCompanyName();

    return {
      success: true,
      version,
      company
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get all logs
ipcMain.handle('get-logs', () => {
  return logBuffer;
});

// Prevent app from quitting when all windows are closed
app.on('window-all-closed', (e) => {
  e.preventDefault();
});

// Handle app quit
app.on('before-quit', () => {
  pollingService.stop();
  queueService.close();
});
