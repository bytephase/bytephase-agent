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
let trayPopupWindow = null;
let partnerConnectWindow = null;

// Window icon for Windows/Linux (macOS uses app icon automatically)
function getWindowIcon() {
  if (process.platform === 'win32') return path.join(__dirname, 'assets', 'icon.ico');
  if (process.platform === 'linux') return path.join(__dirname, 'assets', 'icon.png');
  return undefined;
}
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

  // Set dock icon on macOS (dev mode shows Electron icon otherwise)
  if (process.platform === 'darwin' && app.dock) {
    const dockIcon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'));
    if (!dockIcon.isEmpty()) {
      app.dock.setIcon(dockIcon);
    }
  }

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
  // Use platform-specific tray icons (properly sized for each OS)
  let iconPath;

  if (process.platform === 'darwin') {
    // macOS: Template images auto-handle dark/light mode (must be monochrome)
    // Electron picks up @2x variant automatically for retina displays
    iconPath = path.join(__dirname, 'assets', 'tray', 'trayTemplate.png');
  } else if (process.platform === 'win32') {
    iconPath = path.join(__dirname, 'assets', 'tray', 'tray-icon.ico');
  } else {
    iconPath = path.join(__dirname, 'assets', 'tray', 'tray-icon.png');
  }

  console.log('[TRAY] Loading icon from:', iconPath);

  let trayIcon;

  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) {
      console.warn('[TRAY] Tray icon not found, falling back to main icon');
      const fallbackPath = path.join(__dirname, 'assets', 'icon.png');
      trayIcon = nativeImage.createFromPath(fallbackPath);
      // Resize fallback to proper tray size
      if (!trayIcon.isEmpty()) {
        trayIcon = trayIcon.resize({ width: 22, height: 22 });
      }
    }
  } catch (error) {
    console.warn('[TRAY] Error loading icon:', error.message);
    trayIcon = null;
  }

  if (!trayIcon || trayIcon.isEmpty()) {
    console.warn('[TRAY] Creating empty tray icon');
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('BytePhase Agent v2.0');

  // Single click opens custom popup on all platforms
  tray.on('click', (event, bounds) => {
    toggleTrayPopup(bounds);
  });

  // On Windows, double-click tray icon to open settings
  if (process.platform === 'win32') {
    tray.on('double-click', () => {
      openSettings();
    });
  }

  // Right-click shows minimal native menu (quit only)
  const rightClickMenu = Menu.buildFromTemplate([
    { label: 'Open Settings', click: () => openSettings() },
    { type: 'separator' },
    {
      label: 'Quit', click: async () => {
        pollingService.stop();
        for (const moduleName of moduleManager.getEnabled()) {
          await moduleManager.disable(moduleName);
        }
        queueService.close();
        app.quit();
      }
    }
  ]);
  tray.on('right-click', () => {
    tray.popUpContextMenu(rightClickMenu);
  });

  updateTrayStatus();

  console.log('[TRAY] System tray created successfully');
}

/**
 * Toggle tray popup window
 */
function toggleTrayPopup(bounds) {
  if (trayPopupWindow && !trayPopupWindow.isDestroyed()) {
    trayPopupWindow.close();
    trayPopupWindow = null;
    return;
  }
  createTrayPopup(bounds);
}

/**
 * Create custom tray popup window positioned near the tray icon
 */
