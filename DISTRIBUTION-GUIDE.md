# BytePhase Agent - Distribution Guide

**How to share and distribute BytePhase Agent to customers**

---

## 📦 Distribution Options

### Option 1: **Pre-built Installers** (RECOMMENDED for customers)

Build installers that customers can double-click to install.

#### For Windows (.exe installer):
```bash
npm run build
```

Creates: `dist/BytePhase Agent Setup 1.0.0.exe`

**Customer receives:**
- Single .exe file
- Double-click to install
- Automatic desktop shortcut
- Start menu entry
- Runs on startup

#### For macOS (.dmg installer):
```bash
npm run build
```

Creates: `dist/BytePhase Agent-1.0.0.dmg`

**Customer receives:**
- Single .dmg file
- Drag-and-drop to Applications
- Beautiful installer experience
- Automatic updates ready

#### For Linux (.AppImage):
```bash
npm run build
```

Creates: `dist/BytePhase Agent-1.0.0.AppImage`

**Customer receives:**
- Single portable file
- Make executable and run
- No installation needed

---

### Option 2: **Source Code** (For technical users)

Share the GitHub repository:
```
https://github.com/bytephase/bytephase-agent
```

**Customer needs:**
- Node.js 16+ installed
- Run: `npm install && npm start`

**Best for:**
- Developers
- Custom deployments
- Testing environments

---

## 🎁 What to Send to Customers

### Package Contents:

**1. Installer File**
- Windows: `BytePhase-Agent-Setup.exe` (50-100 MB)
- macOS: `BytePhase-Agent.dmg` (50-100 MB)
- Linux: `BytePhase-Agent.AppImage` (50-100 MB)

**2. Customer Installation Guide**
- PDF version of `CUSTOMER-INSTALL-GUIDE.md`
- Include screenshots
- Keep it under 5 pages

**3. Credentials Document**
- Cloud Service URL
- API Key (unique per customer)
- Agent ID (suggest: `agent_<shopname>_<location>`)
- Shop ID (unique per shop)

**4. Quick Start Card** (1-page printable)
- System tray location
- How to open settings
- Support contact info

---

## 🔨 Building Installers

### Prerequisites:

**Install electron-builder** (already in package.json):
```bash
npm install
```

### Build for All Platforms:

```bash
# Build for current platform
npm run build

# Build for Windows (on Windows or Mac)
npm run build -- --win

# Build for macOS (on Mac only)
npm run build -- --mac

# Build for Linux
npm run build -- --linux
```

### Output Location:

All installers go to: `dist/` folder

```
dist/
├── BytePhase Agent Setup 1.0.0.exe      (Windows)
├── BytePhase Agent-1.0.0.dmg             (macOS)
└── BytePhase Agent-1.0.0.AppImage        (Linux)
```

### File Sizes:

- Windows .exe: ~60 MB
- macOS .dmg: ~80 MB
- Linux .AppImage: ~85 MB

---

## 📧 Email Template for Customers

```
Subject: BytePhase Agent - Installation Package

Dear [Customer Name],

Thank you for choosing BytePhase!

Please find attached your BytePhase Agent installation package:

📦 INSTALLATION FILE:
- BytePhase-Agent-Setup.exe (for Windows)
  OR
- BytePhase-Agent.dmg (for macOS)
  OR
- BytePhase-Agent.AppImage (for Linux)

🔐 YOUR CREDENTIALS:
- Cloud Service URL: https://connect.bytephase.com
- API Key: [Unique API Key]
- Agent ID: agent_[shopname]
- Shop ID: shop_[number]

📖 INSTALLATION GUIDE:
- See attached PDF guide
- Takes 5 minutes to install

🎯 QUICK STEPS:
1. Download and run the installer
2. Open BytePhase Agent from system tray
3. Click "Settings"
4. Enter your credentials above
5. Click "Save & Start"

✅ VERIFY INSTALLATION:
- System tray icon visible
- Status shows "✓ Registered"
- Tally connection successful

📞 NEED HELP?
- Email: support@bytephase.com
- Phone: [Your phone]
- Hours: Mon-Fri, 9 AM - 6 PM

Best regards,
BytePhase Support Team
```

---

## 🌐 Distribution Methods

### Method 1: Direct Email

