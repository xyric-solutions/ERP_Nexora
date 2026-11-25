"use client";

import { useEffect, useRef, useState } from "react";
import {
  customerMasterInputSchema,
  supplierProfileSchema,
  type CustomerMaster,
  type CustomerMasterDirectory,
  type CustomerMasterInput,
} from "@nexora/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSession } from "@/lib/session/session-provider";
import { useActionFeedback } from "@/shared/ui/action-feedback";
import { BusinessProfileFields, supplierErrorTab, type SupplierTab } from "@/shared/ui/business-profile-fields";
import { LabeledField } from "@/shared/ui/labeled-field";
import { ProfileFormFooter, ProfileFormHeader } from "@/shared/ui/profile-form";
import { WorkForm } from "@/shared/ui/work-form";
import { WorkTable, workSelectClass } from "@/shared/ui/work-table";
import { useDiscardGuard, useIsDirty } from "../components/discard-guard";
import type { SalesNavigate } from "../components/persistent-sales-record";
import { salesError, salesQuery } from "../model/persistent-sales";

export function CustomerMasterWorkspace({
  company,
  recordRef,
  onNavigate,
  onDirtyChange,
}: {
  company: string;
  recordRef?: string;
  onNavigate: SalesNavigate;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { api, session } = useSession();
  const canRead = !!session?.user.permissions.includes("finance.subledger.read");
  const canManage = !!session?.user.permissions.includes("finance.subledger.manage") && !session?.impersonation;
  const editing = !!recordRef;
  const id = recordRef === "new" ? undefined : recordRef;
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<{
    scope: string;
    directory?: CustomerMasterDirectory;
    record?: CustomerMaster;
    error?: string;
  }>();
  const scope = salesQuery({ company_id: company, search: search.trim(), offset, limit: pageSize });
  const loadKey = `${scope}:${recordRef ?? "list"}:${attempt}`;
  const view = load?.scope === loadKey ? load : undefined;
  const close = () => onNavigate("sales", "customers", undefined, { replace: true });

  useEffect(() => {
    if (!canRead || (editing && !canManage)) return;
    let active = true;
    const timer = setTimeout(
      () => {
        void Promise.all([api.listCustomerMasters(scope), id ? api.getCustomerMaster(id, company) : undefined])
          .then(([directory, record]) => {
            if (active) setLoad({ scope: loadKey, directory, record });
          })
          .catch((error) => {
            if (active) setLoad({ scope: loadKey, error: salesError(error) });
          });
      },
      search ? 200 : 0,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, canRead, canManage, company, editing, id, loadKey, scope, search]);

  if (!canRead || (editing && !canManage))
    return <p role="alert">You do not have access to this customer workspace.</p>;
  const directory = view?.directory;
  return (
    <section className="grid min-w-0 gap-4 text-foreground" aria-label="Customer master">
      {!editing ? (
        <>
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            <div className="grid gap-1">
              <h1 className="m-0 text-xl font-semibold">Customers</h1>
              <p className="m-0 text-sm text-muted-foreground">Manage customers for this company within Sales.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => onNavigate("sales", "customers", "ledger?")}
              >
                Receivables
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => onNavigate("sales", "quotations")}
              >
                Back to Sales
              </Button>
            </div>
          </header>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Input
              aria-label="Search customers"
              className="max-w-sm"
              placeholder="Search customer code or name"
              maxLength={100}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setOffset(0);
              }}
            />
            {canManage ? (
              <Button type="button" className="rounded-full" onClick={() => onNavigate("sales", "customers", "new")}>
                Add Customer
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
      {view?.error ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
          <span>{view.error}</span>
          <Button type="button" variant="outline" onClick={() => setAttempt((value) => value + 1)}>
            Retry
          </Button>
          {editing ? (
            <Button type="button" variant="outline" onClick={close}>
              Back to Customers
            </Button>
          ) : null}
        </div>
      ) : editing ? (
        directory ? (
          <CustomerEditor
            company={company}
            record={view.record}
            directory={directory}
            onClose={close}
            onDirtyChange={onDirtyChange}
          />
        ) : (
          <p role="status">Loading customer profile…</p>
        )
      ) : (
        <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card" aria-busy={!view}>
          <WorkTable
            tableId="sales-customer-directory"
            label="Customers"
            className="w-full min-w-[620px] border-collapse text-sm"
            pagination={{
              offset,
              limit: pageSize,
              total: directory?.total ?? 0,
              busy: !view,
              onOffsetChange: setOffset,
              onLimitChange: (limit) => {
                setPageSize(limit);
                setOffset(0);
              },
            }}
          >
            <thead className="bg-muted text-left">
              <tr>
                {["Code", "Name", "Tax ID", "Contact", "Status", "Actions"].map((label) => (
                  <th key={label} scope="col" className="px-3 py-2 font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {directory?.items.map((customer) => (
                <tr key={customer.id} className="border-t border-border [&>td]:px-3 [&>td]:py-2">
                  <td>{customer.code}</td>
                  <td>{customer.name}</td>
                  <td>{customer.tax_id || "—"}</td>
                  <td>{customer.email || customer.phone || "—"}</td>
                  <td className="capitalize">{customer.status}</td>
                  <td>
                    {canManage ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onNavigate("sales", "customers", customer.id)}
                      >
                        Edit {customer.code}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!directory?.items.length ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    {view ? "No customers found for this company." : "Loading customers…"}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </WorkTable>
        </div>
      )}
    </section>
  );
}

function CustomerEditor({
  company,
  record,
  directory,
  onClose,
  onDirtyChange,
}: {
  company: string;
  record?: CustomerMaster;
  directory: CustomerMasterDirectory;
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { api, csrfToken } = useSession();
  const notify = useActionFeedback();
  const [input, setInput] = useState<CustomerMasterInput>(
    () =>
      record ?? {
        company_id: company,
        name: "",
        tax_id: "",
        email: "",
        phone: "",
        address: "",
        status: "active",
        default_currency: directory.base_currency,
        profile: supplierProfileSchema.parse({}),
      },
  );
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const lock = useRef(false);
  const [tab, setTab] = useState<SupplierTab>("overview");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = useIsDirty(input);
  const { guard, dialog } = useDiscardGuard(dirty);

  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  async function save() {
    if (lock.current) return;
    const { company_id, name, tax_id, email, phone, address, status, default_currency, profile } = input;
    const parsed = customerMasterInputSchema.safeParse({
      company_id,
      name,
      tax_id,
      email,
      phone,
      address,
      status,
      default_currency,
      profile,
    });
    if (!parsed.success) {
      const next = Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join("."), issue.message]));
      setErrors(next);
      setTab(supplierErrorTab(Object.keys(next)[0] ?? "name"));
      setError("Review the highlighted customer fields.");
      return;
    }
    lock.current = true;
    setSaving(true);
    setErrors({});
    setError("");
    const editable = customerMasterInputSchema.omit({ default_currency: true }).strip().parse(parsed.data);
    const fingerprint = JSON.stringify(parsed.data);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const saved = record
        ? await api.updateCustomerMaster(
            record.id,
            { ...editable, expected_version: record.version },
            csrfToken(),
            retry.current.key,
          )
        : await api.createCustomerMaster(parsed.data, csrfToken(), retry.current.key);
      onDirtyChange?.(false);
      notify(`Customer ${saved.code} saved.`);
      onClose();
    } catch (caught) {
      setError(salesError(caught));
    } finally {
      setSaving(false);
      lock.current = false;
    }
  }

  return (
    <>
      <WorkForm
        aria-label="Customer form"
        className="grid gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <ProfileFormHeader
          action={record ? "Edit customer" : "New customer"}
          category={input.profile.entity_type === "company" ? "Company" : "Individual"}
          title={input.name.trim() || "Create a customer"}
          codeLabel="Customer code"
          code={record?.code ?? "CUS-…"}
        />
        {error ? (
          <p role="alert" className="m-0 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <fieldset disabled={saving} className="m-0 grid min-w-0 gap-4 border-0 p-0">
          <legend className="sr-only">Customer profile</legend>
          <BusinessProfileFields
            party="Customer"
            input={input}
            tab={tab}
            onTabChange={setTab}
            errors={errors}
            onChange={(patch) => setInput((previous) => ({ ...previous, ...patch }))}
            currencies={directory.currencies}
            overviewExtra={
              <LabeledField
                label="Default currency *"
                hint={record ? "Assigned when the financial account was created." : errors.default_currency}
              >
                <select
                  className={workSelectClass}
                  value={input.default_currency}
                  disabled={!!record}
                  aria-invalid={!!errors.default_currency}
                  onChange={(event) => setInput((previous) => ({ ...previous, default_currency: event.target.value }))}
                >
                  {record && !directory.currencies.some((item) => item.code === record.default_currency) ? (
                    <option value={record.default_currency}>{record.default_currency}</option>
                  ) : null}
                  {directory.currencies.map(({ code, name }) => (
                    <option key={code} value={code}>
                      {code} · {name}
                    </option>
                  ))}
                </select>
              </LabeledField>
            }
          />
        </fieldset>
        <ProfileFormFooter message={dirty ? "Unsaved changes" : undefined}>
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            disabled={saving}
            onClick={() =>
              guard(() => {
                onDirtyChange?.(false);
                onClose();
              })
            }
          >
            Cancel
          </Button>
          <Button type="submit" className="rounded-full" disabled={saving}>
            {saving ? "Saving…" : "Save Customer"}
          </Button>
        </ProfileFormFooter>
      </WorkForm>
      {dialog}
    </>
  );
}
