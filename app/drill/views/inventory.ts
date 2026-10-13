/** Inventory movement fact view. */

import type { FactView } from "../types.ts";
import { buildFacts, chainOf } from "./build.ts";

const rows = buildFacts({
  prefix: "in",
  seed: 33118,
  documentType: "Stock movement",
  perPeriod: 40,
  minMajor: 2_000,
  maxMajor: 280_000,
  zeroEvery: 29,
  levels: [
    { column: "warehouse", values: ["Main store", "Karachi depot", "Lahore depot", "Site store"] },
    { column: "category", values: ["Raw material", "Finished goods", "Spares", "Packaging"] },
    { column: "item", values: ["Steel plate", "Pump housing", "Bearing set", "Carton", "Pallet"] },
  ],
});

export const inventoryFactView: FactView = {
  id: "inventory-movement",
  name: "Stock movement",
  source: "inventory.v_movement_fact",
  currency: "PKR",
  minorUnits: 100,
  rows,
  chains: [
    {
      id: "warehouse",
      name: "Warehouse -> category -> item -> movement",
      root: chainOf([
        { id: "warehouse", name: "Warehouse", column: "warehouse" },
        { id: "category", name: "Category", column: "category" },
        { id: "item", name: "Item", column: "item" },
        { id: "document", name: "Movement", column: "documentId" },
      ]),
    },
  ],
};