**For:** Individual customers, small deployments

**Steps:**
1. Build installer for customer's OS
2. Upload to secure file sharing (Dropbox, Google Drive, etc.)
3. Email download link + credentials
4. Follow up after 24 hours

**Pros:**
- Personal touch
- Easy tracking
- Direct support

**Cons:**
- Manual process
- Doesn't scale

---

### Method 2: Download Portal

**For:** Multiple customers, self-service

**Setup:**
1. Create downloads page on your website
2. Host installers on CDN/cloud storage
3. Customers log in to get their version
4. Auto-generated credentials

**Example URL:**
```
https://connect.bytephase.com/downloads
```

**Pros:**
- Scales well
- 24/7 availability
- Version control

**Cons:**
- Requires web portal
- Initial setup time

---

### Method 3: USB Drive

**For:** On-site installations, no internet

**Contents:**
1. All platform installers
2. Installation PDF
3. Credentials document
4. Quick start card

**Pros:**
- Works offline
- Professional delivery
- Easy for non-tech customers

**Cons:**
- Physical logistics
- Version updates manual

---

### Method 4: Remote Installation Service

**For:** Enterprise customers, white-glove service

**Process:**
1. Schedule remote session (TeamViewer, AnyDesk)
2. Download installer to customer's computer
3. Install and configure together
4. Test Tally connection
5. Train customer on usage

**Pros:**
- Highest success rate
- Immediate support
- Customer confidence

**Cons:**
- Time-intensive
- Requires scheduling

---

## 🔐 Security Considerations

### API Key Management:

**Generate Unique Keys:**
```
Format: bp_live_[random_32_chars]
Example: bp_live_XXXXXXXXXXXXXXXXXXXXXXXXXXXX1234
```

**Key Storage:**
- Never email plain text keys
- Use password-protected PDFs
- Or send via secure portal

**Key Rotation:**
- Allow customers to regenerate keys
- Expire keys after 90 days (optional)
- Revoke compromised keys immediately

### Installation Security:

**Code Signing (Recommended):**

**Windows:**
- Get code signing certificate ($200-400/year)
- Sign .exe with signtool
- Prevents "Unknown Publisher" warning

**macOS:**
- Apple Developer Program ($99/year)
- Code sign with Developer ID
- Notarize with Apple
- Prevents "Unidentified Developer" warning

**Linux:**
- No signing required
- Checksum verification

**Without Code Signing:**
- Customers see security warnings
- Must click "Run Anyway" / "Open"
- Include instructions in guide

---

## 📊 Tracking Installations

### Agent Registration:

When agent starts:
1. Sends registration to cloud
2. Records:
   - Agent ID
   - Shop ID
   - Machine ID
   - OS version
   - Tally version
   - Installation date

### Dashboard View:

Create admin dashboard showing:
- Total agents installed
- Active agents (polling now)
- Offline agents
- Jobs processed per agent
- Error rates

---

## 🔄 Update Strategy

### Auto-Updates (Recommended):

**Using electron-updater:**

1. **Host updates:**
   - Upload new versions to server
   - Create `latest.yml` file

2. **Agent checks daily:**
   - Downloads update in background
   - Notifies user when ready
   - Installs on next restart

3. **User experience:**
   - Notification: "Update available"
   - Click "Install and Restart"
   - Seamless upgrade

### Manual Updates:

**Email customers:**
```
Subject: BytePhase Agent Update Available

New version 1.1.0 available with:
- [Feature 1]
- [Bug fix 1]
- Performance improvements

Download: [link]
Instructions: Same as original installation
Your settings will be preserved.
```

---

## 📝 Customer Onboarding Checklist

**Before Sending Agent:**
- [ ] Build installer for customer's OS
- [ ] Generate unique API key
- [ ] Create agent ID (suggest format)
- [ ] Create installation PDF with screenshots
- [ ] Test installer on clean machine
- [ ] Prepare credentials document
- [ ] Set up customer in cloud system

**After Sending:**
- [ ] Email installation package + guide
- [ ] Follow up within 24 hours
- [ ] Schedule installation call if needed
- [ ] Verify agent registered successfully
- [ ] Test first job execution
- [ ] Confirm customer sees jobs in cloud
- [ ] Send quick start card

