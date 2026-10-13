"use client";

/**
 * The navigation stack.
 *
 * ONE array holds drill navigation. The breadcrumb, the back button and
 * Escape are three views of it; no other component stores navigation state.
 *
 * The stack also serialises to the URL, so a shared link reopens the same
 * layer and browser back steps out of the drill.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DimensionChain, DrillBucket, DrillLayer, DrillNode, FactRow } from "./types.ts";
import { computeLayer, dimensionAtDepth } from "./aggregate.ts";
import { parsePath, readPathFromLocation, serialisePath, writeHash } from "./url.ts";

export interface UseDrillOptions {
  chain: DimensionChain;
  rows: readonly FactRow[];
  moduleId: string;
  pageId: string;
  /** Client-side date filter. Changing it recomputes; it never closes a layer. */
  periodFrom?: string;
  periodTo?: string;
  headlineNote?: string | null;
  /** Keep the URL in step. Off for tests and embedded previews. */
  syncUrl?: boolean;
}

export interface UseDrillResult {
  stack: DrillNode[];
  layer: DrillLayer;
  /** Every visual calls this. There is no per-chart click handler. */
  descend: (bucket: DrillBucket) => void;
  ascend: () => void;
  /** Jump to a breadcrumb depth. 0 = root. */
  goToDepth: (depth: number) => void;
  atRoot: boolean;
  atLeaf: boolean;
  /** Name of the level the back button returns to; null at root. */
  backLabel: string | null;
}

export function useDrill(options: UseDrillOptions): UseDrillResult {
  const { chain, rows, moduleId, pageId, periodFrom, periodTo, headlineNote, syncUrl = true } = options;
  const [stack, setStack] = useState<DrillNode[]>([]);

  // Restore a shared link once, on the client only.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const raw = readPathFromLocation(window.location.search, window.location.hash);
    const parsed = parsePath(raw);
    if (!parsed.length) return;
    const restored: DrillNode[] = [];
    parsed.forEach((entry, depth) => {
      const dimension = dimensionAtDepth(chain, depth);
      // Ignore a segment whose dimension is not the one at that depth: a
      // hand-edited or stale link must not produce a bogus layer.
      if (!dimension || dimension.id !== entry.dimensionId) return;
      restored.push({ dimensionId: entry.dimensionId, key: entry.key, label: entry.key });
    });
    if (restored.length) setStack(restored);
  }, [chain]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!syncUrl) return;
    const next = writeHash(moduleId, pageId, stack);
    if (window.location.hash !== next) window.history.replaceState(null, "", next);
  }, [stack, moduleId, pageId, syncUrl]);

  // The client-side date filter narrows the rows. Because the layer is
  // recomputed from the stack plus these rows, changing the range while a
  // panel is open recomputes it rather than closing it.
  const scopedRows = useMemo(() => {
    if (!periodFrom && !periodTo) return rows;
    return rows.filter((row) => {
      if (periodFrom && row.period < periodFrom) return false;
      if (periodTo && row.period > periodTo) return false;
      return true;
    });
  }, [rows, periodFrom, periodTo]);

  const layer = useMemo(
    () => computeLayer(chain, scopedRows, stack, { headlineNote }),
    [chain, scopedRows, stack, headlineNote],
  );

  const descend = useCallback(
    (bucket: DrillBucket) => {
      setStack((current) => {
        const dimension = dimensionAtDepth(chain, current.length);
        if (!dimension) return current;
        return [...current, { dimensionId: dimension.id, key: bucket.key, label: bucket.label }];
      });
    },
    [chain],
  );

  const ascend = useCallback(() => {
    setStack((current) => (current.length ? current.slice(0, -1) : current));
  }, []);

  const goToDepth = useCallback((depth: number) => {
    setStack((current) => (depth >= current.length ? current : current.slice(0, depth)));
  }, []);

  // Escape steps back one layer; at root it does not close anything here -
  // the shell's own Escape handling takes over.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      setStack((current) => {
        if (!current.length) return current;
        event.stopPropagation();
        return current.slice(0, -1);
      });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const backLabel = useMemo(() => {
    if (!stack.length) return null;
    // The button is labelled with the level it returns to, not "Back".
    if (stack.length === 1) return chain.name.split(" -> ")[0] ?? "Overview";
    const parent = dimensionAtDepth(chain, stack.length - 1);
    return stack[stack.length - 2]?.label ?? parent?.name ?? "Overview";
  }, [stack, chain]);

  return {
    stack,
    layer,
    descend,
    ascend,
    goToDepth,
    atRoot: stack.length === 0,
    atLeaf: layer.splitBy === null,
    backLabel,
  };
}

export { serialisePath };
