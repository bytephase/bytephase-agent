const xml2js = require('xml2js');

/**
 * Tally XML Parser
 * Converts Tally XML responses to JSON
 */

class TallyXMLParser {
  constructor() {
    this.parser = new xml2js.Parser({
      explicitArray: false,
      mergeAttrs: true,
      trim: true
    });
  }

  /**
   * Parse generic Tally XML response
   */
  async parse(xmlString) {
    try {
      return await this.parser.parseStringPromise(xmlString);
    } catch (error) {
      throw new Error(`XML Parse Error: ${error.message}`);
    }
  }

  /**
   * Parse voucher creation response
   */
  async parseVoucherResponse(xmlString) {
    const result = await this.parse(xmlString);
    const importResult = result?.ENVELOPE?.BODY?.IMPORTRESULT;

    if (!importResult) {
      throw new Error('Invalid Tally response format');
    }

    // Check for errors
    if (importResult.ERRORS) {
      const errors = Array.isArray(importResult.ERRORS)
        ? importResult.ERRORS
        : [importResult.ERRORS];
      throw new Error(`Tally Error: ${errors.join(', ')}`);
    }

    return {
      success: true,
      created: importResult.CREATED === '1',
      masterId: importResult.LASTMID || null,
      voucherId: importResult.LASTVCHID || null
    };
  }

  /**
   * Parse ledger creation response
   */
  async parseLedgerResponse(xmlString) {
    const result = await this.parse(xmlString);
    const importResult = result?.ENVELOPE?.BODY?.IMPORTRESULT;

    if (!importResult) {
      throw new Error('Invalid Tally response format');
    }

    if (importResult.ERRORS) {
      const errors = Array.isArray(importResult.ERRORS)
        ? importResult.ERRORS
        : [importResult.ERRORS];
      throw new Error(`Tally Error: ${errors.join(', ')}`);
    }

    return {
      success: true,
      created: importResult.CREATED === '1',
      masterId: importResult.LASTMID || null
    };
  }

  /**
   * Parse stock item creation response
   */
  async parseStockItemResponse(xmlString) {
    return await this.parseLedgerResponse(xmlString); // Same format
  }

  /**
   * Parse ledgers list
   */
  async parseLedgersList(xmlString) {
    const result = await this.parse(xmlString);
    const collection = result?.ENVELOPE?.BODY?.DATA?.COLLECTION;

    if (!collection || !collection.LEDGER) {
      return [];
    }

    const ledgers = Array.isArray(collection.LEDGER)
      ? collection.LEDGER
      : [collection.LEDGER];

    return ledgers.map(ledger => ({
      name: ledger.NAME || ledger._ || '',
      parent: ledger.PARENT || '',
      alias: ledger.ALIAS || '',
      guid: ledger.GUID || ''
    }));
  }

  /**
   * Parse stock items list
   */
  async parseStockItemsList(xmlString) {
    const result = await this.parse(xmlString);
    const collection = result?.ENVELOPE?.BODY?.DATA?.COLLECTION;

    if (!collection || !collection.STOCKITEM) {
      return [];
    }

    const items = Array.isArray(collection.STOCKITEM)
      ? collection.STOCKITEM
      : [collection.STOCKITEM];

    return items.map(item => ({
      name: item.NAME || item._ || '',
      parent: item.PARENT || '',
      alias: item.ALIAS || '',
      baseUnit: item.BASEUNITS || '',
      guid: item.GUID || ''
    }));
  }

  /**
   * Parse day book report
   */
  async parseDayBook(xmlString) {
    const result = await this.parse(xmlString);
    const vouchers = result?.ENVELOPE?.BODY?.DATA?.COLLECTION?.VOUCHER;

    if (!vouchers) {
      return [];
    }

    const voucherList = Array.isArray(vouchers) ? vouchers : [vouchers];

    return voucherList.map(voucher => ({
      date: voucher.DATE || '',
      voucherType: voucher.VOUCHERTYPENAME || '',
      voucherNumber: voucher.VOUCHERNUMBER || '',
      party: voucher.PARTYLEDGERNAME || '',
      amount: parseFloat(voucher.AMOUNT || 0),
      narration: voucher.NARRATION || ''
    }));
  }

  /**
   * Parse trial balance
   */
  async parseTrialBalance(xmlString) {
    const result = await this.parse(xmlString);
    const ledgers = result?.ENVELOPE?.BODY?.DATA?.COLLECTION?.LEDGER;

    if (!ledgers) {
      return [];
    }

    const ledgerList = Array.isArray(ledgers) ? ledgers : [ledgers];

    return ledgerList.map(ledger => ({
      name: ledger.NAME || '',
      parent: ledger.PARENT || '',
      openingBalance: parseFloat(ledger.OPENINGBALANCE || 0),
      closingBalance: parseFloat(ledger.CLOSINGBALANCE || 0),
      debit: parseFloat(ledger.DEBIT || 0),
      credit: parseFloat(ledger.CREDIT || 0)
    }));
  }

  /**
   * Parse stock summary
   */
  async parseStockSummary(xmlString) {
    const result = await this.parse(xmlString);
    const items = result?.ENVELOPE?.BODY?.DATA?.COLLECTION?.STOCKITEM;

    if (!items) {
      return [];
    }

    const itemList = Array.isArray(items) ? items : [items];

    return itemList.map(item => ({
      name: item.NAME || '',
      closingBalance: parseFloat(item.CLOSINGBALANCE || 0),
      closingValue: parseFloat(item.CLOSINGVALUE || 0),
      closingRate: parseFloat(item.CLOSINGRATE || 0),
      unit: item.BASEUNITS || ''
    }));
  }

  /**
   * Check if XML contains errors
   */
  hasErrors(xmlString) {
    return xmlString.includes('<ERRORS>') || xmlString.includes('<ERROR>');
  }

  /**
   * Extract error messages from XML
   */
  async extractErrors(xmlString) {
    const result = await this.parse(xmlString);
    const errors = result?.ENVELOPE?.BODY?.IMPORTRESULT?.ERRORS;

    if (!errors) {
      return [];
    }

    return Array.isArray(errors) ? errors : [errors];
  }
}

module.exports = new TallyXMLParser();
