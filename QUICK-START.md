# Quick Start Guide - Bytephase Tally Agent

Get your Tally Agent running in 5 minutes!

## ⚡ Quick Setup

### 1. Install Dependencies (First time only)

```bash
cd bytephase-tally-agent
npm install
```

**Expected output:**
```
added 150 packages in 30s
```

### 2. Start the Agent

```bash
npm start
```

**What happens:**
- Electron window opens
- System tray icon appears
- Agent runs in background

### 3. Configure the Agent

**Click tray icon** → **Settings**

Enter these details:

| Field | Example | Description |
|-------|---------|-------------|
| **Cloud URL** | `https://tally-api.yourcompany.com` | Your Laravel server URL |
| **API Key** | `abc123...` | Get from admin panel |
| **Agent ID** | `agent_shop_mumbai` | Unique ID for this computer |
| **Shop ID** | `shop_001` | Your shop identifier |

**Click "Save & Start"**

### 4. Test Tally Connection

**Click "Test Tally"** button

**Success:** ✓ Connected to Tally Prime - Company: ABC Corp
**Failure:** ✗ Failed - Make sure Tally is running

---

## ✅ Verification Checklist

After setup, verify these:

- [ ] Tray icon shows: **✓ Registered**
- [ ] Tray icon shows: **✓ Tally Running**
- [ ] Tray icon shows: **✓ Polling Active**
- [ ] No error messages in console

---

## 🎯 Test the Integration

### Option 1: From Your Business App

Go to your Bytephase Repair Shop and create a new invoice.

**Expected flow:**
1. You create invoice in web app
2. Web app calls Laravel API
3. Laravel queues job for your agent
4. Agent polls (within 30s)
5. Agent creates voucher in Tally
6. Invoice appears in Tally!

### Option 2: Manual API Test

If you have access to the Laravel server:

```bash
# Create a test voucher
curl -X POST https://your-server.com/api/tally/vouchers \
  -H "Authorization: Bearer YOUR_BUSINESS_APP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "shop_id": "shop_001",
    "type": "Sales",
    "date": "2026-01-02",
    "voucherNumber": "TEST-001",
    "party": "Test Customer",
    "ledgers": [
      {"name": "Test Customer", "amount": -1000},
      {"name": "Sales", "amount": 1000}
    ]
  }'
```

**Watch the agent:**
- Open Settings → Status tab
- "Jobs Processed" should increment
- Check Tally for new voucher "TEST-001"

---

## 🔧 Common Issues

### Issue: "Tally Not Running"

**Fix:**
1. Start Tally software
2. Go to: Gateway → F12 (Configure) → Connectivity
3. Enable: "Allow Data Access via XML"
4. Port: 9000
5. Click "Test Tally" again

### Issue: "401 Unauthorized"

**Fix:**
- Check API key is correct
- Verify API key is active in cloud service
- Re-enter credentials in Settings

### Issue: "Cannot connect to cloud"

**Fix:**
- Verify Cloud URL is correct
- Check internet connection
- Ensure cloud server is running
- Try accessing Cloud URL in browser

### Issue: Agent not in system tray

**Windows:** Check hidden icons
**macOS:** Check menu bar (top right)
**Linux:** Check system tray area

---

## 📊 Monitoring

### View Status

Click tray icon to see:
- Registration status
- Tally connection
- Jobs processed count
- Queue status

### View Detailed Status

1. Click tray icon
2. Click "Settings"
3. Go to "Status" tab
4. See real-time stats

### Check Logs

**Option 1:** From Settings
- Click "View Logs" in tray menu

**Option 2:** Manual
- **Windows:** `C:\Users\{you}\AppData\Roaming\bytephase-tally-agent\logs`
- **macOS:** `~/Library/Application Support/bytephase-tally-agent/logs`
- **Linux:** `~/.config/bytephase-tally-agent/logs`

---

## 🚀 Production Deployment

### Step 1: Build Installer

```bash
npm run build
```

**Output:** `dist/` folder contains:
- Windows: `Bytephase Tally Agent Setup.exe`
- macOS: `Bytephase Tally Agent.dmg`
- Linux: `Bytephase Tally Agent.AppImage`

### Step 2: Install on Shop Computer

1. Copy installer to shop computer
2. Run installer
3. Launch "Bytephase Tally Agent"
4. Configure with shop-specific credentials
5. Done!

### Step 3: Auto-Start on Boot (Optional)

**Windows:**
- Installer automatically adds to startup

**macOS:**
- System Preferences → Users & Groups → Login Items
- Add Bytephase Tally Agent

**Linux:**
- Add to startup applications

---

## 💡 Pro Tips

### Tip 1: Multiple Tally Companies

If you have multiple Tally companies on one computer:
- Each company needs its own agent instance
- Use different Agent IDs
- Configure Tally company name in each agent

### Tip 2: Adjust Polling Frequency

For faster sync (default is 30s):

Edit `config/default.json`:
```json
{
  "pollInterval": 10000
}
```
*10000 = 10 seconds*

**Note:** Faster polling = more server load

### Tip 3: Monitor Queue

If internet goes down:
- Jobs queue in the cloud
- Agent queues locally
- Everything syncs when back online
- Check queue count in Status tab

### Tip 4: Keep Agent Running

For best results:
- Don't close Tally while processing
- Keep agent running 24/7
- Set computer to not sleep during business hours

---

## 📞 Next Steps

1. **Read Full Docs:** See `ELECTRON-AGENT.md`
2. **Architecture:** See `docs/ARCHITECTURE.md`
3. **Laravel Setup:** Create the cloud service (next phase)
4. **Business App Integration:** Connect your app to Laravel API

---

## ⚠️ Important Notes

- **Backup Tally Data** before first use
- **Test on dummy company** first
- **Monitor logs** for first few hours
- **Don't share API keys** with anyone

---

## 🆘 Getting Help

**Issues:**
1. Check this guide first
2. Check `ELECTRON-AGENT.md` for detailed troubleshooting
3. View logs for error messages
4. Contact support with log files

**Support:**
- Email: support@bytephase.com
- GitHub Issues: [Repository URL]
- Docs: `docs/ARCHITECTURE.md`

---

**You're all set! The agent should now be syncing between your cloud app and Tally.** 🎉
