"use client";

/**
 * Browser-session store for the sales prototype.
 *
 * Mock/prototype: there is no Sales, Customer or Revenue API yet, so records
 * are held in memory and reset on reload. Views read through useSalesState()
 * and change records only through commitSales(), which keeps the workflow
 * rules in sales-workflow.ts as the single place that mutates state.
 */

import { useSyncExternalStore } from "react";
import { createSalesSeed } from "./sales-fixtures";
import type { SalesState } from "./sales-types";

let state: SalesState = createSalesSeed();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const snapshot = () => state;

export function useSalesState(): SalesState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Applies a change to a copy of the state and publishes it to every view. */
export function commitSales<T>(change: (draft: SalesState) => T): T {
  const draft = structuredClone(state);
  const result = change(draft);
  state = draft;
  listeners.forEach((listener) => listener());
  return result;
}

/** Counts shown beside Pick, Pack & Delivery and Sales Approvals in the menu. */
export function useSalesNavigationCounts(): Record<string, number> {
  const current = useSalesState();
  return {
    "pick-pack-delivery": current.order.filter((order) => order.status === "Confirmed" || order.status === "Packed").length,
    "sales-approvals":
      current.quotation.filter((quotation) => quotation.status === "Pending approval").length +
      current.returns.filter((item) => item.status === "Pending approval").length,
  };
}

/** Sales notifications for the shell's notification centre, newest first. */
export function useSalesNotifications() {
  return useSalesState().notifications;
}

export function markSalesNotificationRead(id: string) {
  commitSales((draft) => {
    const found = draft.notifications.find((item) => item.id === id);
    if (found) found.read = true;
  });
}
