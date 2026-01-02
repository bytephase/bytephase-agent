# BytePhase Agent - Customer Installation Guide

**Simple guide for installing BytePhase Agent on your computer**

---

## 📋 What is BytePhase Agent?

BytePhase Agent is a desktop application that connects your Tally software to BytePhase cloud services. It runs in the background and automatically syncs data between Tally and your cloud applications.

---

## 💻 System Requirements

- **Operating System:** Windows 10/11, macOS 10.13+, or Linux
- **Tally Software:** ERP 9, Prime, or Prime Server
- **Internet Connection:** Required for cloud sync
- **Disk Space:** 200 MB free space

---

## 📦 Installation Methods

### Method 1: Using Installer (Recommended)

**For Windows:**
1. Download `BytePhase-Agent-Setup.exe`
2. Double-click the installer
3. Follow the installation wizard
4. Click "Finish" when done
5. BytePhase Agent will start automatically

**For macOS:**
1. Download `BytePhase-Agent.dmg`
2. Open the DMG file
3. Drag "BytePhase Agent" to Applications folder
4. Open Applications → BytePhase Agent
5. Click "Open" if security warning appears

**For Linux:**
1. Download `BytePhase-Agent.AppImage`
2. Make it executable: `chmod +x BytePhase-Agent.AppImage`
3. Run: `./BytePhase-Agent.AppImage`

---

### Method 2: From Source Code (Advanced)

**Prerequisites:**
- Node.js 16+ installed
- npm package manager

**Steps:**

