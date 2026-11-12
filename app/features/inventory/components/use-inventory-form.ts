"use client";
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { useActionFeedback } from "@/shared/ui/action-feedback";
import { productError } from "../model/products";

/** Shared master/draft editing behavior; neither form performs stock posting. */
export function useInventoryForm<
  TInput extends { expected_version?: number },
  TRecord extends { id: string; code: string; version: number },
>({
  company,
  recordRef,
  formPage,
  initial,
  load,
  persist,
  schema,
  canWrite,
  onClose,
  onDirtyChange,
}: {
  company: string;
  recordRef?: string;
  formPage: string;
  initial: () => TInput;
  load: (id: string, company: string) => Promise<{ record: TRecord; input: TInput }>;
  persist: (id: string | null, input: TInput, key: string) => Promise<{ record: TRecord }>;
  schema: z.ZodType<TInput>;
  canWrite: boolean;
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const notify = useActionFeedback(),
    [input, setInput] = useState<TInput>(initial),
    [record, setRecord] = useState<TRecord | null>(null),
    [dirty, setDirty] = useState(false),
    [loading, setLoading] = useState(!!recordRef),
    [loadFailed, setLoadFailed] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [reloadToken, setReloadToken] = useState(0);
  const idRef = useRef(recordRef),
    lock = useRef(false),
    retry = useRef<{ body: string; key: string } | null>(null);
  useEffect(() => {
    const id = idRef.current;
    if (!id) return;
    let active = true;
    load(id, company)
      .then((result) => {
        if (active) {
          setInput(result.input);
          setRecord(result.record);
          setLoadFailed(false);
          setDirty(false);
          setError("");
        }
      })
      .catch((e) => {
        if (active) {
          setLoadFailed(true);
          setError(productError(e));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [company, load, reloadToken]);
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  function change(update: (current: TInput) => TInput) {
    setInput(update);
    setDirty(true);
  }
  function close() {
    if (dirty && !window.confirm("Discard these unsaved Inventory changes?")) return;
    onDirtyChange?.(false);
    onClose();
  }
  async function save(closeAfter: boolean) {
    if (lock.current || loading || loadFailed || !canWrite) return;
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" "));
      return;
    }
    const body = JSON.stringify({ id: record?.id ?? null, input: parsed.data });
    if (retry.current?.body !== body) retry.current = { body, key: `inventory-${crypto.randomUUID()}` };
    lock.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await persist(record?.id ?? null, parsed.data, retry.current.key);
      setRecord(result.record);
      setInput((current) => ({ ...current, expected_version: result.record.version }));
      idRef.current = result.record.id;
      window.history.replaceState(null, "", `#/inventory/${formPage}/${encodeURIComponent(result.record.id)}`);
      retry.current = null;
      setDirty(false);
      onDirtyChange?.(false);
      notify(`${result.record.code} saved.`);
      if (closeAfter) onClose();
    } catch (e) {
      setError(productError(e));
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  function reload() {
    if (dirty && !window.confirm("Reload and discard the unsaved changes?")) return;
    setLoading(true);
    setReloadToken((n) => n + 1);
  }
  return { input, record, dirty, loading, loadFailed, saving, error, change, save, close, reload };
}
