"use client";
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { useActionFeedback } from "@/shared/ui/action-feedback";
import { fleetError } from "../model/fleet";

/** Load, edit, validate and save one Fleet record (pattern of `use-manufacturing-form`). */
export function useFleetForm<
  TInput extends { expected_version?: number },
  TRecord extends { id: string; version: number },
>({
  company,
  recordRef,
  formPage,
  initial,
  load,
  persist,
  schema,
  canWrite,
  label,
  onSaved,
  onDirtyChange,
}: {
  company: string;
  /** Existing record to edit; omitted for a new record. */
  recordRef?: string | null;
  formPage: string;
  initial: () => TInput;
  load?: (id: string, company: string) => Promise<{ record: TRecord; input: TInput }>;
  persist: (id: string | null, input: TInput, key: string) => Promise<{ record: TRecord }>;
  schema: z.ZodType<unknown>;
  canWrite: boolean;
  /** Name shown in the saved message. */
  label: (record: TRecord) => string;
  onSaved?: (record: TRecord) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const notify = useActionFeedback(),
    [input, setInput] = useState<TInput>(initial),
    [record, setRecord] = useState<TRecord | null>(null),
    [dirty, setDirty] = useState(false),
    [loading, setLoading] = useState(!!recordRef && !!load),
    [loadFailed, setLoadFailed] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [reloadToken, setReloadToken] = useState(0);
  const idRef = useRef(recordRef ?? undefined),
    lock = useRef(false),
    retry = useRef<{ body: string; key: string } | null>(null);
  useEffect(() => {
    const id = idRef.current;
    if (!id || !load) return;
    let active = true;
    load(id, company)
      .then((result) => {
        if (!active) return;
        setInput(result.input);
        setRecord(result.record);
        setLoadFailed(false);
        setDirty(false);
        setError("");
      })
      .catch((e) => {
        if (!active) return;
        setLoadFailed(true);
        setError(fleetError(e));
      })
      .finally(() => active && setLoading(false));
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
  function confirmDiscard() {
    return !dirty || window.confirm("Discard these unsaved Fleet changes?");
  }
  async function save(): Promise<TRecord | null> {
    if (lock.current || loading || loadFailed || !canWrite) return null;
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join(" "));
      return null;
    }
    const data = parsed.data as TInput;
    const body = JSON.stringify({ id: record?.id ?? null, input: data });
    // One key per distinct request, so a retry after a lost response cannot save twice.
    if (retry.current?.body !== body) retry.current = { body, key: `fleet-${crypto.randomUUID()}` };
    lock.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await persist(record?.id ?? null, data, retry.current.key);
      setRecord(result.record);
      setInput((current) => ({ ...current, expected_version: result.record.version }));
      idRef.current = result.record.id;
      window.history.replaceState(null, "", `#/fleet/${formPage}/${encodeURIComponent(result.record.id)}`);
      retry.current = null;
      setDirty(false);
      onDirtyChange?.(false);
      notify(`${label(result.record)} saved.`);
      onSaved?.(result.record);
      return result.record;
    } catch (e) {
      setError(fleetError(e));
      return null;
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  function reload() {
    if (!confirmDiscard()) return;
    setLoading(true);
    setReloadToken((n) => n + 1);
  }
  return { input, record, dirty, loading, loadFailed, saving, error, setError, change, save, reload, confirmDiscard };
}
