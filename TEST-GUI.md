# GUI Testing Instructions

**Status:** ✅ CLI tests passed - Ready for GUI testing
**Platform:** macOS (works on Windows/Linux too)

---

## ✅ Pre-Test Checklist (Completed)

- [x] Project structure verified
- [x] JSON configs validated
- [x] Code syntax checked (no errors)
- [x] Dependencies installed successfully
- [x] XML Builder tested
- [x] XML Parser tested

---

## 🚀 Start the GUI Agent

### Step 1: Open Terminal

```bash
cd /Users/vishwa/workspace/bytephase-tally-agent
npm start
```

### Step 2: What Should Happen

✅ **Expected behavior:**
1. Electron window may briefly flash (or not appear at all - this is normal)
2. **System tray icon appears** in your macOS menu bar (top right)
   - Look for a small icon near WiFi/Battery icons
   - If no icon visible, the app may be using default Electron icon
3. Console shows logs like:
   ```
   [APP] Application started
   [QUEUE] Database initialized at: /Users/vishwa/Library/Application Support/bytephase-tally-agent/offline-queue.db
   [APP] Agent not registered. Please configure settings.
   ```

❌ **If you see errors:**
- Take a screenshot
- Copy the error message
- Check common issues below

---

## 🧪 Test Plan

### Test 1: System Tray Icon ⭐

**Steps:**
1. Look for tray icon in macOS menu bar (top right)
2. Click the icon

**Expected:**
```
┌─────────────────────────────┐
│ Bytephase Tally Agent       │
├─────────────────────────────┤
│ ✗ Not Registered            │
│ ✗ Tally Offline             │
│ ✗ Polling Stopped           │
├─────────────────────────────┤
│ Jobs Processed: 0           │
│ Queue: 0 pending            │
├─────────────────────────────┤
│ Settings                    │
│ Start Polling (disabled)    │
│ View Logs                   │
├─────────────────────────────┤
│ Quit                        │
└─────────────────────────────┘
```

**Result:** ☐ Pass ☐ Fail
**Notes:** ___________________

---

### Test 2: Settings Window ⭐⭐

**Steps:**
1. Click tray icon → Settings

**Expected:**
- Window opens (600x700px)
- Title: "Bytephase Tally Agent - Settings"
- Beautiful purple gradient header
- 3 tabs: Setup | Status | Logs
- Form with 4 input fields

**Result:** ☐ Pass ☐ Fail
**Notes:** ___________________

---

### Test 3: Configuration Form ⭐⭐⭐

**Steps:**
1. In Settings → Setup tab
2. Fill in the form:
   - **Cloud URL:** `http://localhost:8000`
   - **API Key:** `test-api-key-123`
   - **Agent ID:** `agent_test_mac`
   - **Shop ID:** `shop_test`
3. Click "Save & Start"

**Expected:**
- Alert: "✓ Configuration saved successfully! Agent is now running."
- Badge changes to: "✓ Registered"
- (Polling will fail since Laravel service doesn't exist yet - that's OK)

**Result:** ☐ Pass ☐ Fail
**Notes:** ___________________

---

### Test 4: Status Tab ⭐⭐

**Steps:**
1. Settings → Status tab
2. Wait 5 seconds

**Expected:**
Status grid showing:
- Registration: ✓ Registered (green)
- Tally Connection: ✗ Offline (red) *unless Tally is running*
- Polling Status: ✓ Active OR ✗ Stopped (depends on cloud connection)
- Jobs Processed: 0
- Queue Pending: 0
- Last Poll: Never OR timestamp

**Result:** ☐ Pass ☐ Fail
**Notes:** ___________________

---

### Test 5: Tally Connection Test (Optional) ⭐⭐⭐

**Pre-requisite:** Tally must be running with XML API enabled

**Steps:**
1. **Start Tally first:**
   - Open Tally
   - Go to: Gateway → F12 (Configure) → Connectivity
   - Enable: "Allow Data Access via XML"
   - Port: 9000

2. In Settings → Setup tab
3. Click "Test Tally" button

**Expected:**
- Alert: "✓ Connected to Tally [Version]\nCompany: [Your Company Name]"

**If Tally not running:**
- Alert: "✗ Failed to connect to Tally\nTally is not running"

**Result:** ☐ Pass ☐ Fail
**Tally Version Detected:** ___________________
**Company Name:** ___________________

---

### Test 6: Credential Persistence ⭐⭐

**Steps:**
1. Save configuration (Test 3)
2. Close Settings window
3. Quit the agent (tray icon → Quit)
4. Start agent again: `npm start`
5. Open Settings

**Expected:**
- Form fields still populated with saved values
- Badge shows "✓ Registered"
- API Key shows as "••••••••••••••••" (masked)

**Result:** ☐ Pass ☐ Fail
**Notes:** ___________________

---

### Test 7: Clear Configuration ⭐⭐

**Steps:**
1. In Settings → Setup tab
2. Scroll down to "Danger Zone"
3. Click "Clear Configuration"
4. Confirm the dialog

**Expected:**
- Form fields cleared
- Badge changes to "Not Registered"
- Alert: "Configuration cleared"

