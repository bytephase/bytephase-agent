/**
 * TallyService - Core Tally operations
 *
 * Handles communication with Tally ERP via XML API
 */

const axios = require('axios');
const xml2js = require('xml2js');
const tallyVersions = require('../../config/tally-versions.json');

class TallyService {
  constructor(config = {}) {
    this.host = config.tallyHost || 'localhost';
    this.port = config.tallyPort || 9000;
    this.timeout = config.timeout || 10000;
    this.baseUrl = `http://${this.host}:${this.port}`;

    this.tallyVersion = null;
    this.companyName = null;
  }

  /**
   * Check if Tally is running
   */
  async isRunning() {
    try {
      const xml = '<ENVELOPE></ENVELOPE>';
      await axios.post(this.baseUrl, xml, {
        timeout: 2000,
        headers: { 'Content-Type': 'text/xml' }
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get Tally version
   */
  async getVersion() {
    if (this.tallyVersion) {
      return this.tallyVersion;
    }

    try {
      const xml = `
        <ENVELOPE>
          <HEADER>
            <VERSION>1</VERSION>
            <TALLYREQUEST>Export</TALLYREQUEST>
            <TYPE>Data</TYPE>
            <ID>SysInfo</ID>
          </HEADER>
          <BODY>
            <DESC>
              <STATICVARIABLES>
                <SVCURRENTCOMPANY>##SYSNAME</SVCURRENTCOMPANY>
              </STATICVARIABLES>
            </DESC>
          </BODY>
        </ENVELOPE>
      `;

      const response = await this.sendRequest(xml);

      // Parse response to determine version
      if (response.includes('TallyPrime')) {
        this.tallyVersion = 'Prime';
      } else if (response.includes('TallyServer')) {
        this.tallyVersion = 'PrimeServer';
      } else {
        this.tallyVersion = 'ERP9';
      }

      console.log('[TALLY] Detected version:', this.tallyVersion);
      return this.tallyVersion;
    } catch (error) {
      console.error('[TALLY] Error detecting version:', error.message);
      return 'ERP9'; // Default fallback
    }
  }

  /**
   * Get current company name
   */
  async getCompanyName() {
    if (this.companyName) {
      return this.companyName;
    }

    try {
      const xml = `
        <ENVELOPE>
          <HEADER>
            <VERSION>1</VERSION>
            <TALLYREQUEST>Export</TALLYREQUEST>
            <TYPE>Data</TYPE>
            <ID>CompanyInfo</ID>
          </HEADER>
          <BODY>
            <DESC>
              <STATICVARIABLES>
                <SVCURRENTCOMPANY>##SYSNAME</SVCURRENTCOMPANY>
              </STATICVARIABLES>
            </DESC>
          </BODY>
        </ENVELOPE>
      `;

      const response = await this.sendRequest(xml);

      // Parse XML to extract company name
      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(response);

      this.companyName = result?.ENVELOPE?.COMPANY?.[0]?.NAME?.[0] || 'Unknown Company';

      console.log('[TALLY] Company name:', this.companyName);
      return this.companyName;
    } catch (error) {
      console.error('[TALLY] Error getting company name:', error.message);
      return 'Unknown Company';
    }
  }

  /**
   * Send raw XML request to Tally
   */
  async sendRequest(xml) {
    try {
      const response = await axios.post(this.baseUrl, xml, {
        timeout: this.timeout,
        headers: {
          'Content-Type': 'text/xml',
          'Content-Length': Buffer.byteLength(xml)
        }
      });

      return response.data;
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Tally is not running. Please start Tally and try again.');
      }
      throw error;
    }
  }

  /**
   * Create voucher in Tally
   */
  async createVoucher(data) {
    console.log('[TALLY] Creating voucher:', data);

    if (!await this.isRunning()) {
      throw new Error('Tally is not running');
    }

    const xml = await this.buildVoucherXML(data);
    const response = await this.sendRequest(xml);

    return await this.parseVoucherResponse(response);
  }

  /**
   * Read voucher from Tally
   */
  async readVoucher(data) {
    console.log('[TALLY] Reading voucher:', data);

    if (!await this.isRunning()) {
      throw new Error('Tally is not running');
    }

    // Implementation pending
    return { message: 'Read voucher - to be implemented' };
  }

  /**
   * Create ledger in Tally
   */
  async createLedger(data) {
    console.log('[TALLY] Creating ledger:', data);

    if (!await this.isRunning()) {
      throw new Error('Tally is not running');
    }

    // Implementation pending
    return { message: 'Create ledger - to be implemented' };
  }

  /**
   * Read ledgers from Tally
   */
  async readLedgers(data) {
    console.log('[TALLY] Reading ledgers');

    if (!await this.isRunning()) {
      throw new Error('Tally is not running');
    }

    // Implementation pending
    return { message: 'Read ledgers - to be implemented' };
  }

  /**
   * Create stock item in Tally
   */
  async createStockItem(data) {
    console.log('[TALLY] Creating stock item:', data);

    if (!await this.isRunning()) {
      throw new Error('Tally is not running');
    }

    // Implementation pending
    return { message: 'Create stock item - to be implemented' };
  }

  /**
   * List all open companies in Tally
   */
  async listCompanies() {
    console.log('[TALLY] Listing companies');

    const xml = `
      <ENVELOPE>
        <HEADER>
          <VERSION>1</VERSION>
          <TALLYREQUEST>Export</TALLYREQUEST>
          <TYPE>Collection</TYPE>
          <ID>ListOfCompanies</ID>
        </HEADER>
        <BODY>
          <DESC>
            <STATICVARIABLES>
              <SVCURRENTCOMPANY/>
            </STATICVARIABLES>
            <TDL>
              <TDLMESSAGE>
                <COLLECTION NAME="ListOfCompanies">
                  <TYPE>Company</TYPE>
                  <FETCH>NAME</FETCH>
                </COLLECTION>
              </TDLMESSAGE>
            </TDL>
          </DESC>
        </BODY>
      </ENVELOPE>
    `;

    const response = await this.sendRequest(xml);
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(response);

    const companies = [];
    const collection = result?.ENVELOPE?.BODY?.[0]?.DATA?.[0]?.COLLECTION?.[0];
    if (collection && collection.COMPANY) {
      for (const comp of collection.COMPANY) {
        const name = comp.NAME?.[0] || comp.$.NAME;
        if (name) companies.push(name);
      }
    }

    console.log(`[TALLY] Found ${companies.length} companies`);
    return companies;
  }

  /**
   * List all stock groups with parent hierarchy
   */
  async listStockGroups(companyName) {
    console.log(`[TALLY] Listing stock groups for company: ${companyName}`);

    const xml = `
      <ENVELOPE>
        <HEADER>
          <VERSION>1</VERSION>
          <TALLYREQUEST>Export</TALLYREQUEST>
          <TYPE>Collection</TYPE>
          <ID>StockGroupList</ID>
        </HEADER>
        <BODY>
          <DESC>
            <STATICVARIABLES>
              <SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>
            </STATICVARIABLES>
            <TDL>
              <TDLMESSAGE>
                <COLLECTION NAME="StockGroupList">
                  <TYPE>StockGroup</TYPE>
                  <FETCH>NAME, PARENT</FETCH>
                </COLLECTION>
              </TDLMESSAGE>
            </TDL>
          </DESC>
        </BODY>
      </ENVELOPE>
    `;

    const response = await this.sendRequest(xml);
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(response);

    const groups = [];
    const collection = result?.ENVELOPE?.BODY?.[0]?.DATA?.[0]?.COLLECTION?.[0];
    if (collection && collection.STOCKGROUP) {
      for (const group of collection.STOCKGROUP) {
        const name = group.NAME?.[0] || group.$.NAME;
        const parent = group.PARENT?.[0] || null;
        if (name) {
          groups.push({ name, parent: parent === 'Primary' ? null : parent });
        }
      }
    }

    console.log(`[TALLY] Found ${groups.length} stock groups`);
    return groups;
  }

  /**
   * Read stock items from Tally with full details
   */
  async readStockItems(options = {}) {
    const companyName = options.companyName || options.company;
    const filterGroups = options.syncGroups || options.filterGroups || [];

    console.log(`[TALLY] Reading stock items for company: ${companyName || 'default'}`);

    const xml = `
      <ENVELOPE>
        <HEADER>
          <VERSION>1</VERSION>
          <TALLYREQUEST>Export</TALLYREQUEST>
          <TYPE>Collection</TYPE>
          <ID>StockItemList</ID>
        </HEADER>
        <BODY>
          <DESC>
            <STATICVARIABLES>
              ${companyName ? `<SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>` : ''}
            </STATICVARIABLES>
            <TDL>
              <TDLMESSAGE>
                <COLLECTION NAME="StockItemList">
                  <TYPE>Stock Item</TYPE>
                  <FETCH>NAME, PARENT, CLOSINGBALANCE, CLOSINGRATE, BASEUNITS, NARRATION, MAILINGNAME, LASTMODIFIEDDATE, DESCRIPTION, GUID</FETCH>
                </COLLECTION>
              </TDLMESSAGE>
            </TDL>
          </DESC>
        </BODY>
      </ENVELOPE>
    `;

    const response = await this.sendRequest(xml);
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(response);

    const items = [];
    const collection = result?.ENVELOPE?.BODY?.[0]?.DATA?.[0]?.COLLECTION?.[0];
    if (collection && collection.STOCKITEM) {
      for (const xmlItem of collection.STOCKITEM) {
        try {
          const item = this._parseStockItem(xmlItem);
          if (item) {
            if (filterGroups.length === 0 || filterGroups.includes(item.parent)) {
              items.push(item);
            }
          }
        } catch (err) {
          console.warn('[TALLY] Skipping malformed stock item:', err.message);
        }
      }
    }

    console.log(`[TALLY] Read ${items.length} stock items`);
    return items;
  }

  /**
   * Read stock items changed since a given date (delta sync)
   */
  async readChangedStockItems(companyName, sinceDate) {
    const formattedDate = this.formatDate(sinceDate);
    console.log(`[TALLY] Reading changed stock items since ${formattedDate} for ${companyName}`);

    const xml = `
      <ENVELOPE>
        <HEADER>
          <VERSION>1</VERSION>
          <TALLYREQUEST>Export</TALLYREQUEST>
          <TYPE>Collection</TYPE>
          <ID>ChangedStockItems</ID>
        </HEADER>
        <BODY>
          <DESC>
            <STATICVARIABLES>
              <SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>
            </STATICVARIABLES>
            <TDL>
              <TDLMESSAGE>
                <COLLECTION NAME="ChangedStockItems">
                  <TYPE>Stock Item</TYPE>
                  <FETCH>NAME, PARENT, CLOSINGBALANCE, CLOSINGRATE, BASEUNITS, NARRATION, MAILINGNAME, LASTMODIFIEDDATE, DESCRIPTION, GUID</FETCH>
                  <FILTER>ModifiedFilter</FILTER>
                </COLLECTION>
                <SYSTEM TYPE="Formulae" NAME="ModifiedFilter">$$LASTMODIFIEDDATE > $$Date:"${formattedDate}"</SYSTEM>
              </TDLMESSAGE>
            </TDL>
          </DESC>
        </BODY>
      </ENVELOPE>
    `;

    const response = await this.sendRequest(xml);
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(response);

    const items = [];
    const collection = result?.ENVELOPE?.BODY?.[0]?.DATA?.[0]?.COLLECTION?.[0];
    if (collection && collection.STOCKITEM) {
      for (const xmlItem of collection.STOCKITEM) {
        try {
          const item = this._parseStockItem(xmlItem);
          if (item) items.push(item);
        } catch (err) {
          console.warn('[TALLY] Skipping malformed changed stock item:', err.message);
        }
      }
    }

    console.log(`[TALLY] Found ${items.length} changed stock items`);
    return items;
  }

  /**
   * Read a single stock item by name
   */
  async readSingleStockItem(companyName, itemName) {
    console.log(`[TALLY] Reading stock item: ${itemName}`);

    const xml = `
      <ENVELOPE>
        <HEADER>
          <VERSION>1</VERSION>
          <TALLYREQUEST>Export</TALLYREQUEST>
          <TYPE>Collection</TYPE>
          <ID>SingleStockItem</ID>
        </HEADER>
        <BODY>
          <DESC>
            <STATICVARIABLES>
              <SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>
            </STATICVARIABLES>
            <TDL>
              <TDLMESSAGE>
                <COLLECTION NAME="SingleStockItem">
                  <TYPE>Stock Item</TYPE>
                  <FETCH>NAME, PARENT, CLOSINGBALANCE, CLOSINGRATE, BASEUNITS, NARRATION, MAILINGNAME, LASTMODIFIEDDATE, DESCRIPTION, GUID</FETCH>
                  <FILTER>NameFilter</FILTER>
                </COLLECTION>
                <SYSTEM TYPE="Formulae" NAME="NameFilter">$NAME = "${itemName}"</SYSTEM>
              </TDLMESSAGE>
            </TDL>
          </DESC>
        </BODY>
      </ENVELOPE>
    `;

    const response = await this.sendRequest(xml);
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(response);

    const collection = result?.ENVELOPE?.BODY?.[0]?.DATA?.[0]?.COLLECTION?.[0];
    if (collection && collection.STOCKITEM && collection.STOCKITEM.length > 0) {
      return this._parseStockItem(collection.STOCKITEM[0]);
    }

    return null;
  }

  /**
   * Parse a single stock item XML element into a normalized object
   */
  _parseStockItem(xmlItem) {
    const name = xmlItem.NAME?.[0] || xmlItem.$.NAME;
    if (!name) return null;

    const closingBalance = xmlItem.CLOSINGBALANCE?.[0] || '';
    const closingRate = xmlItem.CLOSINGRATE?.[0] || '';
    const { quantity, unit } = this._parseQuantity(closingBalance);

    return {
      name,
      parent: xmlItem.PARENT?.[0] || null,
      closingBalance: quantity,
      rate: this._parseRate(closingRate),
      baseUnits: unit || xmlItem.BASEUNITS?.[0] || null,
      description: xmlItem.DESCRIPTION?.[0] || xmlItem.NARRATION?.[0] || null,
      alias: xmlItem.MAILINGNAME?.[0] || null,
      lastModifiedDate: xmlItem.LASTMODIFIEDDATE?.[0] || null,
      guid: xmlItem.GUID?.[0] || null
    };
  }

  /**
   * Parse quantity string like "150.00 Nos" into { quantity, unit }
   */
  _parseQuantity(balanceStr) {
    if (!balanceStr || balanceStr === '' || balanceStr === '0') {
      return { quantity: 0, unit: null };
    }

    const str = String(balanceStr).trim();
    const match = str.match(/^(-?[\d,]+\.?\d*)\s*(.*)$/);
    if (match) {
      return {
        quantity: parseFloat(match[1].replace(/,/g, '')) || 0,
        unit: match[2].trim() || null
      };
    }

    const num = parseFloat(str.replace(/,/g, ''));
    return { quantity: isNaN(num) ? 0 : num, unit: null };
  }

  /**
   * Parse rate string, handling Tally's various rate formats
   */
  _parseRate(rateStr) {
    if (!rateStr || rateStr === '' || rateStr === '0') return 0;

    const str = String(rateStr).trim();
    // Handle formats like "150.00/Nos", "₹ 150.00", "₹ 1,200.50/Nos"
    const cleaned = str.replace(/[₹$\s,]/g, '');
    const match = cleaned.match(/-?[\d.]+/);
    return match ? parseFloat(match[0]) || 0 : 0;
  }

  /**
   * Generate report from Tally
   */
  async generateReport(data) {
    console.log('[TALLY] Generating report:', data.reportType);

    if (!await this.isRunning()) {
      throw new Error('Tally is not running');
    }

    // Implementation pending
    return { message: 'Generate report - to be implemented' };
  }

  /**
   * Build voucher XML
   */
  async buildVoucherXML(data) {
    return `
      <ENVELOPE>
        <HEADER>
          <TALLYREQUEST>Import Data</TALLYREQUEST>
        </HEADER>
        <BODY>
          <IMPORTDATA>
            <REQUESTDESC>
              <REPORTNAME>Vouchers</REPORTNAME>
            </REQUESTDESC>
            <REQUESTDATA>
              <TALLYMESSAGE xmlns:UDF="TallyUDF">
                <VOUCHER VCHTYPE="${data.type}" ACTION="Create">
                  <DATE>${this.formatDate(data.date)}</DATE>
                  <VOUCHERTYPENAME>${data.type}</VOUCHERTYPENAME>
                  <VOUCHERNUMBER>${data.voucherNumber}</VOUCHERNUMBER>
                  <PARTYLEDGERNAME>${data.party}</PARTYLEDGERNAME>
                  ${this.buildLedgerEntries(data.ledgers)}
                </VOUCHER>
              </TALLYMESSAGE>
            </REQUESTDATA>
          </IMPORTDATA>
        </BODY>
      </ENVELOPE>
    `.trim();
  }

  /**
   * Build ledger entries XML
   */
  buildLedgerEntries(ledgers) {
    return ledgers.map(ledger => `
      <ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>${ledger.name}</LEDGERNAME>
        <AMOUNT>${ledger.amount}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>
    `).join('');
  }

  /**
   * Format date for Tally (YYYYMMDD)
   */
  formatDate(dateString) {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  /**
   * Parse voucher response from Tally
   */
  async parseVoucherResponse(xmlResponse) {
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(xmlResponse);

    const created = result?.ENVELOPE?.BODY?.[0]?.IMPORTRESULT?.[0]?.CREATED?.[0];
    const errors = result?.ENVELOPE?.BODY?.[0]?.IMPORTRESULT?.[0]?.ERRORS;

    if (errors && errors.length > 0) {
      throw new Error(`Tally Error: ${errors[0]}`);
    }

    return {
      created: created === '1',
      masterId: result?.ENVELOPE?.BODY?.[0]?.IMPORTRESULT?.[0]?.LASTMID?.[0] || null
    };
  }

  /**
   * Get version-specific configuration
   */
  getVersionConfig() {
    const version = this.tallyVersion || 'ERP9';
    return tallyVersions[version] || tallyVersions.ERP9;
  }
}

module.exports = TallyService;
