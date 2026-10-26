import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import assert from 'node:assert/strict';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';

const dir = dirname(fileURLToPath(import.meta.url));
const source = resolve(dir, 'chart-of-accounts-review.xlsx');
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(source));
function rows(sheet) { return workbook.worksheets.getItem(sheet).getUsedRange().values.slice(1).filter(row => row[0] !== null && row[0] !== ''); }
const slug = name => String(name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const categoryRows = rows('Categories');
const sectionRows = rows('Sections');
const nominalRows = rows('Nominals');
const rawRows = rows('Source Rows');
const manifest = {
  catalog_key: 'nexora-standard-coa', name: 'Standard Chart of Accounts', revision: '2026-10-20-v1',
  source_filename: 'chart-of-accounts-review.xlsx',
  source_sha256: createHash('sha256').update(await fs.readFile(source)).digest('hex'),
  categories: categoryRows.map(row => ({key:slug(row[0]),name:row[0],type:row[1]})),
  sections: sectionRows.map(row => ({code:String(row[1]),name:row[2],category_key:slug(row[0])})),
  nominals: nominalRows.map(row => {
    const matches = rawRows.filter(raw => String(raw[3]) === String(row[3]));
    assert(matches.length > 0, `No provenance for ${row[3]}`);
    for (const raw of matches) assert.deepEqual(raw.slice(0,6),row.slice(0,6),`Conflicting source code ${row[3]}`);
    return {code:String(row[3]),name:row[4],section_code:String(row[1]),source_rows:matches.map(raw => ({source:raw[6],row:Number(raw[7])})),...(row[9] ? {review_note:row[9]} : {})};
  }),
};
assert.equal(manifest.categories.length,14); assert.equal(manifest.sections.length,78); assert.equal(manifest.nominals.length,234);
assert.equal(manifest.nominals.reduce((count,row) => count + row.source_rows.length,0),237);
assert.equal(new Set(manifest.nominals.map(row => row.code)).size,234);
const destination = resolve(dir,'../../packages/db/catalogs/approved-chart-20261020.json');
await fs.mkdir(dirname(destination),{recursive:true});
await fs.writeFile(destination,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({source_sha256:manifest.source_sha256,categories:14,sections:78,nominals:234,source_occurrences:237,database_writes:0}));
