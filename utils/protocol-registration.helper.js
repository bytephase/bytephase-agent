const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

/**
 * Protocol Registration Helper
 * Handles custom protocol (bytephase://) registration across different platforms
 */
class ProtocolRegistrationHelper {
  constructor() {
    this.protocolName = 'bytephase';
    this.appName = 'BytePhase Agent';
    this.desktopFileName = 'bytephase-agent.desktop';
  }

  /**
   * Check and register protocol handler based on platform
   * Called on app startup
   */
  async ensureProtocolRegistered() {
    const platform = process.platform;
    console.log(`[PROTOCOL] Checking protocol registration on ${platform}...`);

    switch (platform) {
      case 'linux':
        return await this.registerLinuxProtocol();
      case 'win32':
        return this.checkWindowsProtocol();
      case 'darwin':
        // macOS handles this via Info.plist in the app bundle
        return { success: true, message: 'macOS protocol handled by app bundle' };
      default:
        return { success: false, message: `Unsupported platform: ${platform}` };
    }
  }

  /**
   * Register protocol handler on Linux
   * Creates .desktop file and registers with xdg-mime
   */
  async registerLinuxProtocol() {
    try {
      const homeDir = process.env.HOME || process.env.USERPROFILE;
      const applicationsDir = path.join(homeDir, '.local', 'share', 'applications');
      const desktopFilePath = path.join(applicationsDir, this.desktopFileName);

      // Ensure applications directory exists
      if (!fs.existsSync(applicationsDir)) {
        fs.mkdirSync(applicationsDir, { recursive: true });
        console.log('[PROTOCOL] Created applications directory:', applicationsDir);
      }

      // Get the executable path
      const execPath = process.execPath;
      const isAppImage = execPath.toLowerCase().includes('appimage');

      // For AppImage, use the APPIMAGE env var or the current executable
      const appImagePath = process.env.APPIMAGE || execPath;

      // Create .desktop file content
      const desktopContent = `[Desktop Entry]
Name=${this.appName}
Comment=BytePhase Desktop Agent for Tally Integration and Directory Scanning
Exec="${appImagePath}" %u
Icon=bytephase-agent
Type=Application
Terminal=false
Categories=Utility;
MimeType=x-scheme-handler/${this.protocolName};
StartupNotify=true
StartupWMClass=bytephase-agent
`;

      // Check if .desktop file already exists and has correct content
      let needsUpdate = true;
      if (fs.existsSync(desktopFilePath)) {
        const existingContent = fs.readFileSync(desktopFilePath, 'utf8');
        if (existingContent.includes(`MimeType=x-scheme-handler/${this.protocolName}`)) {
          // Check if the Exec path is still correct
          if (existingContent.includes(appImagePath)) {
            console.log('[PROTOCOL] Desktop file already exists and is up to date');
            needsUpdate = false;
          } else {
            console.log('[PROTOCOL] Desktop file exists but executable path changed, updating...');
          }
        }
      }

      if (needsUpdate) {
        // Write .desktop file
        fs.writeFileSync(desktopFilePath, desktopContent, 'utf8');
        fs.chmodSync(desktopFilePath, '755');
        console.log('[PROTOCOL] Created/updated .desktop file:', desktopFilePath);

        // Register with xdg-mime
        await this.runCommand(`xdg-mime default ${this.desktopFileName} x-scheme-handler/${this.protocolName}`);
        console.log('[PROTOCOL] Registered protocol with xdg-mime');

        // Update desktop database
        await this.runCommand('update-desktop-database ~/.local/share/applications/ 2>/dev/null || true');
        console.log('[PROTOCOL] Updated desktop database');
      }

      // Verify registration
      const isRegistered = await this.verifyLinuxRegistration();

      return {
        success: isRegistered,
        message: isRegistered
          ? 'Protocol successfully registered on Linux'
          : 'Protocol registration may require a session restart',
        desktopFilePath,
        isAppImage
      };

    } catch (error) {
      console.error('[PROTOCOL] Linux registration error:', error);
      return {
        success: false,
        message: `Failed to register protocol: ${error.message}`,
        error
      };
    }
  }

  /**
   * Verify Linux protocol registration
   */
  async verifyLinuxRegistration() {
    try {
      const result = await this.runCommand(`xdg-mime query default x-scheme-handler/${this.protocolName}`);
      const isRegistered = result.trim().includes(this.desktopFileName);
      console.log('[PROTOCOL] Linux verification:', isRegistered ? 'registered' : 'not registered');
      return isRegistered;
    } catch (error) {
      console.warn('[PROTOCOL] Could not verify Linux registration:', error.message);
      return false;
    }
  }

  /**
   * Check Windows protocol registration
   * On Windows, Electron's setAsDefaultProtocolClient should handle this,
   * but we verify and provide guidance if it fails
   */
  checkWindowsProtocol() {
    try {
      // Check if we're the default handler
      const isDefault = app.isDefaultProtocolClient(this.protocolName);

      if (!isDefault) {
        // Try to register
        const registered = app.setAsDefaultProtocolClient(this.protocolName);
        if (!registered) {
          console.warn('[PROTOCOL] Windows: Failed to set as default protocol client');
          return {
            success: false,
            message: 'Could not register protocol. Try running as administrator or reinstalling the app.',
            requiresAdmin: true
          };
        }
      }

      console.log('[PROTOCOL] Windows protocol registered successfully');
      return {
        success: true,
        message: 'Protocol registered on Windows'
      };

    } catch (error) {
      console.error('[PROTOCOL] Windows registration error:', error);
      return {
        success: false,
        message: `Windows protocol registration failed: ${error.message}`,
        error
      };
    }
  }

  /**
   * Get platform-specific troubleshooting instructions
   */
  getTroubleshootingInstructions() {
    const platform = process.platform;

    switch (platform) {
      case 'linux':
        return {
          platform: 'Linux',
          steps: [
            '1. Ensure BytePhase Agent is installed and running',
            '2. The agent should auto-register, but if not, run these commands:',
            `   xdg-mime default ${this.desktopFileName} x-scheme-handler/${this.protocolName}`,
            '   update-desktop-database ~/.local/share/applications/',
            '3. You may need to log out and log back in for changes to take effect',
            '4. If using Flatpak/Snap browser, protocol handlers may be restricted'
          ],
          desktopFileLocation: `~/.local/share/applications/${this.desktopFileName}`
        };

      case 'win32':
        return {
          platform: 'Windows',
          steps: [
            '1. Ensure BytePhase Agent is installed (not just running as portable)',
            '2. Run the installer again if the agent doesn\'t open',
            '3. Check if Windows Defender or antivirus is blocking the app',
            '4. Try running BytePhase Agent as Administrator once',
            '5. Check Windows Settings > Apps > Default Apps > Choose defaults by protocol'
          ]
        };

      case 'darwin':
        return {
          platform: 'macOS',
          steps: [
            '1. Ensure BytePhase Agent.app is in /Applications',
            '2. Open the app at least once to register handlers',
            '3. If Gatekeeper blocks, go to System Preferences > Security & Privacy',
            '4. Check if another app has claimed the bytephase:// protocol'
          ]
        };

      default:
        return {
          platform: 'Unknown',
          steps: ['Platform not supported. Please contact support.']
        };
    }
  }

  /**
   * Run a shell command and return output
   */
  runCommand(command) {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve(stdout);
        }
      });
    });
  }
}

module.exports = new ProtocolRegistrationHelper();
