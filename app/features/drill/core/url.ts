/**
 * Drill path <-> URL.
 *
 * The path serialises so links are shareable and browser back works:
 *   ?path=group:salaries/account:710101
 *
 * One adaptation to this prototype, stated plainly: the prototype is
 * hash-routed (`#/finance/general-ledger`), so the query is carried inside the
 * hash - `#/finance/general-ledger?path=group:salaries/account:710101`. That
 * keeps a single URL scheme and preserves the intent (shareable links, working
 * browser back). A top-level `?path=` is also accepted on load, so a link in
 * the documented form still resolves.
 */

import type { DrillNode } from "./types.ts";

const PAIR = /^([a-z0-9-]+):(.+)$/i;

export function serialisePath(stack: readonly DrillNode[]): string {
  return stack.map((node) => `${node.dimensionId}:${encodeURIComponent(node.key)}`).join("/");
}

/**
 * Parse a path into partial nodes. Labels are not in the URL - they are
 * resolved from the data when the layer is computed, so a shared link cannot
 * carry a stale label.
 */
export function parsePath(path: string): { dimensionId: string; key: string }[] {
  if (!path) return [];
  return path
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const match = PAIR.exec(segment);
      if (!match) return null;
      return { dimensionId: match[1], key: decodeURIComponent(match[2]) };
    })
    .filter((value): value is { dimensionId: string; key: string } => value !== null);
}

/** Read the drill path from the current location: hash query first, then search. */
export function readPathFromLocation(search: string, hash: string): string {
  const fromHash = hash.includes("?") ? new URLSearchParams(hash.slice(hash.indexOf("?") + 1)).get("path") : null;
  if (fromHash) return fromHash;
  return new URLSearchParams(search).get("path") ?? "";
}

/** Build the hash for a route plus drill path. */
export function writeHash(moduleId: string, pageId: string, stack: readonly DrillNode[]): string {
  const path = serialisePath(stack);
  return `#/${moduleId}/${pageId}${path ? `?path=${path}` : ""}`;
}
