/**
 * Mock Tally Server
 *
 * Simulates Tally ERP XML API on localhost:9000 for testing
 * the sync engine, company detection, stock groups, and stock items
 * on machines where Tally is not available (e.g., macOS/Linux).
 *
 * Usage: node scripts/mock-tally-server.js
 */

const http = require('http');

const PORT = 9000;

// --- Sample Data ---

const COMPANIES = ['BytePhase Electronics Pvt Ltd', 'Demo Trading Co'];

const STOCK_GROUPS = [
  { name: 'Mobile Parts', parent: null },
  { name: 'Batteries', parent: 'Mobile Parts' },
  { name: 'Screens', parent: 'Mobile Parts' },
  { name: 'Charging Ports', parent: 'Mobile Parts' },
  { name: 'Laptop Parts', parent: null },
  { name: 'RAM', parent: 'Laptop Parts' },
  { name: 'SSD', parent: 'Laptop Parts' },
  { name: 'Keyboards', parent: 'Laptop Parts' },
  { name: 'LCD Panels', parent: 'Laptop Parts' },
  { name: 'Data Recovery', parent: null },
  { name: 'Donor Drives', parent: 'Data Recovery' },
  { name: 'PCB Boards', parent: 'Data Recovery' },
  { name: 'Tools & Equipment', parent: null },
];

const STOCK_ITEMS = [
  // Batteries
  { name: 'Samsung S21 Battery OEM', parent: 'Batteries', qty: 45, unit: 'Nos', rate: 350, modified: '20260315' },
  { name: 'Samsung S22 Battery OEM', parent: 'Batteries', qty: 30, unit: 'Nos', rate: 420, modified: '20260315' },
  { name: 'iPhone 13 Battery Original', parent: 'Batteries', qty: 22, unit: 'Nos', rate: 890, modified: '20260314' },
  { name: 'iPhone 14 Battery Original', parent: 'Batteries', qty: 15, unit: 'Nos', rate: 1100, modified: '20260316' },
  { name: 'OnePlus 9 Battery Compatible', parent: 'Batteries', qty: 60, unit: 'Nos', rate: 280, modified: '20260312' },
  { name: 'Xiaomi Redmi Note 12 Battery', parent: 'Batteries', qty: 80, unit: 'Nos', rate: 220, modified: '20260310' },
  // Screens
  { name: 'Samsung S21 LCD Screen', parent: 'Screens', qty: 12, unit: 'Nos', rate: 2200, modified: '20260316' },
  { name: 'iPhone 13 OLED Display', parent: 'Screens', qty: 8, unit: 'Nos', rate: 4500, modified: '20260315' },
  { name: 'iPhone 14 OLED Display', parent: 'Screens', qty: 5, unit: 'Nos', rate: 5800, modified: '20260316' },
  { name: 'Xiaomi Redmi Note 12 LCD', parent: 'Screens', qty: 25, unit: 'Nos', rate: 1100, modified: '20260313' },
  // Charging Ports
  { name: 'Samsung Type-C Port Universal', parent: 'Charging Ports', qty: 200, unit: 'Nos', rate: 45, modified: '20260311' },
  { name: 'iPhone Lightning Port', parent: 'Charging Ports', qty: 150, unit: 'Nos', rate: 85, modified: '20260312' },
  // RAM
  { name: 'DDR4 8GB 3200MHz Crucial', parent: 'RAM', qty: 35, unit: 'Nos', rate: 1800, modified: '20260315' },
  { name: 'DDR4 16GB 3200MHz Kingston', parent: 'RAM', qty: 20, unit: 'Nos', rate: 3200, modified: '20260314' },
  { name: 'DDR5 16GB 4800MHz Samsung', parent: 'RAM', qty: 10, unit: 'Nos', rate: 4500, modified: '20260316' },
  // SSD
  { name: 'Samsung 870 EVO 500GB', parent: 'SSD', qty: 18, unit: 'Nos', rate: 3800, modified: '20260315' },
  { name: 'WD Blue SN570 1TB NVMe', parent: 'SSD', qty: 12, unit: 'Nos', rate: 5200, modified: '20260314' },
  { name: 'Crucial MX500 250GB', parent: 'SSD', qty: 40, unit: 'Nos', rate: 2100, modified: '20260312' },
  // Keyboards
  { name: 'HP Pavilion 15 Keyboard', parent: 'Keyboards', qty: 8, unit: 'Nos', rate: 950, modified: '20260310' },
  { name: 'Dell Inspiron 15 Keyboard', parent: 'Keyboards', qty: 6, unit: 'Nos', rate: 850, modified: '20260311' },
  { name: 'Lenovo IdeaPad 3 Keyboard', parent: 'Keyboards', qty: 10, unit: 'Nos', rate: 750, modified: '20260313' },
  // LCD Panels
  { name: 'HP 15.6" FHD LCD Panel', parent: 'LCD Panels', qty: 4, unit: 'Nos', rate: 4200, modified: '20260314' },
  { name: 'Dell 14" HD LCD Panel', parent: 'LCD Panels', qty: 3, unit: 'Nos', rate: 3800, modified: '20260312' },
  // Donor Drives
  { name: 'WD 1TB HDD Donor (WD10EZEX)', parent: 'Donor Drives', qty: 7, unit: 'Nos', rate: 1200, modified: '20260315' },
  { name: 'Seagate 2TB HDD Donor (ST2000DM)', parent: 'Donor Drives', qty: 5, unit: 'Nos', rate: 1800, modified: '20260314' },
  // PCB Boards
  { name: 'WD PCB 2060-800041', parent: 'PCB Boards', qty: 3, unit: 'Nos', rate: 2500, modified: '20260313' },
  { name: 'Seagate PCB 100815583', parent: 'PCB Boards', qty: 2, unit: 'Nos', rate: 3200, modified: '20260311' },
  // Tools
  { name: 'Precision Screwdriver Set 120pc', parent: 'Tools & Equipment', qty: 15, unit: 'Set', rate: 650, modified: '20260308' },
  { name: 'Hot Air Rework Station 858D', parent: 'Tools & Equipment', qty: 3, unit: 'Nos', rate: 4500, modified: '20260305' },
];

