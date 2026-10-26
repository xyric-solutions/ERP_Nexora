import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';

// This is a review transcription, not an ERP seed or import script.
const outputDir = path.dirname(fileURLToPath(import.meta.url));
const reviewDoc = await fs.readFile(path.resolve(outputDir, '../../docs/architecture/nominal-catalog-import-review.md'), 'utf8');
const sectionLines = reviewDoc.split(/\r?\n/).filter(line => /^\| [^|]+ \| \d{4} \|/.test(line));
const sections = sectionLines.map(line => line.split('|').slice(1, -1).map(cell => cell.trim()));
const categoryLines = reviewDoc.split(/\r?\n/).filter(line => /^\| [^|]+ \| (asset|liability|equity|revenue|expense) \| \d+ \|/.test(line));
const categories = categoryLines.map(line => {
  const [name, type, count] = line.split('|').slice(1, -1).map(cell => cell.trim());
  return [name, type, Number(count), 'Screenshot 4; category spelling normalized', 'REVIEW REQUIRED'];
});
const bySection = new Map(sections.map(([category, code, name]) => [code, { category, name }]));
const types = new Map(categories.map(([name, type]) => [name, type]));
const pages = [
`310109|Drawings
310110|Share Capital
310108|Partner Distributions (B)
310107|Partner Distributions (A)
310106|Partner Capital (B)
310105|Partner Capital (A)
310104|Paid in capital or surplus
310103|Ordinary shares
310101|Capital
310201|General Reserves
310301|Accumulated Reserves
110101|Accruals
110201|Deferred Income
110301|Long term Loans payable
110401|Other non-current liabilities
110501|Provision for liabilities
110601|Shareholder Loan Payable
120103|Post-Dated Cheques Issued
120102|Customer Withholding Tax
120101|Trade Creditors
120201|Other Creditors
120301|General Sales Tax
120401|WHT Deductions
120501|Current Tax Liability
120603|Payroll payable
120602|Loan Payable
120601|Insurance Payable
120604|Expenses Payable
120701|Payroll Tax and Social Security
120802|Faraz Payable
120801|Short Term Loans Payable
210101|Property
210102|Accumulated Depreciation Property
210201|Plant and Machinery
210202|Plant and Machinery Additions
210203|Accumulated Depreciation Plant and Machinery
210302|Office Equipments Additions
210303|Accumulated Depreciation Office Equipments
210301|Office Equipments
210402|Furniture and Fixtures Additions
210403|Accumulated Depreciation Furniture and Fixture
210401|Furniture and Fixtures
210502|Vehicles Additions
210503|Accumulated Depreciation Vehicles
210501|Vehicles
210602|Accumulated Depreciation Other Tangible Assets
210601|Other Tangible Assets
220101|Goodwill
220201|Intangible Assets
220301|Investments
220401|Licences
220502|Other Non-current Assets
220501|Other intangible assets
220601|Prepayments
220701|Accrued Income
220802|Rent Deposits
220801|Security Deposits
220803|Other Deposits
230101|Stock
230203|Post-Dated Cheques Received
230202|Allowance for bad debts
230201|Debtors
230301|Other Debtors
230401|Investments - Other
230502|Loans to Employees
230501|Loans To Directors
230504|Loans to Shareholders
230503|Loans to Others
230603|Research and Development Costs
230602|Undeposited Funds
230601|Other current assets
230703|Prepaid rent
230702|Prepaid Insurance
230701|Prepaid Expense
230801|Withholding Income Tax (Advance)
230906|Transit Bank (AED)
230905|Petty Cash (Mr. Omar Mehmood)
230904|Js Bank
230903|Transit Bank (PKR)
230902|Meezan Bank
230901|Cash on hand
230907|Js Bank (USD)
410105|Sale Type D
410104|Sale Type C
410103|Sale Type B
410102|Sales Type A
410101|IT & Software Services Income
410202|Fees Income - A
410201|Fees Income
410205|Fees Income - D
410204|Fees Income - C
410203|Fees Income - B
410304|Trade Offer Sale
410303|Retail Margin Sale
410302|Sale Receipts Discount
410301|Discount Allowed
510101|Cost of Labour
510105|Sub Contractors
510104|Daily Wages Labour
510103|Productive Labour`,
`510104|Daily Wages Labour
510206|Opening Stock
510205|Miscellaneous Purchases
510204|Purchases
510203|Materials imported
510202|Cost of IT & Software Services
510201|Supplies and materials
510207|Closing Stock
510301|Equipment rental
510401|Other Cost of Sales
510504|Trade Offer Purchase
510503|Retail Margin Purchase
510502|Purchase Payment Discount
510501|Discount Received
610101|Import Duty
610206|Postage
610205|Packaging
610204|Delivery
610203|Freight
610202|Shipping
610201|Shipping, Freight and Delivery
610301|Sales Commissions
610401|Other Direct Costs
710108|Employers Pensions
710107|Employers Provident Fund
710106|Employer Social Security
710105|Wages - Casual
710104|Wages - Regular
710103|Staff Salaries
710102|Directors Salaries
710101|Wages & Salaries
710204|Recruitment Expenses
710203|Training Costs
710202|Uniforms
710201|Staff Costs
710304|General Rates
710303|Water Rates
710302|Rent
710301|Premises Expenses
710308|Other Heating Costs
710307|Municipal Corporation charges
710306|Cleaning
710305|Premises Insurance
710404|Oil - Heating
710403|Gas
710402|Electricity
710401|Light & Heat
710507|Parking Tickets
710506|Miscellaneous Motor Expenses
710505|Vehicle Insurance
710504|Vehicle Licences
710503|Vehicle Repair and Servicing
710502|Vehicle Fuel
710501|Motor Expenses
710601|Travel Expenses
710608|Subsistence
710607|Hotels
710606|Train / Air Fare
710605|Car Hire
710604|Travelling
710603|Petrol Allowance
710602|Mileage Claims
710705|Round Off
710701|Finance costs
710709|Exchange Revaluation Losses
710704|Currency Charges
710708|Exchange Revaluation Gains
710707|Realised Exchange Losses
710703|Bank Fees
710706|Realised Exchange Gains
710702|Bank Charges
710802|Overdraft Interest
710801|Hire Purchase Interest
710903|Postage and Carriage
710902|Printing
710901|Printing, postage and stationery
710904|Stationery
711006|Books etc.
711005|P.R. Literature and Brochures
711004|Gifts and Samples
711003|Sales Promotions
711002|Advertising
711001|Advertising and PR
711101|Telephone and Fax
711103|Mobile Phone Charges
711102|Internet charges
711206|Professional Fees
711205|Consultancy Fees
711204|Accountancy Fees
711203|Audit Fees
711202|Legal Fees
711201|Legal and Professional Fees
711207|Management Charges Payable
711314|Google Play
711306|Figma Subscription
711313|Heygen Technology Inc. Subscription
711305|Massive.Com Data API Subscription
711304|Whop*Travelling Trader Subscription
711312|Magicfruit Subscription
711303|Anthropic Claude Subscription`,
`711302|Software Subscriptions
711309|GODADDY Subscription
711301|Subscriptions
711308|HIGGSFIELD Subscription
711315|Proton VPN
711307|Cursor AI Powered Data API Subscription
711314|Google Play
711306|Figma Subscription
711404|Staff Party
711403|Staff Meals
711402|Canteen Expenses
711401|Entertainment
711405|Refreshments
711501|Equipment Hire
711601|Insurance
711701|Bad Debt
711801|Repair and Maintenance
711901|Office Machine Maintenance
712001|Donations
712101|Miscellaneous Expense
720102|Loss (Gain) on disposal of assets
720101|Other Expense
720204|Depreciation Furniture and Fixture
720203|Depreciation Office Equipments
720202|Depreciation Plant and Machinery
720201|Depreciation Property
720207|Depreciation
720206|Depreciation Other Tangible Assets
720205|Depreciation Vehicles
730101|Loan Interest paid
420104|Other Income
420103|Investment Income
420102|Interest earned
420101|Dividend income
420105|Rent received
740102|Corporation Tax
740101|Income Tax`
];