**First Week:**
- [ ] Check agent daily activity
- [ ] Monitor error logs
- [ ] Respond to support requests <4 hours
- [ ] Schedule training call if needed

---

## 🎓 Customer Training Materials

### Video Tutorials (Create these):

1. **Installation (5 min)**
   - Download and install
   - Basic configuration

2. **Daily Usage (3 min)**
   - System tray overview
   - Checking status
   - Viewing logs

3. **Tally XML Setup (2 min)**
   - Enabling XML API
   - Testing connection

4. **Troubleshooting (5 min)**
   - Common errors
   - How to fix

### Documentation to Provide:

- ✅ CUSTOMER-INSTALL-GUIDE.md (detailed)
- ✅ Quick Reference Card (1-page)
- ✅ FAQ document
- ✅ Support contact info

---

## 💰 Pricing & Licensing Considerations

### License Models:

**Per-Shop License:**
- One license = One shop location
- Unlimited computers at that shop
- Agent ID tied to shop

**Per-Computer License:**
- One license = One computer
- Unique agent ID per installation
- More granular control

**Subscription:**
- Monthly/annual fee
- Includes updates and support
- API key expires if unpaid

### License Enforcement:

**In Cloud Service:**
- Verify API key on each poll
- Reject expired/invalid keys
- Track active agent count
- Enforce limits

---

## 🚀 Deployment Scenarios

### Scenario 1: Single Shop, 1 Computer

**Package:**
- 1 installer
- 1 set of credentials
- Basic installation guide

**Timeline:**
- Send package: Day 1
- Follow up: Day 2
- Installation complete: Day 3

---

### Scenario 2: Chain with 10 Locations

**Package:**
- 1 installer (same for all)
- 10 sets of credentials (unique agent IDs)
- Bulk installation guide
- Remote support offer

**Timeline:**
- Week 1: Send to all locations
- Week 2: Follow up, remote installations
- Week 3: Training and verification

---

### Scenario 3: Enterprise (100+ locations)

**Package:**
- Installers for all platforms
- Bulk API key generation
- Naming convention guide
- Dedicated support portal
- Training webinars

**Timeline:**
- Month 1: Pilot (5 locations)
- Month 2: Rollout (25 locations)
- Month 3: Full deployment
- Month 4: Training and optimization

---

## 📞 Support Strategy

### Tier 1: Self-Service
- Installation guide
- FAQ document
- Video tutorials
- Common errors list

### Tier 2: Email Support
- Response time: <4 hours
- Troubleshooting guide
- Remote desktop if needed

### Tier 3: Phone/Remote Support
- Scheduled calls
- Screen sharing
- Live installation help
- Training sessions

---

## ✅ Final Distribution Checklist

**Technical:**
- [ ] Build installer for all platforms
- [ ] Test on clean machines
- [ ] Verify code signing (if applicable)
- [ ] Check file sizes reasonable
- [ ] Test auto-update mechanism

**Documentation:**
- [ ] Customer installation guide complete
- [ ] Screenshots included
- [ ] FAQ document ready
- [ ] Quick reference card designed
- [ ] Support contact info updated

**Credentials:**
- [ ] API key generation system ready
- [ ] Agent ID naming convention defined
- [ ] Cloud service endpoints configured
- [ ] Customer database set up

**Support:**
- [ ] Support email active
- [ ] Support phone number assigned
- [ ] Response time SLA defined
- [ ] Knowledge base articles written
- [ ] Escalation process defined

**Marketing:**
- [ ] Email templates ready
- [ ] Download page created (if applicable)
- [ ] Installation videos recorded
- [ ] Customer onboarding process documented

---

## 🎯 Success Metrics

**Track These:**
- Installation success rate (target: >95%)
- Time to first successful sync (target: <24 hours)
- Support tickets per installation (target: <2)
- Customer satisfaction score (target: >4.5/5)
- Agent uptime (target: >99%)

---

**Ready to distribute BytePhase Agent to your customers!**

**Next Steps:**
1. Build installers: `npm run build`
2. Test on customer-like environment
3. Create credentials for first customer
4. Send installation package
5. Follow up and support

---

**Version:** 1.0.0
**Repository:** https://github.com/bytephase/bytephase-agent