**Result:** ☐ Pass ☐ Fail
**Notes:** ___________________

---

### Test 8: Offline Queue Database ⭐

**Steps:**
1. Check if SQLite database was created:

```bash
ls -lh ~/Library/Application\ Support/bytephase-tally-agent/
```

**Expected:**
```
offline-queue.db
config.json (encrypted credentials)
```

2. Verify database structure:

```bash
sqlite3 ~/Library/Application\ Support/bytephase-tally-agent/offline-queue.db ".schema"
```

**Expected:**
```sql
CREATE TABLE offline_queue (...);
CREATE TABLE completed_jobs (...);
```

**Result:** ☐ Pass ☐ Fail
**Database size:** ___________________

---

### Test 9: Console Logs ⭐

**Steps:**
1. Watch the terminal where you ran `npm start`

**Expected logs:**
```
[APP] Application started
[QUEUE] Database initialized at: ...
[APP] Agent not registered. Please configure settings.
[TALLY] Running: false (or true if Tally running)
```

After configuration:
```
[AUTH] Credentials saved successfully
[POLLING] Service started
[POLLING] Error: ... (connection refused - normal since Laravel not running)
```

**Result:** ☐ Pass ☐ Fail
**Errors seen:** ___________________

---

### Test 10: Stop/Start Polling ⭐

**Steps:**
1. Configure agent first (Test 3)
2. Click tray icon
3. Click "Stop Polling"
4. Wait 5 seconds
5. Check tray menu again

**Expected:**
- Menu shows: "✗ Polling Stopped"
- Menu button changes to: "Start Polling"

6. Click "Start Polling"

**Expected:**
- Menu shows: "✓ Polling Active"

**Result:** ☐ Pass ☐ Fail
**Notes:** ___________________

---

## 📸 Screenshots to Take

Please take screenshots of:

1. ☐ System tray icon location
2. ☐ Tray menu (expanded)
3. ☐ Settings window - Setup tab
4. ☐ Settings window - Status tab
5. ☐ Any error messages
6. ☐ Console logs (terminal)

---

## 🐛 Common Issues & Fixes

### Issue: No tray icon visible

**Fix:**
- Check hidden icons (click arrow on menu bar)
- Icon might be default Electron icon (white/generic)
- Check console for errors

### Issue: "Cannot find module 'electron'"

**Fix:**
```bash
npm install
```

### Issue: Settings window won't open

**Check console for:**
```
Error: ENOENT: no such file or directory, open '.../ui/settings.html'
```

**Fix:** Verify file exists:
```bash
ls -la ui/
```

### Issue: Polling errors in console

**This is NORMAL!** Example:
```
[POLLING] Error: connect ECONNREFUSED localhost:8000
```

**Why:** Laravel service doesn't exist yet. This is expected.

### Issue: Can't connect to Tally

**Checklist:**
- [ ] Tally software is running
- [ ] Gateway → F12 → Connectivity → XML enabled
- [ ] Port is 9000
- [ ] Try manually:
  ```bash
  curl -X POST http://localhost:9000 -d "<ENVELOPE></ENVELOPE>"
  ```

---

## 🎯 Success Criteria

**Minimum for "PASS":**
- [x] Agent starts without crashes
- [ ] Tray icon appears and clickable
- [ ] Settings window opens
- [ ] Can save configuration
- [ ] Configuration persists after restart
- [ ] Database created in correct location

**Bonus (if Tally available):**
- [ ] Tally connection detected
- [ ] Version and company name retrieved

---

## 📋 Test Results Summary

**Date:** _________________
**Tester:** _________________
**Platform:** macOS ________

**Overall Status:**
- ☐ All tests passed ✅
- ☐ Minor issues (specify): _________________
- ☐ Major issues (specify): _________________

**Ready for next phase?**
- ☐ Yes - proceed to Laravel service
- ☐ No - needs fixes (list below)

**Issues found:**
1. ___________________
2. ___________________
3. ___________________

---

## 🔄 After Testing

### If all tests pass:

1. **Keep agent running** in background
2. **Next step:** Build Laravel Tally Connect service
3. **Then:** Test full integration (Cloud → Agent → Tally)

### If issues found:

1. List all errors/screenshots
2. Check `ELECTRON-AGENT.md` troubleshooting section
3. Report issues with:
   - Error messages
   - Console logs
   - Screenshots
   - Steps to reproduce

---

## 💡 Pro Testing Tips

1. **Watch the console** - Lots of useful debug info
2. **Check system logs:**
   ```bash
   tail -f ~/Library/Logs/bytephase-tally-agent/main.log
   ```
3. **Reset completely if needed:**
   ```bash
   rm -rf ~/Library/Application\ Support/bytephase-tally-agent/*
   ```
4. **Test with Tally dummy company** first
5. **Don't test with production Tally data** yet

---

## 📞 Next Steps After Testing

1. ☐ Complete this test plan
2. ☐ Document any issues found
3. ☐ If passing: Start Laravel service development
4. ☐ If failing: Fix issues and re-test

---

**Good luck with testing! The agent is ready for you.** 🚀
