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
import { todayIso } from "./sales-format";
import { recurringDue } from "./sales-workflow";
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

/** Counts shown in the menu: quotations waiting for approval, orders to deliver, draft receipts and recurring templates due today. */
export function useSalesNavigationCounts(): Record<string, number> {
  const current = useSalesState();
  return {
    quotations: current.quotation.filter((quotation) => quotation.status === "Pending approval").length,
    "pick-pack-delivery": current.order.filter((order) => order.status === "Confirmed" && !order.delivery).length,
    receipts: current.receipt.filter((doc) => doc.status === "Draft").length,
    "recurring-bills": recurringDue(current, todayIso()).length,
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
