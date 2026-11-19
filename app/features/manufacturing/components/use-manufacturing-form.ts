"use client";
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { useActionFeedback } from "@/shared/ui/action-feedback";
import { manufacturingError } from "../model/manufacturing";

/** Load, edit, validate and save one Manufacturing record (pattern of `use-inventory-form`). */
export function useManufacturingForm<
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
          setError(manufacturingError(e));
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
    if (dirty && !window.confirm("Discard these unsaved Manufacturing changes?")) return;
    onDirtyChange?.(false);
    onClose();
  }
  /** Adopts a record returned by another action (submit, approve, convert) without a reload. */
  function adopt(next: TRecord, nextInput: TInput) {
    setRecord(next);
    setInput(nextInput);
    idRef.current = next.id;
    setDirty(false);
    onDirtyChange?.(false);
  }
  async function save(closeAfter: boolean): Promise<TRecord | null> {
    if (lock.current || loading || loadFailed || !canWrite) return null;
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(" "));
      return null;
    }
    const body = JSON.stringify({ id: record?.id ?? null, input: parsed.data });
    if (retry.current?.body !== body) retry.current = { body, key: `manufacturing-${crypto.randomUUID()}` };
    lock.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await persist(record?.id ?? null, parsed.data, retry.current.key);
      setRecord(result.record);
      setInput((current) => ({ ...current, expected_version: result.record.version }));
      idRef.current = result.record.id;
      window.history.replaceState(null, "", `#/manufacturing/${formPage}/${encodeURIComponent(result.record.id)}`);
      retry.current = null;
      setDirty(false);
      onDirtyChange?.(false);
      notify(`${result.record.code} saved.`);
      if (closeAfter) onClose();
      return result.record;
    } catch (e) {
      setError(manufacturingError(e));
      return null;
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
  return {
    input,
    record,
    dirty,
    loading,
    loadFailed,
    saving,
    error,
    setError,
    change,
    save,
    close,
    reload,
    adopt,
    setSaving,
  };
}
