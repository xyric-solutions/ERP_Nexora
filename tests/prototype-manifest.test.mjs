import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildHrParityRows,
  buildManifest,
  serializeHrParity,
  serializeManifest,
} from "../scripts/generate-prototype-manifest.mjs";

const expectedGenericPages = [
  "add-employee",
  "attendance",
  "employee-record",
  "employee-self-service",
  "employees",
  "leave-approval",
  "leave-request",
  "leave-requests",
  "loans-benefits",
  "payroll-inputs",
  "positions-org",
  "statutory-deductions",
];

test("the approved prototype manifest freezes the live catalogue", async () => {
  const manifest = buildManifest();
  assert.deepEqual(manifest.counts, { modules: 35, groups: 146, pages: 792 });

  const committed = await readFile(new URL("../docs/parity/prototype-manifest.json", import.meta.url), "utf8");
  assert.equal(committed, serializeManifest(manifest));
});

test("the HR parity register covers every HR screen once", async () => {
  const rows = await buildHrParityRows();
  assert.equal(rows.length, 67);
  assert.equal(new Set(rows.map((row) => row.page_id)).size, rows.length);
  assert.deepEqual(
    rows.filter((row) => row.audit_status === "GENERIC_FALLBACK").map((row) => row.page_id).sort(),
    expectedGenericPages,
  );
  assert.ok(rows.every((row) => /^M\d{2} /.test(row.production_module)));

  const committed = await readFile(new URL("../docs/parity/hr-screen-parity.csv", import.meta.url), "utf8");
  assert.equal(committed, serializeHrParity(rows));
});