const uncertainLabels = new Map([
  ['120802', 'Confirm personal name and spelling from original image.'],
  ['230905', 'Confirm personal name and spelling from original image.'],
  ['711304', 'Confirm merchant label, punctuation and spacing from original image.'],
  ['711312', 'Subscription vendor label is unclear in the reduced screenshot; verify original.'],
]);
const raw = pages.flatMap((page, index) => page.split('\n').map((line, row) => {
  const [code, name] = line.split('|');
  const section = bySection.get(code.slice(0, 4));
  assert(section, `Missing section for ${code}`);
  return [section.category, code.slice(0, 4), section.name, code, name,
    types.get(section.category), `Screenshot ${index + 1}`, row + 1,
    'REVIEW REQUIRED', uncertainLabels.get(code) ?? (index < 2 ? 'Transcribed from reduced image; verify code and exact label.' : '')];
}));
assert.deepEqual(pages.map(page => page.split('\n').length), [100, 100, 37]);
assert.equal(categories.length, 14);
assert.equal(sections.length, 78);
assert.equal(new Set(sections.map(row => row[1])).size, 78);
const nominalByCode = new Map();
for (const row of raw) {
  if (!nominalByCode.has(row[3])) nominalByCode.set(row[3], []);
  nominalByCode.get(row[3]).push(row);
}
const issues = [
  ['SOURCE_RESOLUTION', '', 'Screenshots 1 and 2', 'Reduced images require verification of codes and exact labels before database import.'],
  ['MISSING_METADATA', '', 'All screenshots', 'Tenant/company, account currencies and control/manual-posting flags are not established by these images.'],
  ['MISSING_CATEGORY_CODES', '', 'Screenshot 4', 'Category identifiers/codes are not shown; none have been invented.'],
];
const nominals = [...nominalByCode].map(([code, rows]) => {
  assert(rows.every(row => row[0] === rows[0][0] && row[2] === rows[0][2] && row[4] === rows[0][4]), `Conflicting input code ${code}`);
  if (rows.length > 1) issues.push(['REPEATED_SOURCE_ROW', code, rows.map(row => row[6]).join('; '), 'Same code/name repeated across screenshots; represented once in Nominals and retained in Source Rows.']);
  const row = rows[0];
  return [...row.slice(0, 6), rows.map(r => r[6]).join('; '), rows.length, 'REVIEW REQUIRED', row[9]];
});
for (const [code, note] of uncertainLabels) issues.push(['UNCLEAR_LABEL', code, 'Nominals', note]);
assert.equal(nominals.length, 234);
assert.deepEqual([...nominalByCode].filter(([, rows]) => rows.length > 1).map(([code]) => code).sort(), ['510104', '711306', '711314']);
issues.push(['COUNT_DIFFERENCE', '', 'Screenshot page totals', '237 visible row occurrences yield 234 distinct codes after three repeated source rows. No absent accounts were invented to reach 237.']);

