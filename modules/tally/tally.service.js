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
   * Read stock items from Tally
   */
  async readStockItems(data) {
    console.log('[TALLY] Reading stock items');

    if (!await this.isRunning()) {
      throw new Error('Tally is not running');
    }

    // Implementation pending
    return { message: 'Read stock items - to be implemented' };
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
