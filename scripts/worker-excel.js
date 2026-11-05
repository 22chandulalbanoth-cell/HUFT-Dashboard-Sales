/**
 * HUFT Sales Dashboard - Background Web Worker for Excel & CSV Processing
 * Offloads heavy SheetJS workbook parsing and normalization from the UI thread,
 * ensuring zero page freezing or "Page Unresponsive" browser warnings.
 */

// Load SheetJS inside Worker
try {
  importScripts('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
} catch (e) {
  try {
    importScripts('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
  } catch (e2) {}
}

function parseCSVText(text) {
  const out = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; }
      else field += c;
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some(v => String(v).trim() !== '')) out.push(row);
      row = []; field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.some(v => String(v).trim() !== '')) out.push(row);
  }
  return out;
}

function normalizeWorkbookRows(matrix) {
  if (!Array.isArray(matrix) || !matrix.length) return [];
  const norm = v => String(v ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  const headerTokens = ['date','date time','order date','point of sale','store','store name','product','product name','category','product category','brand','quantity','qty','subtotal','sale value','sales value','customer','customer name','customer id','customer phone','customer/phone','partner','partner name','client','client name','contact','contact name','phone','mobile','order ref','order reference','order id','receipt number','ticket number'];
  let headerIndex = -1;
  for (let ri = 0; ri < Math.min(matrix.length, 10); ri++) {
    const cells = (matrix[ri] || []).map(norm);
    const hits = cells.filter(v => headerTokens.includes(v) || headerTokens.some(t => v === t + ' name')).length;
    if (hits >= 3) { headerIndex = ri; break; }
  }
  const hasHeaders = headerIndex >= 0;
  const headers = hasHeaders ? (matrix[headerIndex] || []).map(v => String(v ?? '').trim()) : [];
  const excelCol = i => { let n = i + 1, out = ''; while (n) { const rem = (n - 1) % 26; out = String.fromCharCode(65 + rem) + out; n = Math.floor((n - 1) / 26); } return out; };
  const dataStart = hasHeaders ? headerIndex + 1 : 0;
  const nonEmpty = matrix.slice(dataStart).filter(a => Array.isArray(a) && a.some(v => String(v ?? '').trim() !== ''));
  if (hasHeaders && nonEmpty.length && nonEmpty[0] === matrix[headerIndex]) nonEmpty.shift();
  let lastDate = '', lastStore = '';
  const normalized = nonEmpty.map(values => {
    const r = {};
    if (headers.length) headers.forEach((h, i) => { if (h) r[h] = values[i] === undefined ? '' : values[i]; });
    values.forEach((v, i) => { r['Column ' + excelCol(i)] = v === undefined ? '' : v; });
    const pick = (pos, keys) => {
      if (hasHeaders) { for (const k of keys) { if (r[k] !== undefined && String(r[k]).trim() !== '') return r[k]; } }
      if (String(values[pos] ?? '').trim() !== '') return values[pos];
      for (const k of keys) { if (r[k] !== undefined && String(r[k]).trim() !== '') return r[k]; }
      return '';
    };
    const headerToken = k => String(k || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const firstMatching = patterns => {
      for (const k of Object.keys(r)) {
        const token = headerToken(k);
        if (patterns.some(p => p.test(token)) && String(r[k] ?? '').trim() !== '') return r[k];
      }
      return '';
    };
    const firstNonBlank = keys => { for (const k of keys) { if (r[k] !== undefined && String(r[k]).trim() !== '') return r[k]; } return ''; };
    if (!r['Order Ref']) r['Order Ref'] = firstNonBlank(['Order Reference','Order ID','Order Number','Receipt Number','Ticket Number','POS Order Reference','Sales Order','Sales Order Reference','Order Ref']) || firstMatching([/^order(id|number|ref|reference)$/,/^receipt(number|no|id)$/,/^ticket(number|no|id)$/]);
    if (!r['Customer']) r['Customer'] = firstNonBlank(['Customer Name','Client','Client Name','Partner','Partner Name','Customer/Phone','Customer Phone','Phone','Mobile','Mobile Number','Phone Number','Contact','Contact Name','Customer ID','Partner ID']) || firstMatching([/^customer(name|id|code|phone|mobile|ref|reference)?$/,/^client(name|id|phone)?$/,/^partner(name|id|phone)?$/,/^contact(name|id|phone)?$/,/^(customer|client|partner|contact)(phone|mobile)$/,/^(phone|mobile)(number|no)?$/]);
    if (!r['Customer/Phone']) r['Customer/Phone'] = firstNonBlank(['Customer/Phone','Customer Phone','Phone','Mobile','Mobile Number','Phone Number','Partner/Phone','Contact Phone']) || firstMatching([/^(customer|partner|client)(phone|mobile)$/,/^(phone|mobile)(number|no)?$/]) || r['Column H'] || '';
    const dateValue = firstNonBlank(['Date','Date/Time','Order Date','Order date']) || pick(1, ['Date','Date/Time','Order Date','Order date']);
    const storeValue = firstMatching([/^(?:pointofsale|store|storename|pos|posname)$/,/^channel(?:\d+)?$/]) || pick(2, ['Point of Sale','Store','Store Name','POS','Channel']);
    if (String(dateValue).trim() !== '') lastDate = dateValue;
    if (String(storeValue).trim() !== '') lastStore = storeValue;
    r['Date'] = dateValue !== '' ? dateValue : lastDate;
    r['Point of Sale'] = storeValue !== '' ? storeValue : lastStore;
    r['Order Lines/Product/Name'] = pick(9, ['Order Lines/Product/Name','Product','Product Name','Product/Name']);
    r['Customer'] = firstNonBlank(['Customer','Customer Name','Client','Client Name','Partner','Partner Name','Contact Name']) || pick(6, ['Customer','Customer Name','Client','Client Name','Partner','Partner Name','Contact Name']) || r['Customer'] || r['Column G'] || '';
    r['Customer/Phone'] = r['Customer/Phone'] || pick(7, ['Customer/Phone','Customer Phone','Phone','Mobile','Mobile Number','Phone Number','Partner/Phone','Contact Phone']) || r['Column H'] || '';
    r['_customer'] = String(r['Customer'] || '').trim();
    r['Order Lines/Product/Product Category'] = pick(10, ['Order Lines/Product/Product Category','Category','Product Category']);
    r['Order Lines/Product/Brand'] = pick(12, ['Order Lines/Product/Brand','Brand','Product Brand']);
    r['Order Lines/Quantity'] = pick(13, ['Order Lines/Quantity','Quantity','Qty','Total Qty.','Total Qty','Total Quantity']);
    r['Order Lines/Subtotal'] = pick(16, ['Order Lines/Subtotal','Subtotal','Sale Value','Sales Value','Total']);
    r['Order Lines/Discount (%)'] = pick(14, ['Order Lines/Discount (%)','Discount (%)','Discount Percent','Discount']);
    r['Payment Method'] = pick(21, ['Payment Method','Payment Mode','Payment Method Name','Payment']);
    const employeeFromAC = hasHeaders ? '' : String(values[28] ?? r['Column AC'] ?? '').trim();
    const employeeHeaderKeys = Object.keys(r).filter(k => {
      const t = headerToken(k);
      return (t === 'employees' || t.endsWith('employees') || t === 'employee' || t === 'employeename' ||
        t === 'salesperson' || t === 'salespersonname' || t === 'salespersonid' || t === 'salesemployee' || t === 'salesrep' || t === 'salesrepresentative' || t === 'salesagent' || t === 'cashier' || t === 'cashiername') &&
        String(r[k] ?? '').trim() !== '';
    });
    const employeeFromNamedHeader = employeeHeaderKeys.map(k => r[k]).find(v => String(v ?? '').trim() !== '');
    r['Employees'] = String(employeeFromNamedHeader ?? '').trim() || employeeFromAC || String(r['Employees'] ?? '').trim();
    r['_employee'] = String(r['Employees'] || employeeFromAC || employeeFromNamedHeader || '').trim();
    const namedInvoice = firstNonBlank(['Invoice/Display Name','Invoice Display Name','Invoice Number','Invoice/Number','Bill Number','Invoice Name']);
    r['Invoice/Display Name'] = namedInvoice || pick(5, ['Invoice/Display Name','Invoice Display Name','Invoice Number','Invoice/Number','Bill Number','Invoice Name']) || r['Column F'] || '';
    if (namedInvoice) r['Invoice Name'] = namedInvoice;
    const invoiceStatus = firstMatching([/^invoicestatus$/,/^status$/]);
    if (invoiceStatus !== '' && r['Invoice Status'] === undefined) r['Invoice Status'] = invoiceStatus;
    r['_invoiceDisplayName'] = String(namedInvoice || r['Column F'] || r['Invoice/Display Name'] || '').trim();
    if (r['Order Lines/Product/Sales Price'] === undefined) r['Order Lines/Product/Sales Price'] = pick(15, ['Order Lines/Product/Sales Price','Sales Price','Unit Price','Price']);
    return r;
  });
  const lastInvoiceByOrder = new Map();
  let lastInvoice = '', lastDateKey = '', lastCustomerKey = '';
  for (const r of normalized) {
    const orderRef = String(r['Column A'] || r['Order Ref'] || '').trim();
    const dateKey = String(r['_key'] || r['Date'] || '').slice(0, 10);
    const customerKey = String(r['_customer'] || r['Customer'] || '').trim().toLowerCase();
    let inv = String(r['Column F'] || r['_invoiceDisplayName'] || r['Invoice/Display Name'] || '').trim();
    if (inv) {
      if (orderRef) lastInvoiceByOrder.set(orderRef, inv);
      lastInvoice = inv; lastDateKey = dateKey; lastCustomerKey = customerKey;
      continue;
    }
    let inherited = orderRef ? lastInvoiceByOrder.get(orderRef) : '';
    if (!inherited && lastInvoice && dateKey === lastDateKey && customerKey === lastCustomerKey) inherited = lastInvoice;
    if (inherited) {
      r['Column F'] = inherited;
      r['Invoice/Display Name'] = inherited;
      r['_invoiceDisplayName'] = inherited;
      if (orderRef) lastInvoiceByOrder.set(orderRef, inherited);
    }
  }
  return normalized;
}

self.onmessage = function(e) {
  const { fileData, isCSV, fileName } = e.data;
  try {
    self.postMessage({ type: 'progress', percent: 25, stage: 'Reading workbook rows…' });
    let matrix;
    if (isCSV) {
      matrix = parseCSVText(fileData);
    } else {
      if (typeof XLSX === 'undefined' || !XLSX.read) {
        throw new Error('SheetJS library is loading. Please retry in a few seconds.');
      }
      const wb = XLSX.read(fileData, { type: 'array', cellDates: true });
      if (!wb.SheetNames || !wb.SheetNames.length) throw new Error('No worksheet was found in this workbook.');
      const ws = wb.Sheets[wb.SheetNames[0]];
      matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: false });
    }

    self.postMessage({ type: 'progress', percent: 60, stage: 'Mapping columns and validating sales records…' });
    const rows = normalizeWorkbookRows(matrix);

    self.postMessage({
      type: 'complete',
      rows: rows,
      rowCount: rows.length,
      fileName: fileName
    });
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message || String(err) });
  }
};
