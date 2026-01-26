const { app, Tray, Menu, nativeImage, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

// Health check server port - frontend uses this to detect if agent is running
const HEALTH_CHECK_PORT = 19876;
let healthCheckServer = null;

// Core module system
const moduleManager = require('./core/module-manager');
const jobRouter = require('./core/job-router');
const eventBus = require('./core/event-bus');

// Services
const authService = require('./services/auth.service');
const pollingService = require('./services/polling.service');
const queueService = require('./services/queue.service');
const deepLinkService = require('./services/deeplink.service');

// Utilities
const NotificationHelper = require('./utils/notification.helper');
const ProtocolRegistrationHelper = require('./utils/protocol-registration.helper');
const InstanceLockHelper = require('./utils/instance-lock.helper');

let tray = null;
let settingsWindow = null;
let agentStatus = {
  registered: false,
  polling: false,
  lastPoll: null,
  stats: {},
  modules: []
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
// Check for stale locks from crashed instances
const staleLockCleaned = InstanceLockHelper.checkAndCleanStaleLock();
if (staleLockCleaned) {
  console.log('[APP] Cleaned up stale lock from previous crashed instance');
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('[APP] Another instance is already running.');

  // Save deep link for the running instance to pick up
  const deeplinkUrl = process.argv.find(arg => arg.startsWith('bytephase://'));
  if (deeplinkUrl) {
    InstanceLockHelper.saveDeepLinkForLater(deeplinkUrl);
    console.log('[APP] Saved deep link for running instance to process');
  }

  app.quit();
} else {
  // Start heartbeat to indicate we're alive (for stale lock detection)
  InstanceLockHelper.startHeartbeat();
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
  console.log('[APP] BytePhase Agent v2.0 - Modular Architecture');
  console.log('[APP] Application started');

  // Ensure protocol handler is registered (especially important for Linux)
  const protocolResult = await ProtocolRegistrationHelper.ensureProtocolRegistered();
  if (protocolResult.success) {
    console.log('[APP] Protocol registration:', protocolResult.message);
  } else {
    console.warn('[APP] Protocol registration warning:', protocolResult.message);
  }

  // Initialize module system
  await initializeModules();

  // Initialize queue database
  await queueService.init();

  // Set job router and module manager for polling service
  pollingService.setJobRouter(jobRouter);
  pollingService.setModuleManager(moduleManager);

  // Create system tray
  createTray();

  // Check if agent is registered
  agentStatus.registered = authService.isRegistered();

  // Handle deep link on cold start (Windows/Linux)
  let deeplinkUrl = process.argv.find(arg => arg.startsWith('bytephase://'));

  // Also check for pending deep link saved by a previous instance that couldn't acquire lock
  if (!deeplinkUrl) {
    const pendingDeepLink = InstanceLockHelper.getPendingDeepLink();
    if (pendingDeepLink) {
      deeplinkUrl = pendingDeepLink;
      console.log('[APP] Found pending deep link from previous instance');
    }
  }

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

  // On Windows, show settings window on first launch so user knows app is running
  // (since system tray icons can be hidden)
  const isFirstLaunch = !agentStatus.registered;
  if (process.platform === 'win32' && isFirstLaunch) {
    console.log('[APP] Windows first launch - opening settings window');
    setTimeout(() => {
      openSettings();
    }, 1000);
  }

  // Start status update loop
  startStatusUpdates();

  // Start health check server for frontend detection
  startHealthCheckServer();

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
 * Initialize module system
 */
async function initializeModules() {
  console.log('[APP] Initializing module system...');

  try {
    // Load all modules from /modules directory
    await moduleManager.loadAll();

    // Load configuration
    const configPath = path.join(__dirname, 'config', 'agent.config.json');
    let config = {};

    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf8');
      config = JSON.parse(configData);
    }

    // Enable modules based on configuration
    const moduleConfigs = config.modules || {};

    for (const [moduleName, moduleConfig] of Object.entries(moduleConfigs)) {
      if (moduleConfig.enabled) {
        try {
          await moduleManager.enable(moduleName, moduleConfig.config);
          console.log(`[APP] Module enabled: ${moduleName}`);
        } catch (error) {
          console.error(`[APP] Failed to enable module ${moduleName}:`, error.message);
        }
      }
    }

    const counts = moduleManager.getCount();
    console.log(`[APP] Modules initialized: ${counts.enabled}/${counts.total} enabled`);

    // Update agent status with module list
    agentStatus.modules = moduleManager.getAll();

  } catch (error) {
    console.error('[APP] Error initializing modules:', error.message);
  }
}

/**
 * Create system tray icon and menu
 */
function createTray() {
  // Use platform-specific icon
  const isWindows = process.platform === 'win32';
  const iconName = isWindows ? 'icon.ico' : 'icon.png';
  const iconPath = path.join(__dirname, 'assets', iconName);

  console.log('[TRAY] Loading icon from:', iconPath);

  let trayIcon;

  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) {
      console.warn('[TRAY] Icon not found or empty, using fallback');
      // Try fallback to png
      const fallbackPath = path.join(__dirname, 'assets', 'icon.png');
      trayIcon = nativeImage.createFromPath(fallbackPath);
    }
  } catch (error) {
    console.warn('[TRAY] Error loading icon:', error.message);
    trayIcon = null;
  }

  // On Windows, we need a valid icon - create a simple one if needed
  if (!trayIcon || trayIcon.isEmpty()) {
    console.warn('[TRAY] Creating empty tray icon');
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('BytePhase Agent v2.0');

  // On Windows, double-click tray icon to open settings
  if (isWindows) {
    tray.on('double-click', () => {
      openSettings();
    });
  }

  updateTrayMenu();

  console.log('[TRAY] System tray created successfully');
}

/**
 * Update tray menu with current status
 */
function updateTrayMenu() {
  const registered = authService.isRegistered();
  const agentInfo = registered ? authService.getAgentInfo() : {};
  const stats = pollingService.getStats();
  const queueStats = queueService.getStats();
  const moduleCounts = moduleManager.getCount();

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'BytePhase Agent v2.0',
      enabled: false,
      icon: nativeImage.createEmpty()
    },
    { type: 'separator' },
    {
      label: registered ? `✓ Registered (${agentInfo.shopId})` : '✗ Not Registered',
      enabled: false
    },
    {
      label: `Modules: ${moduleCounts.enabled}/${moduleCounts.total} active`,
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
      label: 'Modules',
      click: () => openSettings('modules')
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
      click: async () => {
        pollingService.stop();

        // Disable all modules
        for (const moduleName of moduleManager.getEnabled()) {
          await moduleManager.disable(moduleName);
        }

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
function openSettings(tab = 'setup') {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 700,
    height: 800,
    title: 'BytePhase Agent - Settings',
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  settingsWindow.loadFile(path.join(__dirname, 'ui', 'settings.html'));

  // Send initial tab when ready
  settingsWindow.webContents.on('did-finish-load', () => {
    settingsWindow.webContents.send('set-tab', tab);
  });

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
      // Check if this is a directory scan request
      if (result.type === 'scan') {
        // Open dedicated scan window
        console.log('[APP] Opening directory scan window...');
        openDirectoryScanWindow(result.scanData);
        return;
      }

      // Regular connection flow
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
        openSettings('setup');
      }, 2000); // Delay to allow notification to show
    }

  } catch (error) {
    console.error('[APP] Error handling deep link:', error);
    NotificationHelper.showConnectionError(error.message);
    setTimeout(() => {
      openSettings('setup');
    }, 2000);
  }
}

