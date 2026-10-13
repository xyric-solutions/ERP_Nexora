/**
 * Fact view and dimension registry.
 *
 * Adding a module means registering a fact view and a dimension chain here.
 * Nothing else. No renderer change, no screen, no module branch anywhere.
 *
 * `resolveColumn` is the whitelist seam. In the prototype there is no server
 * and no query, but the shape is kept honest: a dimension id resolves to a
 * column only through this registry, an unknown id is rejected, and no
 * caller ever supplies a column name. The real implementation replaces the
 * body with the server call and returns 400 on an unknown id.
 */

import type { DimensionChain, FactView } from "./types.ts";
import { financeFactView } from "./views/finance.ts";
import { salesFactView } from "./views/sales.ts";
import { procurementFactView } from "./views/procurement.ts";
import { inventoryFactView } from "./views/inventory.ts";

const views: readonly FactView[] = [financeFactView, salesFactView, procurementFactView, inventoryFactView];

const viewsById = new Map(views.map((view) => [view.id, view]));

export function listFactViews(): readonly FactView[] {
  return views;
}

export function getFactView(id: string): FactView | null {
  return viewsById.get(id) ?? null;
}

export function getChain(viewId: string, chainId: string): DimensionChain | null {
  return getFactView(viewId)?.chains.find((chain) => chain.id === chainId) ?? null;
}

/**
 * Which screens open the drill engine, and with what.
 *
 * This is a registration table, not a module branch: the renderer never learns
 * a module name, and a new entry costs one line.
 */
export interface DrillEntry {
  moduleId: string;
  pageId: string;
  viewId: string;
  chainId: string;
  title: string;
  /**
   * Set when the screen's headline figure comes from somewhere other than
   * these fact rows, so the layer says so instead of filling the space.
   */
  headlineNote?: string;
}

const entries: readonly DrillEntry[] = [
  { moduleId: "finance", pageId: "finance-drilldown", viewId: "finance-gl", chainId: "statement", title: "Statement drill-down" },
  { moduleId: "sales", pageId: "sales-reports", viewId: "sales-revenue", chainId: "territory", title: "Revenue drill-down" },
  { moduleId: "purchases", pageId: "procurement-reports", viewId: "procurement-spend", chainId: "category", title: "Spend drill-down" },
  { moduleId: "inventory", pageId: "inventory-valuation", viewId: "inventory-movement", chainId: "warehouse", title: "Stock movement drill-down" },
  {
    moduleId: "inventory",
    pageId: "stock-ledger",
    viewId: "inventory-movement",
    chainId: "warehouse",
    title: "Stock ledger drill-down",
    // The ledger headline is the valuation figure, which comes from the
    // costing run rather than from these movement rows. Rule: say so.
    headlineNote:
      "The valuation headline on this screen comes from the costing run, not from these movement rows. The figure below is the sum of movements in scope.",
  },
];

const entryIndex = new Map(entries.map((entry) => [`${entry.moduleId}:${entry.pageId}`, entry]));

export function getDrillEntry(moduleId: string, pageId: string): DrillEntry | null {
  return entryIndex.get(`${moduleId}:${pageId}`) ?? null;
}

export function listDrillEntries(): readonly DrillEntry[] {
  return entries;
}

/**
 * Dimension id -> column, through the whitelist only.
 *
 * A client-supplied column name must never reach a GROUP BY. Unknown id is
 * rejected here; the server implementation answers 400.
 */
export function resolveColumn(viewId: string, dimensionId: string): string {
  const view = getFactView(viewId);
  if (!view) throw new Error(`unknown fact view: ${viewId}`);
  for (const chain of view.chains) {
    let dimension = chain.root as { id: string; column: string; next: unknown } | null;
    while (dimension) {
      if (dimension.id === dimensionId) return dimension.column;
      dimension = dimension.next as typeof dimension;
    }
  }
  throw new Error(`unknown dimension id: ${dimensionId}`);
}

/** True when a dimension id is registered for a view. */
export function isKnownDimension(viewId: string, dimensionId: string): boolean {
  try {
    resolveColumn(viewId, dimensionId);
    return true;
  } catch {
    return false;
  }
}
