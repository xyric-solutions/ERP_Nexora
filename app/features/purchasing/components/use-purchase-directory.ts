"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { purchaseError } from "../api/purchasing-api";

export function usePurchaseDirectory<T extends { id: string }>(
  company: string,
  load: (query: string) => Promise<{ items: T[]; next_cursor: string | null }>,
  enabled: boolean,
) {
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [loadedQuery, setLoadedQuery] = useState("");
  const generation = useRef(0),
    morePending = useRef(false);
  const query = useCallback(
    (after?: string) =>
      `?${new URLSearchParams({ company_id: company, search, limit: "30", ...(after ? { cursor: after } : {}) })}`,
    [company, search],
  );
  useEffect(() => {
    const version = ++generation.current;
    if (!enabled) return;
    const timer = setTimeout(() => {
      setItems([]);
      setCursor(null);
      setError("");
      setLoadedQuery(query());
      setBusy(true);
      load(query())
        .then((result) => {
          if (generation.current !== version) return;
          setItems(result.items);
          setCursor(result.next_cursor);
        })
        .catch((caught) => {
          if (generation.current === version) setError(purchaseError(caught));
        })
        .finally(() => {
          if (generation.current === version) setBusy(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      generation.current = version + 1;
    };
  }, [enabled, load, query, retry]);
  async function more() {
    if (!cursor || busy || morePending.current) return;
    const version = generation.current;
    morePending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await load(query(cursor));
      if (generation.current !== version) return;
      setItems((current) => [
        ...current,
        ...result.items.filter((item) => !current.some((existing) => existing.id === item.id)),
      ]);
      setCursor(result.next_cursor);
    } catch (caught) {
      if (generation.current === version) setError(purchaseError(caught));
    } finally {
      morePending.current = false;
      if (generation.current === version) setBusy(false);
    }
  }
  const current = loadedQuery === query();
  return {
    items: current ? items : [],
    cursor: current ? cursor : null,
    busy: enabled && (busy || !current),
    error: current ? error : "",
    search,
    setSearch,
    more,
    retry: () => setRetry((value) => value + 1),
  };
}
