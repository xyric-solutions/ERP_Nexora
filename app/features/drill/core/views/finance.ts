/**
 * Finance general-ledger fact view.
 *
 * Two chains over one view: how a statement decomposes, and how the ledger
 * decomposes. Registering a second chain costs a few lines and needs no
 * renderer change.
 */

import type { FactView } from "../types.ts";
import { buildFacts, chainOf } from "./build.ts";

const SECTIONS = ["Revenue", "Cost of sales", "Operating expenses", "Finance cost"];
const GROUPS = ["Trading", "Services", "Salaries", "Utilities", "Depreciation", "Interest", "Materials", "Freight"];
const ACCOUNTS = ["4100", "4200", "5100", "5200", "6100", "6200", "6300", "6400", "6500"];

const rows = buildFacts({
  prefix: "gl",
  seed: 20260911,
  documentType: "Journal voucher",
  perPeriod: 46,
  minMajor: 12_000,
  maxMajor: 940_000,
  zeroEvery: 37,
  levels: [
    { column: "section", values: SECTIONS },
    { column: "accountGroup", values: GROUPS },
    { column: "account", values: ACCOUNTS },
  ],
});

export const financeFactView: FactView = {
  id: "finance-gl",
  name: "General ledger",
  source: "finance.v_gl_fact",
  currency: "PKR",
  minorUnits: 100,
  rows,
  chains: [
    {
      id: "statement",
      name: "Statement -> group -> account -> document",
      root: chainOf([
        { id: "section", name: "Statement section", column: "section" },
        { id: "group", name: "Account group", column: "accountGroup" },
        { id: "account", name: "Account", column: "account" },
        { id: "document", name: "Journal", column: "documentId" },
      ]),
    },
    {
      id: "account",
      name: "Group -> account -> journal",
      root: chainOf([
        { id: "group", name: "Account group", column: "accountGroup" },
        { id: "account", name: "Account", column: "account" },
        { id: "document", name: "Journal", column: "documentId" },
      ]),
    },
  ],
};
