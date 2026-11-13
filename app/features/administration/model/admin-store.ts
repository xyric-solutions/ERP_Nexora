"use client";

/**
 * Browser-session store for the Administration prototype.
 *
 * Mock/prototype: the `/api/v1/admin` endpoints need the plan's Phase 2 database
 * tables, which are deferred. Until they exist, users, module access, the
 * organisation profile and the activity log are held in memory and reset on reload.
 * Views change records only through `api/administration-client.ts`.
 */

import { useSyncExternalStore } from "react";

import type { AdminState } from "./admin-workflow";

let state: AdminState | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const snapshot = () => state;

export function useAdminState(): AdminState | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function readAdminState(): AdminState | null {
  return state;
}

/**
 * Seeds the store once per organisation; later calls for the same tenant keep edits.
 * It runs during render (from `useAdministration`), so it does not notify listeners.
 */
export function ensureAdminState(tenantId: string, seed: () => AdminState) {
  if (state?.tenant.tenant_id === tenantId) return;
  state = seed();
}

/** Applies a change to a copy of the state and publishes it; a thrown rule error leaves state untouched. */
export function commitAdmin<T>(change: (draft: AdminState) => T): T {
  if (!state) throw new Error("Administration data is not loaded yet.");
  const draft = structuredClone(state);
  const result = change(draft);
  state = draft;
  listeners.forEach((listener) => listener());
  return result;
}

/** Test helper. */
export function resetAdminState() {
  state = null;
  listeners.forEach((listener) => listener());
}