const nominalHeader = ['Category', 'Section Code', 'Section', 'Nominal Code', 'Nominal Name', 'ERP Account Type', 'Source', 'Source Occurrences', 'Review Status', 'Review Note'];
const rawHeader = [...nominalHeader.slice(0, 7), 'Row in Screenshot', ...nominalHeader.slice(8)];
const sectionRows = sections.map(([category, code, name]) => [category, code, name, types.get(category), 'Screenshot 4', 'REVIEW REQUIRED']);
const sheets = [
  { name: 'Nominals', headers: nominalHeader, rows: nominals, widths: [30, 15, 38, 15, 58, 19, 29, 20, 22, 82] },
  { name: 'Sections', headers: ['Category', 'Section Code', 'Section', 'ERP Account Type', 'Source', 'Review Status'], rows: sectionRows, widths: [30, 15, 42, 19, 20, 22] },
  { name: 'Categories', headers: ['Category', 'ERP Account Type', 'Section Count', 'Source / Mapping Note', 'Review Status'], rows: categories, widths: [30, 19, 18, 65, 22] },
  { name: 'Source Rows', headers: rawHeader, rows: raw, widths: [30, 15, 38, 15, 58, 19, 29, 20, 22, 82] },
  { name: 'Review', headers: ['Issue', 'Nominal Code', 'Source', 'Details'], rows: issues, widths: [30, 15, 35, 135] },
];
const workbook = Workbook.create();
for (const spec of sheets) {
  const sheet = workbook.worksheets.add(spec.name);
  sheet.showGridLines = false;
  const count = spec.rows.length + 1;
  const range = sheet.getRangeByIndexes(0, 0, count, spec.headers.length);
  range.values = [spec.headers, ...spec.rows];
  range.format.font = { name: 'Arial', size: 10, color: '#202B39' };
  range.format.rowHeight = 19;
  range.format.verticalAlignment = 'center';
  const header = sheet.getRangeByIndexes(0, 0, 1, spec.headers.length);
  header.format.fill = '#173C56';
  header.format.font = { name: 'Arial', size: 10, bold: true, color: '#FFFFFF' };
  header.format.rowHeight = 30;
  header.format.horizontalAlignment = 'center';
  spec.widths.forEach((width, col) => { sheet.getRangeByIndexes(0, col, count, 1).format.columnWidth = width; });
  for (let col = 0; col < spec.headers.length; col++) {
    if (spec.headers[col].endsWith('Code')) sheet.getRangeByIndexes(1, col, spec.rows.length, 1).setNumberFormat('@');
    if (['Source Occurrences', 'Section Count', 'Row in Screenshot'].includes(spec.headers[col])) sheet.getRangeByIndexes(1, col, spec.rows.length, 1).setNumberFormat('0');
    if (spec.headers[col] === 'Review Status') sheet.getRangeByIndexes(1, col, spec.rows.length, 1).conditionalFormats.add('containsText', { text: 'REVIEW REQUIRED', format: { fill: '#FFF1CC', font: { color: '#785600' } } });
  }
  sheet.freezePanes.freezeRows(1);
  sheet.tables.add(`A1:${String.fromCharCode(64 + spec.headers.length)}${count}`, true, spec.name.replaceAll(' ', '') + 'Table');
}
workbook.recalculate();
console.log((await workbook.inspect({kind:'table', range:'Nominals!A1:J4', include:'values', tableMaxRows:4, tableMaxCols:10, maxChars:2200})).ndjson);
console.log((await workbook.inspect({kind:'match', searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!', options:{useRegex:true,maxResults:10}, maxChars:1000})).ndjson);
const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(path.join(outputDir, 'chart-of-accounts-review.xlsx'));

// CSVs preserve source strings and escape all fields; account codes are identifiers.
for (const [name, spec] of [['nominals', sheets[0]], ['sections', sheets[1]], ['categories', sheets[2]], ['source-rows', sheets[3]], ['review-issues', sheets[4]]]) {
  const csv = '\uFEFF' + [spec.headers, ...spec.rows].map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n') + '\r\n';
  await fs.writeFile(path.join(outputDir, `${name}.csv`), csv, 'utf8');
}
for (const spec of sheets) {
  try {
    const preview = await workbook.render({sheetName:spec.name, range:`A1:${spec.name === 'Review' ? 'D' : spec.name === 'Categories' ? 'E' : spec.name === 'Sections' ? 'F' : 'E'}9`, scale:1, format:'png'});
    await fs.writeFile(path.join(outputDir, `${spec.name.replaceAll(' ', '-').toLowerCase()}-preview.png`), new Uint8Array(await preview.arrayBuffer()));
  } catch (error) { console.error(`PREVIEW_UNAVAILABLE ${spec.name}: ${error.message}`); }
}
console.log(JSON.stringify({categories:categories.length, sections:sections.length, sourceRows:raw.length, uniqueNominals:nominals.length, repeatedCodes:['510104','711306','711314'], issues:issues.length, databaseWrites:0}));
