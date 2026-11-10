"use client";

import { useEffect, useRef, useState } from "react";
import type { PurchaseFlow } from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { purchaseError } from "../api/purchasing-api";

export function usePurchaseFlow(company: string, id: string | null, version: number) {
  const { api } = useSession();
  const [result, setResult] = useState<{ key: string; flow: PurchaseFlow | null; error: string }>({
    key: "",
    flow: null,
    error: "",
  });
  const [revision, setRevision] = useState(0),
    [moreKey, setMoreKey] = useState<string | null>(null);
  const key = `${company}:${id ?? "new"}:${version}:${revision}`;
  const generation = useRef(0),
    pending = useRef<string | null>(null);
  useEffect(() => {
    const current = ++generation.current;
    if (!id) return;
    let active = true;
    api
      .getPurchaseFlow(id, `?${new URLSearchParams({ company_id: company, limit: "50" })}`)
      .then((flow) => {
        if (active) setResult({ key, flow, error: "" });
      })
      .catch((caught) => {
        if (active) setResult({ key, flow: null, error: purchaseError(caught) });
      });
    return () => {
      active = false;
      generation.current = current + 1;
    };
  }, [api, company, id, key]);
  const current = result.key === key;
  async function more() {
    const cursor = current ? result.flow?.next_cursor : null;
    if (!id || !cursor || pending.current === key) return;
    const request = generation.current;
    pending.current = key;
    setMoreKey(key);
    try {
      const next = await api.getPurchaseFlow(
        id,
        `?${new URLSearchParams({ company_id: company, limit: "50", cursor })}`,
      );
      if (generation.current === request)
        setResult((previous) => ({
          key,
          error: "",
          flow: {
            ...next,
            items: [
              ...(previous.flow?.items ?? []),
              ...next.items.filter((item) => !previous.flow?.items.some((existing) => existing.id === item.id)),
            ],
          },
        }));
    } catch (caught) {
      if (generation.current === request) setResult((previous) => ({ ...previous, error: purchaseError(caught) }));
    } finally {
      if (pending.current === key) pending.current = null;
      setMoreKey((currentKey) => (currentKey === key ? null : currentKey));
    }
  }
  return {
    flow: current ? result.flow : null,
    error: current ? result.error : "",
    loading: !!id && !current,
    moreBusy: moreKey === key,
    more,
    retry: () => setRevision((value) => value + 1),
  };
}
