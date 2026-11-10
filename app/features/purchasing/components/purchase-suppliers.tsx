"use client";
import { useEffect, useRef, useState } from "react";
import { supplierInputSchema, supplierProfileSchema, type Supplier } from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LabeledField } from "@/shared/ui/labeled-field";
import { useActionFeedback } from "@/shared/ui/action-feedback";
import { purchaseError } from "../api/purchasing-api";
import {
  SupplierProfileFields,
  supplierErrorTab,
  type SupplierFormInput,
  type SupplierTab,
} from "./supplier-profile-fields";

function emptySupplier(company: string): SupplierFormInput {
  return {
    company_id: company,
    name: "",
    tax_id: "",
    email: "",
    phone: "",
    address: "",
    status: "active",
    profile: supplierProfileSchema.parse({}),
  };
}

export function PurchaseSuppliers({
  company,
  suppliers,
  canLoadMore,
  onMore,
  busy,
  onSaved,
  onDirtyChange,
  initialCreate = false,
  currencies = [],
  onClose,
}: {
  company: string;
  suppliers: Supplier[];
  canLoadMore: boolean;
  onMore: () => void;
  busy: boolean;
  onSaved: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  initialCreate?: boolean;
  currencies?: { code: string; name: string }[];
  onClose?: () => void;
}) {
  const { api, session, csrfToken } = useSession(),
    notify = useActionFeedback();
  const [editing, setEditing] = useState<Supplier | null | undefined>(() => (initialCreate ? null : undefined)),
    [input, setInput] = useState<SupplierFormInput>(() => emptySupplier(company));
  const [tab, setTab] = useState<SupplierTab>("overview"),
    [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [dirty, setDirty] = useState(false),
    [search, setSearch] = useState("");
  const [found, setFound] = useState<Supplier[] | null>(null),
    [cursor, setCursor] = useState<string | null>(null),
    [searching, setSearching] = useState(false);
  const retry = useRef<{ body: string; key: string } | null>(null),
    lock = useRef(false);
  const canManage = !!session?.user.permissions.includes("procurement.vendor.create") && !session?.impersonation;
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  useEffect(() => {
    if (!search.trim()) return;
    let active = true;
    const timer = setTimeout(() => {
      setSearching(true);
      api
        .listPurchaseSuppliers(`?${new URLSearchParams({ company_id: company, search, limit: "100" })}`)
        .then((result) => {
          if (active) {
            setFound(result.items);
            setCursor(result.next_cursor);
          }
        })
        .catch((caught) => {
          if (active) setError(purchaseError(caught));
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, company, search]);
  function open(supplier: Supplier | null) {
    if (dirty && !window.confirm("Discard the unsaved supplier changes?")) return;
    setEditing(supplier);
    setInput(
      supplier
        ? {
            company_id: company,
            name: supplier.name,
            tax_id: supplier.tax_id,
            email: supplier.email,
            phone: supplier.phone,
            address: supplier.address,
            status: supplier.status,
            profile: supplierProfileSchema.parse(supplier.profile ?? {}),
            expected_version: supplier.version,
          }
        : emptySupplier(company),
    );
    setError("");
    setFieldErrors({});
    setTab("overview");
    setDirty(false);
  }
  function change(patch: Partial<SupplierFormInput>) {
    if (saving || !canManage) return;
    setInput((current) => ({ ...current, ...patch }));
    setDirty(true);
  }
  async function save() {
    if (lock.current || !canManage) return;
    const parsed = supplierInputSchema.safeParse(input);
    if (!parsed.success) {
      const errors = Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join("."), issue.message]));
      setFieldErrors(errors);
      setTab(supplierErrorTab(parsed.error.issues[0]!.path.join(".")));
      setError("Please correct the highlighted supplier details before saving.");
      setTimeout(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    const body = JSON.stringify({ id: editing?.id ?? null, payload: parsed.data });
    if (retry.current?.body !== body) retry.current = { body, key: `purchase-supplier-${crypto.randomUUID()}` };
    lock.current = true;
    setSaving(true);
    setError("");
    setFieldErrors({});
    try {
      const result = await api.savePurchaseSupplier(editing?.id ?? null, parsed.data, csrfToken(), retry.current.key);
      retry.current = null;
      setDirty(false);
      onDirtyChange?.(false);
      setEditing(undefined);
      setSearch("");
      setFound(null);
      notify(`Supplier ${result.record.code} saved.`);
      onSaved();
    } catch (caught) {
      setError(purchaseError(caught));
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  async function more() {
    if (!search.trim()) {
      onMore();
      return;
    }
    if (!cursor || searching) return;
    setSearching(true);
    try {
      const result = await api.listPurchaseSuppliers(
        `?${new URLSearchParams({ company_id: company, search, limit: "100", cursor })}`,
      );
      setFound((current) => [...(current ?? []), ...result.items]);
      setCursor(result.next_cursor);
    } catch (caught) {
      setError(purchaseError(caught));
    } finally {
      setSearching(false);
    }
  }
  return (
    <div className="grid min-w-0 gap-3">
      {editing === undefined ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Input
            className="max-w-sm"
            aria-label="Search suppliers"
            placeholder="Search supplier code or name"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              if (!event.target.value.trim()) {
                setFound(null);
                setCursor(null);
              }
            }}
          />
          <Button type="button" disabled={!canManage || saving} onClick={() => open(null)}>
            Add Supplier
          </Button>
        </div>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {editing !== undefined ? (
        <form
          ref={formRef}
          noValidate
          aria-label="Supplier form"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
          className="grid min-w-0 gap-4"
        >
          <header className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="grid min-w-0 gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{editing ? "Edit supplier" : "New supplier"}</Badge>
                <Badge variant="outline">{input.profile.entity_type === "company" ? "Company" : "Individual"}</Badge>
              </div>
              <h2 className="m-0 break-words text-xl font-semibold">{input.name || "Create a supplier"}</h2>
              <p className="m-0 text-sm text-muted-foreground">
                A complete supplier profile, from first contact to payment details.
              </p>
            </div>
            <LabeledField label="Supplier code" hint="Generated automatically on save.">
              <Input className="max-w-xs font-mono" readOnly value={editing?.code ?? "SUP-…"} />
            </LabeledField>
          </header>
          <fieldset disabled={saving || !canManage} className="m-0 grid min-w-0 gap-4 border-0 p-0">
            <legend className="sr-only">Supplier details</legend>
            <SupplierProfileFields
              input={input}
              onChange={change}
              tab={tab}
              onTabChange={setTab}
              errors={fieldErrors}
              currencies={currencies}
            />
          </fieldset>
          <footer className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
            <p className="m-0 text-xs text-muted-foreground">
              {dirty ? "Unsaved changes" : "Fields marked * are required."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => {
                  if (!dirty || window.confirm("Discard the unsaved supplier changes?")) {
                    setEditing(undefined);
                    setDirty(false);
                    setError("");
                    setFieldErrors({});
                    onDirtyChange?.(false);
                    onClose?.();
                  }
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!canManage || saving}>
                {saving ? "Saving…" : "Save Supplier"}
              </Button>
            </div>
          </footer>
        </form>
      ) : null}
      {editing === undefined ? (
        <>
          <div
            className="min-w-0 overflow-x-auto rounded-lg border border-border bg-card"
            aria-busy={busy || searching}
          >
            <table className="w-full min-w-[600px] border-collapse text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  {["Code", "Name", "Tax ID", "Contact", "Status", ""].map((heading) => (
                    <th className="relative px-3 py-2 font-medium" scope="col" key={heading}>
                      {heading || <span className="sr-only">Actions</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(found ?? suppliers).map((supplier) => (
                  <tr className="border-t border-border" key={supplier.id}>
                    <td className="px-3 py-2">{supplier.code}</td>
                    <td className="px-3 py-2">{supplier.name}</td>
                    <td className="px-3 py-2">{supplier.tax_id || "—"}</td>
                    <td className="px-3 py-2">{supplier.email || supplier.phone || "—"}</td>
                    <td className="px-3 py-2 capitalize">
                      {supplier.status}
                      {supplier.risk_status === "blocked" ? " · Blocked" : ""}
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!canManage || saving}
                        onClick={() => open(supplier)}
                      >
                        Edit {supplier.code}
                      </Button>
                    </td>
                  </tr>
                ))}
                {!(found ?? suppliers).length ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                      {busy || searching ? "Loading suppliers…" : "No suppliers found for this company."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {(search.trim() ? !!cursor : canLoadMore) ? (
            <Button
              className="w-fit"
              type="button"
              variant="outline"
              disabled={busy || searching}
              onClick={() => void more()}
            >
              Load more suppliers
            </Button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
