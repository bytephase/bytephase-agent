/**
 * Test Script - Directory Scanner Module
 *
 * This script tests the directory scanner functionality step by step:
 * 1. Select a directory
 * 2. Scan the directory
 * 3. Generate HTML snapshot
 * 4. Open in browser
 */

const { app, dialog, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { exec } = require('child_process');

// Import the directory scanner module
const DirectoryScannerModule = require('../modules/directory-scanner');

let scannerModule;
let mainWindow;

async function main() {
  console.log('\n=================================');
  console.log('📁 DIRECTORY SCANNER TEST');
  console.log('=================================\n');

  // Initialize the module
  console.log('Step 1: Initializing directory scanner module...');
  scannerModule = new DirectoryScannerModule();
  await scannerModule.initialize();
  await scannerModule.activate();
  console.log('✅ Module initialized and activated\n');

  // Create a minimal window (required for dialogs)
  console.log('Step 2: Creating window for dialogs...');
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false, // Hidden window
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  console.log('✅ Window created\n');

  // Step 1: Select Directory
  console.log('=================================');
  console.log('STEP 1: SELECT DIRECTORY');
  console.log('=================================');
  console.log('A folder picker dialog will open...');
  console.log('Please select a directory to scan.\n');

  const selectResult = await scannerModule.selectDirectory({
    type: 'scanner.directory.select',
    payload: {
      title: 'Select Directory to Scan',
      message: 'Choose a directory to create a snapshot',
      buttonLabel: 'Select & Scan'
    }
  });

  if (selectResult.canceled) {
    console.log('❌ Selection canceled. Exiting...');
    app.quit();
    return;
  }

  console.log('✅ Directory selected:');
  console.log(`   Path: ${selectResult.path}`);
  console.log(`   Name: ${selectResult.name}`);
  console.log(`   Created: ${selectResult.created}`);
  console.log(`   Modified: ${selectResult.modified}`);
  console.log('');

  // Wait for user confirmation
  console.log('=================================');
  console.log('STEP 2: SCAN DIRECTORY');
  console.log('=================================');
  console.log(`Ready to scan: ${selectResult.path}`);
  console.log('This will recursively scan all files and folders.');
  console.log('');
  console.log('⏳ Starting scan...\n');

  // Step 2: Scan Directory
  const scanStart = Date.now();
  const scanResult = await scannerModule.scanDirectory({
    type: 'scanner.directory.scan',
    id: 'test-scan-001',
    payload: {
      directoryPath: selectResult.path,
      options: {
        maxDepth: 10,
        includeHidden: false,
        calculateHashes: false
      }
    }
  });

  const scanDuration = ((Date.now() - scanStart) / 1000).toFixed(2);

  console.log('✅ Scan completed!');
  console.log('\n📊 SCAN STATISTICS:');
  console.log('─────────────────────────────────');
  console.log(`   Total Files:    ${scanResult.statistics.totalFiles.toLocaleString()}`);
  console.log(`   Total Folders:  ${scanResult.statistics.totalFolders.toLocaleString()}`);
  console.log(`   Total Size:     ${scanResult.statistics.totalSizeFormatted}`);
  console.log(`   Max Depth:      ${scanResult.statistics.scannedDepth}`);
  console.log(`   Errors:         ${scanResult.statistics.errors}`);
  console.log(`   Skipped:        ${scanResult.statistics.skipped}`);
  console.log(`   Duration:       ${scanDuration}s`);
  console.log('─────────────────────────────────\n');

  // Step 3: Generate HTML
  console.log('=================================');
  console.log('STEP 3: GENERATE HTML SNAPSHOT');
  console.log('=================================');
  console.log('Generating interactive HTML file...\n');

  const outputPath = path.join(
    app.getPath('desktop'),
    `directory-snapshot-${Date.now()}.html`
  );

  const htmlResult = await scannerModule.exportToHtml({
    type: 'scanner.export.html',
    payload: {
      tree: scanResult.tree,
      outputPath: outputPath,
      title: `Directory Snapshot - ${selectResult.name}`
    }
  });

  console.log('✅ HTML generated!');
  console.log(`   File: ${htmlResult.htmlPath}`);
  console.log(`   Size: ${(htmlResult.size / 1024).toFixed(2)} KB`);
  console.log('');

  // Step 4: Generate DevExtreme Format
  console.log('=================================');
  console.log('STEP 4: GENERATE DEVEXTREME FORMAT');
  console.log('=================================');
  console.log('Generating DevExtreme FileManager compatible format...\n');

  const devextremeOutputPath = path.join(
    app.getPath('desktop'),
    `directory-devextreme-${Date.now()}.json`
  );

  const devextremeResult = await scannerModule.exportToDevExtreme({
    type: 'scanner.export.devextreme',
    payload: {
      tree: scanResult.tree,
      outputPath: devextremeOutputPath,
      format: 'hierarchical', // Can be 'hierarchical', 'flat', or 'datasource'
      includeRoot: false,
      pretty: true
    }
  });

  console.log('✅ DevExtreme format generated!');
  console.log(`   File: ${devextremeResult.outputPath}`);
  console.log(`   Size: ${(devextremeResult.size / 1024).toFixed(2)} KB`);
  console.log(`   Format: ${devextremeResult.formatType}`);
  console.log(`   Total Files: ${devextremeResult.statistics.totalFiles.toLocaleString()}`);
  console.log(`   Total Folders: ${devextremeResult.statistics.totalFolders.toLocaleString()}`);
  console.log('');
  console.log('💡 You can now use this JSON in your Angular app with DevExtreme FileManager!');
  console.log('');

  // Step 5: Open in Browser
  console.log('=================================');
  console.log('STEP 5: OPEN HTML IN BROWSER');
  console.log('=================================');
  console.log('Opening HTML file in default browser...\n');

  // Open in default browser
  const openCommand = process.platform === 'darwin'
    ? `open "${htmlResult.htmlPath}"`
    : process.platform === 'win32'
    ? `start "" "${htmlResult.htmlPath}"`
    : `xdg-open "${htmlResult.htmlPath}"`;

  exec(openCommand, (error) => {
    if (error) {
      console.error('❌ Error opening browser:', error.message);
    } else {
      console.log('✅ HTML opened in browser!');
    }

    console.log('\n=================================');
    console.log('✨ TEST COMPLETED SUCCESSFULLY!');
    console.log('=================================');
    console.log('\nThe HTML file has been saved to your Desktop.');
    console.log('You can now:');
    console.log('  - Search files and folders');
    console.log('  - Click folders to expand/collapse');
    console.log('  - View file sizes and dates');
    console.log('  - See file type badges\n');

    // Wait a bit before closing
    setTimeout(() => {
      console.log('Closing test script...');
      app.quit();
    }, 2000);
  });
}

// Electron app lifecycle
app.whenReady().then(() => {
  main().catch(error => {
    console.error('\n❌ TEST FAILED:');
    console.error(error);
    app.quit();
  });
});

app.on('window-all-closed', () => {
  // Keep the app running even if windows close
});
