/**
 * Tally XML Builder
 * Converts JSON data to Tally XML format
 */

class TallyXMLBuilder {
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
   * Escape XML special characters
   */
  escapeXml(str) {
    if (!str) return '';
    return str.toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Build voucher XML
   */
  buildVoucher(data) {
    const {
      type,
      date,
      voucherNumber,
      party,
      narration,
      ledgers = [],
      items = []
    } = data;

    const ledgerEntries = ledgers.map(ledger => `
      <ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>${this.escapeXml(ledger.name)}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>${ledger.amount < 0 ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
        <AMOUNT>${ledger.amount}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>
    `).join('');

    const inventoryEntries = items && items.length > 0 ? items.map(item => `
      <ALLINVENTORYENTRIES.LIST>
        <STOCKITEMNAME>${this.escapeXml(item.name)}</STOCKITEMNAME>
        <ISDEEMEDPOSITIVE>${item.quantity < 0 ? 'No' : 'Yes'}</ISDEEMEDPOSITIVE>
        <RATE>${item.rate}</RATE>
        <AMOUNT>${item.amount}</AMOUNT>
        <ACTUALQTY>${item.quantity} ${item.unit || 'Nos'}</ACTUALQTY>
        <BILLEDQTY>${item.quantity} ${item.unit || 'Nos'}</BILLEDQTY>
      </ALLINVENTORYENTRIES.LIST>
    `).join('') : '';

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
          <VOUCHER REMOTEID="" VCHKEY="" VCHTYPE="${this.escapeXml(type)}" ACTION="Create" OBJVIEW="Invoice Voucher View">
            <DATE>${this.formatDate(date)}</DATE>
            <VOUCHERTYPENAME>${this.escapeXml(type)}</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${this.escapeXml(voucherNumber)}</VOUCHERNUMBER>
            <PARTYLEDGERNAME>${this.escapeXml(party)}</PARTYLEDGERNAME>
            ${narration ? `<NARRATION>${this.escapeXml(narration)}</NARRATION>` : ''}
            ${ledgerEntries}
            ${inventoryEntries}
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>
    `.trim();
  }

  /**
   * Build ledger creation XML
   */
  buildLedger(data) {
    const {
      name,
      parent = 'Sundry Debtors',
      openingBalance = 0,
      address = '',
      city = '',
      state = '',
      pincode = '',
      phone = '',
      email = '',
      gstin = ''
    } = data;

    return `
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>All Masters</REPORTNAME>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <LEDGER NAME="${this.escapeXml(name)}" ACTION="Create">
            <NAME>${this.escapeXml(name)}</NAME>
            <PARENT>${this.escapeXml(parent)}</PARENT>
            ${openingBalance ? `<OPENINGBALANCE>${openingBalance}</OPENINGBALANCE>` : ''}
            ${address ? `<ADDRESS>${this.escapeXml(address)}</ADDRESS>` : ''}
            ${city ? `<CITY>${this.escapeXml(city)}</CITY>` : ''}
            ${state ? `<STATE>${this.escapeXml(state)}</STATE>` : ''}
            ${pincode ? `<PINCODE>${this.escapeXml(pincode)}</PINCODE>` : ''}
            ${phone ? `<PHONE>${this.escapeXml(phone)}</PHONE>` : ''}
            ${email ? `<EMAIL>${this.escapeXml(email)}</EMAIL>` : ''}
            ${gstin ? `<PARTYGSTIN>${this.escapeXml(gstin)}</PARTYGSTIN>` : ''}
          </LEDGER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>
    `.trim();
  }

  /**
   * Build stock item creation XML
   */
  buildStockItem(data) {
    const {
      name,
      parent = 'Primary',
      unit = 'Nos',
      openingBalance = 0,
      openingRate = 0,
      openingValue = 0,
      gstRate = 0
    } = data;

    return `
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>All Masters</REPORTNAME>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <STOCKITEM NAME="${this.escapeXml(name)}" ACTION="Create">
            <NAME>${this.escapeXml(name)}</NAME>
            <PARENT>${this.escapeXml(parent)}</PARENT>
            <BASEUNITS>${this.escapeXml(unit)}</BASEUNITS>
            ${openingBalance ? `<OPENINGBALANCE>${openingBalance}</OPENINGBALANCE>` : ''}
            ${openingRate ? `<OPENINGRATE>${openingRate}</OPENINGRATE>` : ''}
            ${openingValue ? `<OPENINGVALUE>${openingValue}</OPENINGVALUE>` : ''}
            ${gstRate ? `<GSTRATE>${gstRate}</GSTRATE>` : ''}
          </STOCKITEM>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>
    `.trim();
  }

  /**
   * Build export/read ledgers XML
   */
  buildReadLedgers(filter = {}) {
    const { group = '', name = '' } = filter;

    return `
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>List of Ledgers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        ${group ? `<SVFROMDATE>${group}</SVFROMDATE>` : ''}
      </STATICVARIABLES>
    </DESC>
  </BODY>
</ENVELOPE>
    `.trim();
  }

  /**
   * Build export/read stock items XML
   */
  buildReadStockItems() {
    return `
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>List of Stock Items</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
    </DESC>
  </BODY>
</ENVELOPE>
    `.trim();
  }

  /**
   * Build report generation XML
   */
  buildReport(reportType, fromDate, toDate) {
    const reportMap = {
      'day-book': 'Day Book',
      'sales-register': 'Sales Register',
      'purchase-register': 'Purchase Register',
      'stock-summary': 'Stock Summary',
      'trial-balance': 'Trial Balance'
    };

    const reportName = reportMap[reportType] || 'Day Book';

    return `
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>${reportName}</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVFROMDATE>${this.formatDate(fromDate)}</SVFROMDATE>
        <SVTODATE>${this.formatDate(toDate)}</SVTODATE>
      </STATICVARIABLES>
    </DESC>
  </BODY>
</ENVELOPE>
    `.trim();
  }
}

module.exports = new TallyXMLBuilder();
