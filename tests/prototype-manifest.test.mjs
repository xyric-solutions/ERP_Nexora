import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildHrParityRows,
  buildManifest,
  serializeHrParity,
  serializeManifest,
  serializeHrApiCoverage,
} from "../scripts/generate-prototype-manifest.mjs";

test("the approved prototype manifest freezes the live catalogue", async () => {
  const manifest = buildManifest();
  assert.deepEqual(manifest.counts, { modules: 35, groups: 147, pages: 816 });

  const committed = await readFile(new URL("../docs/parity/prototype-manifest.json", import.meta.url), "utf8");
  assert.equal(committed, serializeManifest(manifest));
});

test("the HR parity register covers every HR screen once", async () => {
  const rows = await buildHrParityRows();
  assert.equal(rows.length, 87);
  assert.equal(new Set(rows.map((row) => row.page_id)).size, rows.length);
  assert.deepEqual(
    rows
      .filter((row) => row.api_integration === "MOCK_OR_UNLINKED")
      .map((row) => row.page_id)
      .sort(),
    [],
  );
  assert.equal(rows.filter((row) => row.api_integration === "NAVIGATION_ONLY").length, 11);
  assert.equal(rows.filter((row) => row.api_integration === "API_CONNECTED_SOURCE").length, 76);
  assert.equal(rows.filter((row) => row.api_integration === "API_READ_ONLY").length, 0);
  assert.equal(rows.find((row) => row.page_id === "payment-batch").current_renderer, "HrPayrollPaymentWorkspace");
  assert.equal(rows.find((row) => row.page_id === "training-programs").current_renderer, "HrLearningWorkspace");
  assert.equal(rows.find((row) => row.page_id === "payroll-workspace").current_renderer, "HrOperationsWorkspace");
  const coverage = await readFile(new URL("../docs/parity/hr-api-coverage.md", import.meta.url), "utf8");
  assert.equal(coverage, serializeHrApiCoverage(rows));
  assert.ok(rows.every((row) => /^M\d{2} /.test(row.production_module)));

  const committed = await readFile(new URL("../docs/parity/hr-screen-parity.csv", import.meta.url), "utf8");
  assert.equal(committed, serializeHrParity(rows));
});
