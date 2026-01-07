const { app, Tray, Menu, nativeImage, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

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
  console.log('[APP] BytePhase Agent v2.0 - Modular Architecture');
  console.log('[APP] Application started');

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

  // Auto-open settings for testing (remove in production)
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
  tray.setToolTip('BytePhase Agent v2.0');

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

// Prevent app from quitting when all windows are closed
app.on('window-all-closed', (e) => {
  e.preventDefault();
});

// Handle app quit
app.on('before-quit', async () => {
  pollingService.stop();

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