/**
 * Open directory scan window
 */
function openDirectoryScanWindow(scanData) {
  const scanWindow = new BrowserWindow({
    width: 700,
    height: 800,
    title: 'Directory Scan - BytePhase Agent',
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  scanWindow.loadFile(path.join(__dirname, 'ui', 'directory-scan.html'));

  // Send job info to the window when ready
  scanWindow.webContents.on('did-finish-load', () => {
    console.log('[APP] Scan window loaded, sending data:', scanData);
    scanWindow.webContents.send('init-scan', scanData);
  });

  scanWindow.on('closed', () => {
    console.log('[APP] Scan window closed');
  });
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
 * Start health check HTTP server
 * This allows the web frontend to detect if the agent is installed and running
 */
function startHealthCheckServer() {
  try {
    healthCheckServer = http.createServer((req, res) => {
      // Enable CORS for frontend access
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.url === '/health' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'ok',
          agent: 'BytePhase Agent',
          version: '2.0.0',
          registered: agentStatus.registered,
          polling: agentStatus.polling,
          timestamp: new Date().toISOString()
        }));
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    healthCheckServer.listen(HEALTH_CHECK_PORT, '127.0.0.1', () => {
      console.log(`[APP] Health check server running on http://127.0.0.1:${HEALTH_CHECK_PORT}`);
    });

    healthCheckServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[APP] Health check port ${HEALTH_CHECK_PORT} already in use (another instance may be running)`);
      } else {
        console.error('[APP] Health check server error:', err.message);
      }
    });
  } catch (error) {
    console.error('[APP] Failed to start health check server:', error.message);
  }
}

/**
 * Start periodic status updates
 */
function startStatusUpdates() {
  setInterval(async () => {
    // Get polling stats
    agentStatus.stats = pollingService.getStats();
    agentStatus.lastPoll = agentStatus.stats.lastPollTime;

    // Get module statuses
    agentStatus.modules = moduleManager.getAll();

    // Update tray menu
    updateTrayMenu();
  }, 5000); // Update every 5 seconds
}

/**
 * IPC Handlers for settings window
 */

// Get agent info
ipcMain.handle('get-agent-info', () => {
  return {
    registered: authService.isRegistered(),
    agentInfo: authService.getAgentInfo(),
    stats: pollingService.getStats(),
    queueStats: queueService.getStats(),
    modules: moduleManager.getAll(),
    moduleStats: moduleManager.getCount(),
    jobStats: jobRouter.getStats()
  };
});

// Quick setup with API key
ipcMain.handle('connect-with-api-key', async (event, apiKey) => {
  try {
    console.log('[APP] Verifying API key...');

    // Verify API key and fetch configuration
    const result = await authService.verifyAndConfigureWithApiKey(apiKey);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    console.log('[APP] API key verified, configuring agent...');

    // Save credentials
    await authService.setCredentials({
      apiKey: apiKey,
      agentId: result.agentId,
      shopId: result.shopId,
      cloudUrl: result.cloudUrl
    });

    // Configure modules if provided
    if (result.modules && Object.keys(result.modules).length > 0) {
      console.log('[APP] Configuring modules from cloud...');

      const configPath = path.join(__dirname, 'config', 'agent.config.json');
      let config = {};

      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      }

      // Merge cloud module configs
      config.modules = config.modules || {};
      for (const [moduleName, moduleConfig] of Object.entries(result.modules)) {
        config.modules[moduleName] = {
          ...config.modules[moduleName],
          ...moduleConfig
        };
      }

      // Save updated config
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

      // Apply module configuration
      for (const [moduleName, moduleConfig] of Object.entries(result.modules)) {
        if (moduleConfig.enabled) {
          try {
            await moduleManager.enable(moduleName, moduleConfig.config || {});
            console.log(`[APP] Module enabled: ${moduleName}`);
          } catch (error) {
            console.warn(`[APP] Could not enable module ${moduleName}:`, error.message);
          }
        } else {
          try {
            await moduleManager.disable(moduleName);
            console.log(`[APP] Module disabled: ${moduleName}`);
          } catch (error) {
            // Module might not be enabled, ignore
          }
        }
      }
    }

    // Start polling if not already running
    if (!agentStatus.polling) {
      await pollingService.start();
      agentStatus.polling = true;
    }

    agentStatus.registered = true;
    agentStatus.modules = moduleManager.getAll();
    updateTrayMenu();

    console.log('[APP] Agent configured and connected successfully');

    return { success: true };
  } catch (error) {
    console.error('[APP] Error connecting with API key:', error);
    return { success: false, error: error.message };
  }
});

// Save credentials
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

// Clear credentials
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

// Test Tally connection (via module)
ipcMain.handle('test-tally-connection', async () => {
  try {
    const tallyModule = moduleManager.getModule('tally');

    if (!tallyModule || !tallyModule.enabled) {
      return { success: false, error: 'Tally module not enabled' };
    }

    const health = await tallyModule.healthCheck();

    if (!health.healthy) {
      return { success: false, error: health.message };
    }

    return {
      success: true,
      version: health.details?.version,
      company: health.details?.company
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get all logs
ipcMain.handle('get-logs', () => {
  return logBuffer;
});

// Get all modules
ipcMain.handle('get-modules', () => {
  return {
    modules: moduleManager.getAll(),
    counts: moduleManager.getCount()
  };
});

// Enable module
ipcMain.handle('enable-module', async (event, moduleName, config) => {
  try {
    await moduleManager.enable(moduleName, config);
    agentStatus.modules = moduleManager.getAll();
    updateTrayMenu();

    return { success: true };
  } catch (error) {
    console.error(`[APP] Error enabling module ${moduleName}:`, error);
    return { success: false, error: error.message };
  }
});

// Disable module
ipcMain.handle('disable-module', async (event, moduleName) => {
  try {
    await moduleManager.disable(moduleName);
    agentStatus.modules = moduleManager.getAll();
    updateTrayMenu();

    return { success: true };
  } catch (error) {
    console.error(`[APP] Error disabling module ${moduleName}:`, error);
    return { success: false, error: error.message };
  }
});

// Get module health
ipcMain.handle('get-module-health', async () => {
  try {
    const health = await moduleManager.healthCheck();
    return { success: true, health };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Directory scan - select directory
ipcMain.handle('select-scan-directory', async () => {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Select Directory to Scan',
    message: 'Choose the directory containing recovery data',
    buttonLabel: 'Select'
  });

  return {
    canceled: result.canceled,
    path: result.canceled ? null : result.filePaths[0]
  };
});

// Directory scan - notify backend that agent is connected (before scanning starts)
ipcMain.on('notify-agent-connected', async (event, data) => {
  console.log('[APP] ===== NOTIFY AGENT CONNECTED =====');
  console.log('[APP] Data received:', JSON.stringify(data, null, 2));

  if (!data.cloudUrl || !data.jobId) {
    console.error('[APP] Missing required data: cloudUrl or jobId');
    return;
  }

  try {
    const axios = require('axios');
    const url = `${data.cloudUrl}/api/directory-scans/${data.jobId}/progress`;
    console.log('[APP] Sending notification to:', url);

    const response = await axios.post(
      url,
      {
        scan_id: data.scanId || null,
        status: 'agent_connected',
        files_scanned: 0,
        folders_scanned: 0,
        total_size: 0,
        current_path: '',
        percentage: 0
      },
      {
        headers: {
          'X-Agent-API-Key': data.apiKey,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    console.log('[APP] Agent connected notification SUCCESS:', response.status);
  } catch (error) {
    console.error('[APP] Agent connected notification FAILED:', error.message);
    if (error.response) {
      console.error('[APP] Response status:', error.response.status);
      console.error('[APP] Response data:', error.response.data);
    }
  }
});

// Directory scan - start scan
ipcMain.on('start-directory-scan', async (event, scanData) => {
  try {
    console.log('[APP] ===== STARTING DIRECTORY SCAN =====');
    console.log('[APP] Scan data received:', JSON.stringify(scanData, null, 2));

    const scannerModule = moduleManager.getModule('directory-scanner');
    if (!scannerModule) {
      console.error('[APP] Scanner module not loaded!');
      event.sender.send('scan-error', { message: 'Scanner module not loaded' });
      return;
    }

    console.log('[APP] Scanner module loaded, calling scanAndUploadWithProgress...');

    // Execute scan with progress callback
    const result = await scannerModule.scanAndUploadWithProgress(
      scanData,
      // Progress callback
      (progress) => {
        console.log('[APP] Progress callback received:', progress);
        event.sender.send('scan-progress', progress);
      }
    );

    console.log('[APP] Scan result:', JSON.stringify(result, null, 2));

    if (result.success) {
      console.log('[APP] Scan completed successfully, sending scan-complete event');
      event.sender.send('scan-complete', result);
    } else {
      console.error('[APP] Scan failed, sending scan-error event');
      event.sender.send('scan-error', { message: result.error });
    }

  } catch (error) {
    console.error('[APP] Error during scan:', error);
    event.sender.send('scan-error', { message: error.message });
  }
});

// Directory scan - pause scan
ipcMain.on('pause-scan', (event) => {
  try {
    console.log('[APP] Pausing directory scan...');
    const scannerModule = moduleManager.getModule('directory-scanner');
    if (!scannerModule) {
      console.error('[APP] Scanner module not loaded!');
      event.sender.send('scan-error', { message: 'Scanner module not loaded' });
      return;
    }

    const result = scannerModule.pauseScan();
    console.log('[APP] Pause result:', result);
    event.sender.send('scan-paused', result);

  } catch (error) {
    console.error('[APP] Error pausing scan:', error);
    event.sender.send('scan-error', { message: error.message });
  }
});

// Directory scan - resume scan
ipcMain.on('resume-scan', (event) => {
  try {
    console.log('[APP] Resuming directory scan...');
    const scannerModule = moduleManager.getModule('directory-scanner');
    if (!scannerModule) {
      console.error('[APP] Scanner module not loaded!');
      event.sender.send('scan-error', { message: 'Scanner module not loaded' });
      return;
    }

    const result = scannerModule.resumeScan();
    console.log('[APP] Resume result:', result);
    event.sender.send('scan-resumed', result);

  } catch (error) {
    console.error('[APP] Error resuming scan:', error);
    event.sender.send('scan-error', { message: error.message });
  }
});

// Directory scan - cancel scan
ipcMain.on('cancel-scan', (event) => {
  try {
    console.log('[APP] Canceling directory scan...');
    const scannerModule = moduleManager.getModule('directory-scanner');
    if (!scannerModule) {
      console.error('[APP] Scanner module not loaded!');
      event.sender.send('scan-error', { message: 'Scanner module not loaded' });
      return;
    }

    const result = scannerModule.cancelScan({ id: 'cancel' });
    console.log('[APP] Cancel result:', result);
    event.sender.send('scan-cancelled', result);

  } catch (error) {
    console.error('[APP] Error canceling scan:', error);
    event.sender.send('scan-error', { message: error.message });
  }
});

// Prevent app from quitting when all windows are closed
app.on('window-all-closed', (e) => {
  e.preventDefault();
});

// Handle app quit
app.on('before-quit', async () => {
  pollingService.stop();

  // Stop health check server
  if (healthCheckServer) {
    healthCheckServer.close();
    console.log('[APP] Health check server stopped');
  }

  // Stop heartbeat and cleanup lock files
  InstanceLockHelper.stopHeartbeat();

  // Disable all modules gracefully
  for (const moduleName of moduleManager.getEnabled()) {
    try {
      await moduleManager.disable(moduleName);
    } catch (error) {
      console.error(`[APP] Error disabling module ${moduleName}:`, error);
    }
  }

  queueService.close();
});