1. **Download the code:**
   ```bash
   git clone https://github.com/bytephase/bytephase-agent.git
   cd bytephase-agent
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the agent:**
   ```bash
   npm start
   ```

---

## ⚙️ First-Time Setup

### Step 1: Locate the Agent

After installation, BytePhase Agent runs in your system tray:

- **Windows:** Look in the system tray (bottom-right corner)
- **macOS:** Look in the menu bar (top-right corner)
- **Linux:** Look in the system tray

You'll see the BytePhase icon.

### Step 2: Open Settings

1. Click the BytePhase icon in the system tray
2. Select **"Settings"** from the menu
3. Settings window will open

### Step 3: Configure the Agent

Fill in the following information (provided by BytePhase support):

```
Cloud Service URL:  [Your BytePhase server URL]
API Key:           [Your unique API key]
Agent ID:          [Your agent identifier]
Shop ID:           [Your shop/location ID]
```

**Example:**
```
Cloud Service URL:  https://connect.bytephase.com
API Key:           sk_live_abc123xyz789...
Agent ID:          agent_shop_main
Shop ID:           shop_001
```

### Step 4: Save Configuration

1. Click **"Save & Start"** button
2. You'll see a confirmation message
3. Agent will start syncing automatically

---

## 🔧 Enable Tally XML API

For the agent to communicate with Tally, you need to enable XML API:

### In Tally:

1. Open Tally software
2. Go to **Gateway of Tally**
3. Press **F12** (Configure)
4. Select **Advanced Configuration**
5. Select **XML**
6. Set the following:
   - **Allow Remote XML Request:** Yes
   - **Port:** 9000
7. Press **Ctrl+A** to save

### Test Tally Connection:

1. Open BytePhase Agent Settings
2. Click **"Test Tally"** button
3. Should show: "✓ Connected to Tally [version]"

---

## 📊 Monitoring the Agent

### Check Agent Status

**In System Tray Menu:**
- Click BytePhase icon
- View status indicators:
  - ✓ Registered
  - ✓ Tally Running
  - ✓ Polling Active
  - Jobs Processed count

**In Settings Window:**
1. Open Settings
2. Click **"Status"** tab
3. View detailed information:
   - Agent status
   - Tally connection
   - Jobs processed
   - Queue status
   - Last poll time

### View Activity Logs

1. Open Settings
2. Click **"Logs"** tab
3. See real-time activity with color-coded entries:
   - 🔵 Blue: Normal operations
   - 🟡 Yellow: Warnings
   - 🔴 Red: Errors

---

## ✅ Verification Checklist

After installation, verify everything is working:

- [ ] BytePhase Agent icon visible in system tray
- [ ] Settings window opens when clicked
- [ ] Configuration saved successfully
- [ ] Tally XML API enabled (port 9000)
- [ ] Test Tally connection successful
- [ ] Status shows "✓ Registered"
- [ ] Status shows "✓ Tally Running"
- [ ] Status shows "✓ Polling Active"
- [ ] Logs tab shows activity

---

## 🔄 Daily Usage

**The agent runs automatically!** You don't need to do anything.

### What Happens Automatically:

1. **Agent starts** when you log in to your computer
2. **Checks for jobs** from cloud every 30 seconds
3. **Processes jobs** (creates vouchers, fetches reports, etc.)
4. **Reports results** back to cloud
5. **Queues failed jobs** for retry when connection restored

### Manual Controls:

**Stop Polling:**
- Click tray icon → "Stop Polling"

**Start Polling:**
- Click tray icon → "Start Polling"

**View Logs:**
- Click tray icon → "View Logs"

**Change Settings:**
- Click tray icon → "Settings"

---

## 🚨 Troubleshooting

### Issue: Agent Not Starting

**Solution:**
1. Check if already running (look in system tray)
2. Restart your computer
3. Reinstall the agent
4. Contact BytePhase support

### Issue: "Tally Offline" Message

**Solution:**
1. Open Tally software
2. Open a company in Tally
3. Enable XML API (see instructions above)
4. Click "Test Tally" in agent settings

### Issue: "Not Registered" Message

**Solution:**
1. Open Settings
2. Verify all fields are filled correctly
3. Check API Key is correct (copy-paste from email)
4. Click "Save & Start" again
5. Contact support if issue persists

### Issue: Polling Errors in Logs

**Normal Errors (can ignore):**
- `Error 404`: Cloud service being updated
- Connection timeout: Internet temporarily down

**Contact Support if:**
- Errors persist for more than 1 hour
- Jobs not processing
- Data not syncing to cloud

### Issue: Can't Find Tray Icon

**Windows:**
- Click ^ icon in system tray to show hidden icons
- Look for BytePhase logo

**macOS:**
- Look in hidden icons area (top-right)
- Check if icon is very small/light colored

**Linux:**
- May be in overflow menu depending on desktop environment

---

## 📞 Getting Help

### Self-Help Resources:

1. **Quick Start Guide:** See QUICK-START.md
2. **Full Documentation:** See FINAL-DOCUMENTATION.md
3. **Check Logs:** Settings → Logs tab

### Contact BytePhase Support:

**Email:** support@bytephase.com
**Phone:** [Your support number]
**Hours:** Monday-Friday, 9 AM - 6 PM

**What to Include:**
- Agent ID and Shop ID
- Error message (from Logs tab)
- Screenshot of Settings → Status tab
- Tally version you're using

---

## 🔐 Security & Privacy

- ✅ **Encrypted Storage:** All credentials stored securely
- ✅ **Local Processing:** Data processed on your computer
- ✅ **Secure Connection:** HTTPS encryption to cloud
- ✅ **No Data Collection:** Agent doesn't collect personal data
- ✅ **Tally Stays Local:** Your Tally data remains on your computer

---

## 🔄 Updates

### Automatic Updates (Coming Soon):
- Agent will check for updates daily
- Installs updates in background
- Notifies you when update is ready
- No action required from you

### Manual Updates:
1. Download latest installer from BytePhase
2. Run installer (will upgrade existing installation)
3. Configuration preserved automatically

---

## ❓ Frequently Asked Questions

**Q: Do I need to keep the agent running all the time?**
A: Yes, the agent needs to run to sync data. It uses minimal resources (<1% CPU, ~150MB RAM).

**Q: Will it slow down my computer?**
A: No, the agent is very lightweight and runs in the background.

**Q: What happens if my internet goes down?**
A: Jobs are queued locally and processed when internet returns.

**Q: Can I use it on multiple computers?**
A: Yes, install on each computer with unique Agent IDs.

**Q: Does it work with all Tally versions?**
A: Yes, supports ERP 9, Prime, and Prime Server.

**Q: Can I see what data is being synced?**
A: Yes, check the Logs tab in Settings for all activity.

**Q: How do I uninstall?**
A:
- **Windows:** Settings → Apps → BytePhase Agent → Uninstall
- **macOS:** Drag from Applications to Trash
- **Linux:** Delete the AppImage file

**Q: What if I forget my API Key?**
A: Contact BytePhase support to reset your API key.

---

## 📝 Quick Reference Card

**Print this for easy reference:**

```
┌──────────────────────────────────────────┐
│   BYTEPHASE AGENT - QUICK REFERENCE      │
├──────────────────────────────────────────┤
│                                          │
│  SYSTEM TRAY ICON LOCATION:              │
│  • Windows: Bottom-right corner          │
│  • macOS: Top-right menu bar             │
│  • Linux: System tray                    │
│                                          │
│  OPEN SETTINGS:                          │
│  Click tray icon → Settings              │
│                                          │
│  VIEW LOGS:                              │
│  Settings → Logs tab                     │
│                                          │
│  TEST TALLY:                             │
│  Settings → Setup tab → Test Tally       │
│                                          │
│  TALLY XML PORT: 9000                    │
│                                          │
│  SUPPORT: support@bytephase.com          │
│                                          │
└──────────────────────────────────────────┘
```

---

## ✅ Installation Complete!

You're all set! BytePhase Agent is now:
- ✅ Installed on your computer
- ✅ Connected to Tally
- ✅ Syncing with BytePhase cloud
- ✅ Running automatically

**Need help?** Contact BytePhase support anytime!

---

**Version:** 1.0.0
**Last Updated:** January 2, 2026
**Repository:** https://github.com/bytephase/bytephase-agent