function createTrayPopup(bounds) {
  const popupWidth = 340;
  const popupHeight = 440;

  let x, y;
  if (process.platform === 'darwin') {
    // macOS: center below the tray icon
    x = Math.round(bounds.x + bounds.width / 2 - popupWidth / 2);
    y = Math.round(bounds.y + bounds.height + 4);
  } else {
    // Windows/Linux: position above the tray icon (taskbar at bottom)
    x = Math.round(bounds.x + bounds.width / 2 - popupWidth / 2);
    y = Math.round(bounds.y - popupHeight - 4);
  }

  trayPopupWindow = new BrowserWindow({
    width: popupWidth,
    height: popupHeight,
    x: x,
    y: y,
    frame: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    transparent: true,
    hasShadow: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  trayPopupWindow.loadFile(path.join(__dirname, 'ui', 'tray-popup.html'));

  trayPopupWindow.once('ready-to-show', () => {
    trayPopupWindow.show();
  });

  // Close on blur (clicking outside the popup)
  trayPopupWindow.on('blur', () => {
    if (trayPopupWindow && !trayPopupWindow.isDestroyed()) {
      trayPopupWindow.close();
      trayPopupWindow = null;
    }
  });

  trayPopupWindow.on('closed', () => {
    trayPopupWindow = null;
  });
}

/**
 * Update tray tooltip and push status to popup if open
 */
function updateTrayStatus() {
  if (!tray) return;

  const registered = authService.isRegistered();
  const stats = pollingService.getStats();

  // Update tooltip with current status
  const status = registered
    ? `BytePhase Agent v2.0 - ${agentStatus.polling ? 'Polling' : 'Idle'} (${stats.jobsProcessed || 0} jobs)`
    : 'BytePhase Agent v2.0 - Not Registered';
  tray.setToolTip(status);

  // Push updated data to tray popup if it's open
  if (trayPopupWindow && !trayPopupWindow.isDestroyed()) {
    trayPopupWindow.webContents.send('status-update', {
      stats,
      registered,
      polling: agentStatus.polling
    });
  }
}

/**
 * Open settings window
 */
function openSettings(page = 'tally-integration') {
  if (settingsWindow) {
    settingsWindow.focus();
    settingsWindow.webContents.send('navigate-to', page);
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 800,
    minHeight: 550,
    title: 'BytePhase Agent - Settings',
    resizable: true,
    backgroundColor: '#0f0f1a',
    icon: getWindowIcon(),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  settingsWindow.loadFile(path.join(__dirname, 'ui', 'settings-v2.html'));

  settingsWindow.webContents.on('did-finish-load', () => {
    settingsWindow.webContents.send('navigate-to', page);
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
    // Parse the deep link first to determine action
    const parsed = deepLinkService.parseDeepLink(url);

    if (!parsed.success) {
      NotificationHelper.showConnectionError(parsed.error);
      return;
    }

    // Directory scan — process immediately
    if (parsed.action === 'scan-directory') {
      const result = await deepLinkService.handleScanDirectory(parsed.params.token);
      if (result.success) {
        console.log('[APP] Opening directory scan window...');
        openDirectoryScanWindow(result.scanData);
      } else {
        NotificationHelper.showConnectionError(result.error);
      }
      return;
    }

    // Partner connect — show approval window
    if (parsed.action === 'partner-connect' || parsed.action === 'connect') {
      const tokenService = require('./services/token.service');
      const validation = tokenService.validateToken(parsed.params.token);

      if (!validation.success) {
        NotificationHelper.showConnectionError(validation.error);
        return;
      }

      // Show partner connection approval window
      openPartnerConnectWindow({
        token: parsed.params.token,
        partnerName: (validation.payload.metadata && validation.payload.metadata.partner_name) || 'BytePhase Partner Platform',
        partnerUrl: (validation.payload.metadata && validation.payload.metadata.partner_url) || 'partner.bytephase.com',
        shopName: (validation.payload.metadata && validation.payload.metadata.shop_name) || 'Unknown Shop'
      });
      return;
    }

    // Fallback: process as generic deep link
    const result = await deepLinkService.processDeepLink(url);
    if (result.success) {
      NotificationHelper.showConnectionSuccess(result.shopId);
      if (!agentStatus.polling) {
        await pollingService.start();
        agentStatus.polling = true;
      }
      agentStatus.registered = true;
      updateTrayStatus();
    } else {
      NotificationHelper.showConnectionError(result.error);
      setTimeout(() => openSettings('overview'), 2000);
    }

  } catch (error) {
    console.error('[APP] Error handling deep link:', error);
    NotificationHelper.showConnectionError(error.message);
    setTimeout(() => openSettings('overview'), 2000);
  }
}

/**
 * Open partner connection approval window
 */
function openPartnerConnectWindow(connectData) {
  if (partnerConnectWindow) {
    partnerConnectWindow.focus();
    return;
  }

  partnerConnectWindow = new BrowserWindow({
    width: 480,
    height: 560,
    resizable: false,
    center: true,
    backgroundColor: '#0f0f1a',
    title: 'Partner Connection - BytePhase Agent',
    icon: getWindowIcon(),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  partnerConnectWindow.loadFile(path.join(__dirname, 'ui', 'partner-connect.html'));

  partnerConnectWindow.webContents.on('did-finish-load', () => {
    partnerConnectWindow.webContents.send('init-connect', connectData);
  });

  partnerConnectWindow.on('closed', () => {
    partnerConnectWindow = null;
  });
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
    icon: getWindowIcon(),
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
  updateTrayStatus();
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

    // Update tray tooltip and popup
    updateTrayStatus();

    // Push status to settings window if open
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('status-update', {
        stats: agentStatus.stats,
        modules: agentStatus.modules,
        registered: agentStatus.registered,
        polling: agentStatus.polling
      });
    }
  }, 5000); // Update every 5 seconds
}

/**
 * IPC Handlers for tray popup
 */

// Get tray popup data (aggregates multiple sources)
ipcMain.handle('get-tray-popup-data', async () => {
  const registered = authService.isRegistered();
  const agentInfo = registered ? authService.getAgentInfo() : {};
  const stats = pollingService.getStats();
  const moduleCounts = moduleManager.getCount();

  // Tally connection status
  let tallyStatus = { connected: false, version: null, company: null };
  const tallyModule = moduleManager.getModule('tally');
  if (tallyModule && tallyModule.enabled) {
    try {
      const health = await tallyModule.healthCheck();
      tallyStatus = {
        connected: health.healthy,
        version: health.details ? health.details.version : null,
        company: health.details ? health.details.company : null
      };
    } catch (e) { /* leave defaults */ }
  }

  // Directory Scanner status
  const scannerModule = moduleManager.getModule('directory-scanner');
  const scannerActive = scannerModule && scannerModule.enabled;

  // Tally sync stats (from module if available)
  let tallySyncStats = { lastSyncTime: null, totalItemsSynced: 0 };
  if (tallyModule && tallyModule.syncStats) {
    tallySyncStats = tallyModule.syncStats;
  }

  return {
    registered,
    agentInfo,
    stats,
    moduleCounts,
    tallyStatus,
    tallySyncStats,
    scannerActive,
    version: app.getVersion()
  };
});

// Open settings from tray popup
ipcMain.on('open-settings-from-tray', (event, page) => {
  openSettings(page || 'tally-integration');
  if (trayPopupWindow && !trayPopupWindow.isDestroyed()) {
    trayPopupWindow.close();
    trayPopupWindow = null;
  }
});

// Trigger immediate Tally sync from tray popup
ipcMain.handle('trigger-tally-sync', async () => {
  try {
    if (pollingService.isRunning) {
      await pollingService.poll();
      return { success: true };
    }
    return { success: false, error: 'Polling not running' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

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

// Open logs folder
ipcMain.handle('open-logs-folder', () => {
  const logsPath = path.join(app.getPath('userData'), 'logs');
  // Ensure logs directory exists
  if (!fs.existsSync(logsPath)) {
    fs.mkdirSync(logsPath, { recursive: true });
  }
  require('electron').shell.openPath(logsPath);
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
    updateTrayStatus();

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
    updateTrayStatus();

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
    updateTrayStatus();

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
    updateTrayStatus();

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
    updateTrayStatus();

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

/**
 * IPC Handlers for partner connection
 */

// Approve partner connection from approval window
ipcMain.handle('approve-partner-connection', async (event, token) => {
  try {
    const result = await deepLinkService.handleConnect(token);

    if (result.success) {
      // Start polling
      if (!agentStatus.polling) {
        await pollingService.start();
        agentStatus.polling = true;
      }
      agentStatus.registered = true;
      updateTrayStatus();

      NotificationHelper.showConnectionSuccess(result.shopId);
      return result;
    }

    return { success: false, error: result.error || 'Connection failed' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Cancel partner connection
ipcMain.on('cancel-partner-connection', () => {
  if (partnerConnectWindow && !partnerConnectWindow.isDestroyed()) {
    partnerConnectWindow.close();
  }
});

/**
 * IPC Handlers for Tally configuration
 */

// Get Tally module config
ipcMain.handle('get-tally-config', () => {
  const tallyModule = moduleManager.getModule('tally');
  if (!tallyModule) {
    return { success: false, error: 'Tally module not found' };
  }
  return { success: true, config: tallyModule.config };
});

// Save Tally module config
ipcMain.handle('save-tally-config', async (event, config) => {
  try {
    const tallyModule = moduleManager.getModule('tally');
    if (!tallyModule) {
      return { success: false, error: 'Tally module not found' };
    }

    // Merge config
    Object.assign(tallyModule.config, config);

    // Update tally service connection params
    if (tallyModule.tallyService) {
      if (config.tallyHost) tallyModule.tallyService.host = config.tallyHost;
      if (config.tallyPort) tallyModule.tallyService.port = config.tallyPort;
      tallyModule.tallyService.baseUrl = `http://${tallyModule.tallyService.host}:${tallyModule.tallyService.port}`;
    }

    // Persist to agent.config.json
    const configPath = path.join(__dirname, 'config', 'agent.config.json');
    const agentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    agentConfig.modules.tally.config = { ...agentConfig.modules.tally.config, ...config };
    fs.writeFileSync(configPath, JSON.stringify(agentConfig, null, 2));

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Detect Tally company name
ipcMain.handle('detect-tally-company', async () => {
  try {
    const tallyModule = moduleManager.getModule('tally');
    if (!tallyModule || !tallyModule.tallyService) {
      return { success: false, error: 'Tally module not available' };
    }

    // Clear cached value to force re-detection
    tallyModule.tallyService.companyName = null;
    const company = await tallyModule.tallyService.getCompanyName();
    return { success: true, company };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get Tally sync stats
ipcMain.handle('get-tally-sync-stats', () => {
  const tallyModule = moduleManager.getModule('tally');
  if (!tallyModule) {
    return { success: false, error: 'Tally module not found' };
  }
  return {
    success: true,
    syncStats: tallyModule.syncStats || { lastSyncTime: null, totalItemsSynced: 0, syncHistory: [] }
  };
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