// --- XML Response Builders ---

function escapeXml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildCompanyListXML() {
  const companyItems = COMPANIES.map(name =>
    `        <COMPANY NAME="${escapeXml(name)}"><NAME>${escapeXml(name)}</NAME></COMPANY>`
  ).join('\n');

  return `<ENVELOPE>
  <BODY>
    <DATA>
      <COLLECTION>
${companyItems}
      </COLLECTION>
    </DATA>
  </BODY>
</ENVELOPE>`;
}

function buildStockGroupsXML() {
  const groupItems = STOCK_GROUPS.map(g =>
    `        <STOCKGROUP NAME="${escapeXml(g.name)}"><NAME>${escapeXml(g.name)}</NAME><PARENT>${escapeXml(g.parent || 'Primary')}</PARENT></STOCKGROUP>`
  ).join('\n');

  return `<ENVELOPE>
  <BODY>
    <DATA>
      <COLLECTION>
${groupItems}
      </COLLECTION>
    </DATA>
  </BODY>
</ENVELOPE>`;
}

function buildStockItemXML(item) {
  return `        <STOCKITEM NAME="${escapeXml(item.name)}">
          <NAME>${escapeXml(item.name)}</NAME>
          <PARENT>${escapeXml(item.parent)}</PARENT>
          <CLOSINGBALANCE>${item.qty} ${item.unit}</CLOSINGBALANCE>
          <CLOSINGRATE>${item.rate}/${item.unit}</CLOSINGRATE>
          <BASEUNITS>${item.unit}</BASEUNITS>
          <LASTMODIFIEDDATE>${item.modified}</LASTMODIFIEDDATE>
          <GUID>mock-guid-${item.name.replace(/\s+/g, '-').replace(/[&<>"]/g, '').toLowerCase()}</GUID>
          <NARRATION></NARRATION>
          <MAILINGNAME>${escapeXml(item.name)}</MAILINGNAME>
          <DESCRIPTION></DESCRIPTION>
        </STOCKITEM>`;
}

function buildStockItemsXML(items) {
  const itemsXml = items.map(buildStockItemXML).join('\n');
  return `<ENVELOPE>
  <BODY>
    <DATA>
      <COLLECTION>
${itemsXml}
      </COLLECTION>
    </DATA>
  </BODY>
</ENVELOPE>`;
}

function buildSysInfoXML() {
  return `<ENVELOPE>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVCURRENTCOMPANY>${COMPANIES[0]}</SVCURRENTCOMPANY>
      </STATICVARIABLES>
    </DESC>
    <DATA>
      <TALLYLICENSE>TallyPrime 5.0</TALLYLICENSE>
    </DATA>
  </BODY>
</ENVELOPE>`;
}

