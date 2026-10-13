/** Procurement spend fact view. */

import type { FactView } from "../types.ts";
import { buildFacts, chainOf } from "./build.ts";

const rows = buildFacts({
  prefix: "pr",
  seed: 480917,
  documentType: "Purchase bill",
  perPeriod: 44,
  minMajor: 5_000,
  maxMajor: 520_000,
  zeroEvery: 43,
  levels: [
    { column: "category", values: ["Raw material", "Consumables", "Services", "Logistics", "Capex"] },
    { column: "supplier", values: ["Indus Steel", "Gulf Chemicals", "Harbour Logistics", "Precision Tools", "Delta Packaging"] },
    { column: "item", values: ["Steel plate", "Lubricant", "Freight lane", "Cutting tool", "Carton"] },
  ],
});

export const procurementFactView: FactView = {
  id: "procurement-spend",
  name: "Spend",
  source: "procurement.v_spend_fact",
  currency: "PKR",
  minorUnits: 100,
  rows,
  chains: [
    {
      id: "category",
      name: "Category -> supplier -> item -> bill",
      root: chainOf([
        { id: "category", name: "Category", column: "category" },
        { id: "supplier", name: "Supplier", column: "supplier" },
        { id: "item", name: "Item", column: "item" },
        { id: "document", name: "Bill", column: "documentId" },
      ]),
    },
  ],
};
