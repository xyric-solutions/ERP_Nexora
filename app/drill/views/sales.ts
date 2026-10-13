/** Sales revenue fact view. */

import type { FactView } from "../types.ts";
import { buildFacts, chainOf } from "./build.ts";

const rows = buildFacts({
  prefix: "sl",
  seed: 771203,
  documentType: "Sales invoice",
  perPeriod: 52,
  minMajor: 8_000,
  maxMajor: 610_000,
  zeroEvery: 41,
  levels: [
    { column: "region", values: ["North", "South", "Central", "Export"] },
    { column: "customer", values: ["Crescent Textiles", "Atlas Engineering", "Northstar Foods", "Meridian Retail", "Orbit Traders", "Summit Industrial"] },
    { column: "product", values: ["Industrial pump", "Valve assembly", "Service contract", "Spare parts kit", "Installation"] },
  ],
});

export const salesFactView: FactView = {
  id: "sales-revenue",
  name: "Revenue",
  source: "sales.v_revenue_fact",
  currency: "PKR",
  minorUnits: 100,
  rows,
  chains: [
    {
      id: "territory",
      name: "Region -> customer -> product -> invoice",
      root: chainOf([
        { id: "region", name: "Region", column: "region" },
        { id: "customer", name: "Customer", column: "customer" },
        { id: "product", name: "Product", column: "product" },
        { id: "document", name: "Invoice", column: "documentId" },
      ]),
    },
    {
      id: "product",
      name: "Product -> region -> invoice",
      root: chainOf([
        { id: "product", name: "Product", column: "product" },
        { id: "region", name: "Region", column: "region" },
        { id: "document", name: "Invoice", column: "documentId" },
      ]),
    },
  ],
};