function buildCompanyInfoXML() {
  return `<ENVELOPE>
  <COMPANY>
    <NAME>${COMPANIES[0]}</NAME>
  </COMPANY>
</ENVELOPE>`;
}

// --- Request Router ---

function handleRequest(body) {
  const bodyUpper = body.toUpperCase();

  // Empty envelope = isRunning() health check
  if (body.trim() === '<ENVELOPE></ENVELOPE>' || body.trim().length < 30) {
    return '<ENVELOPE><STATUS>OK</STATUS></ENVELOPE>';
  }

  // SysInfo = getVersion()
  if (bodyUpper.includes('SYSINFO')) {
    console.log('  -> SysInfo (version detection)');
    return buildSysInfoXML();
  }

  // CompanyInfo = getCompanyName()
  if (bodyUpper.includes('COMPANYINFO')) {
    console.log('  -> CompanyInfo');
    return buildCompanyInfoXML();
  }

  // ListOfCompanies = listCompanies()
  if (bodyUpper.includes('LISTOFCOMPANIES')) {
    console.log('  -> List Companies');
    return buildCompanyListXML();
  }

  // StockGroupList = listStockGroups()
  if (bodyUpper.includes('STOCKGROUPLIST')) {
    console.log('  -> List Stock Groups');
    return buildStockGroupsXML();
  }

  // ChangedStockItems = readChangedStockItems() (delta sync)
  if (bodyUpper.includes('CHANGEDSTOCKITEMS') || bodyUpper.includes('MODIFIEDFILTER')) {
    // Extract the date filter
    const dateMatch = body.match(/\$\$Date:"(\d{8})"/);
    let sinceDate = null;
    if (dateMatch) {
      sinceDate = dateMatch[1];
    }

    let changed;
    if (sinceDate) {
      changed = STOCK_ITEMS.filter(item => item.modified >= sinceDate);
      console.log(`  -> Changed Stock Items since ${sinceDate}: ${changed.length} items`);
    } else {
      // Return a few items as "changed"
      changed = STOCK_ITEMS.filter(item => item.modified >= '20260315');
      console.log(`  -> Changed Stock Items (no date filter): ${changed.length} items`);
    }
    return buildStockItemsXML(changed);
  }

  // SingleStockItem = readSingleStockItem()
  if (bodyUpper.includes('SINGLESTOCKITEM') || bodyUpper.includes('NAMEFILTER')) {
    const nameMatch = body.match(/\$NAME\s*=\s*"([^"]+)"/);
    if (nameMatch) {
      const itemName = nameMatch[1];
      const item = STOCK_ITEMS.find(i => i.name === itemName);
      console.log(`  -> Single Stock Item: "${itemName}" ${item ? 'found' : 'not found'}`);
      return item ? buildStockItemsXML([item]) : buildStockItemsXML([]);
    }
    console.log('  -> Single Stock Item (no name match)');
    return buildStockItemsXML([]);
  }

  // StockItemList = readStockItems() (full sync)
  if (bodyUpper.includes('STOCKITEMLIST') || (bodyUpper.includes('STOCK ITEM') && bodyUpper.includes('COLLECTION'))) {
    console.log(`  -> All Stock Items: ${STOCK_ITEMS.length} items`);
    return buildStockItemsXML(STOCK_ITEMS);
  }

  // Default fallback
  console.log('  -> Unknown request, returning empty envelope');
  return '<ENVELOPE></ENVELOPE>';
}

// --- Server ---

const server = http.createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end('Method not allowed');
    return;
  }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    console.log(`\n[${new Date().toLocaleTimeString()}] POST request received (${body.length} bytes)`);

    const responseXml = handleRequest(body);

    res.writeHead(200, {
      'Content-Type': 'text/xml',
      'Content-Length': Buffer.byteLength(responseXml)
    });
    res.end(responseXml);
  });
});

server.listen(PORT, () => {
  console.log(`\n=== Mock Tally Server ===`);
  console.log(`Listening on http://localhost:${PORT}`);
  console.log(`\nCompanies: ${COMPANIES.join(', ')}`);
  console.log(`Stock Groups: ${STOCK_GROUPS.length}`);
  console.log(`Stock Items: ${STOCK_ITEMS.length}`);
  console.log(`\nReady for testing. Press Ctrl+C to stop.\n`);
});
