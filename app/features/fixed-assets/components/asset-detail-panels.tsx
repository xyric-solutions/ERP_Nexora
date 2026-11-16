"use client";
import { useEffect, useState } from "react";
import type { AssetDetail, AssetJournalDirectory, AssetOptions, AssetEvent, AssetValuation } from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WorkTable } from "./asset-table";
import { Field, Section, Select, moneyLabel, today } from "./asset-fields";
import { assetAccrualQuerySchema, type AssetAccrualSchedule } from "@nexora/contracts";

export function AssetPurchaseInformation({ detail }: { detail: AssetDetail }) {
  const { source, asset } = detail;
  return (
    <Section
      title="Purchase Information"
      description="References come from the original posted acquisition; registration creates no additional acquisition journal."
    >
      {[
        ["Asset ID", asset.id],
        ["Asset code", asset.code],
        ["Vendor", source.supplier_name ?? asset.supplier_name ?? asset.supplier_id ?? "Not recorded"],
        ["Vendor ID", asset.supplier_id ?? "Not recorded"],
        ["Purchase Order", source.purchase_order_reference ?? "Not linked"],
        ["Purchase Bill", source.purchase_bill_reference ?? source.reference],
        ["Vendor invoice", source.vendor_invoice_reference ?? "Not linked"],
        ["Invoice date", source.invoice_date ?? "Not linked"],
        ["Purchase date", source.purchase_date ?? source.date],
        ["Acquisition date", asset.acquisition_date],
        ["Available for use", asset.in_service_date],
        ["Depreciation start", asset.depreciation_start],
        ["Original journal", source.entry_number],
        ["Transaction currency", source.currency],
        ["Historical exchange rate", source.exchange_rate],
        ["Allocated capitalized cost", `${moneyLabel(asset.cost, asset.decimal_places)} ${asset.base_currency}`],
        ["Posted source debit", `${moneyLabel(source.base_amount, asset.decimal_places)} ${source.base_currency}`],
      ].map(([label, value]) => (
        <div key={label}>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="break-words font-medium">{value}</p>
        </div>
      ))}
    </Section>
  );
}
export function AssetPhysicalInformation({ detail }: { detail: AssetDetail }) {
  const value = detail.asset.details;
  return (
    <Section title="Physical details">
      {(
        [
          ["manufacturer", "Manufacturer"],
          ["brand", "Brand"],
          ["model", "Model"],
          ["subcategory", "Subcategory"],
          ["asset_type", "Asset type"],
          ["uom", "Unit of measurement"],
          ["responsible_person", "Responsible person"],
          ["operational_status", "Operational status"],
          ["remarks", "Remarks"],
        ] as const
      ).map(([key, label]) => (
        <div key={key}>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="break-words">{String(value[key] ?? "Not recorded").replaceAll("_", " ")}</p>
        </div>
      ))}
      {(detail.asset.category.field_definitions ?? []).map((field) => (
        <div key={field.key}>
          <p className="text-xs text-muted-foreground">{field.label}</p>
          <p className="break-words">{value.custom_fields?.[field.key] ?? "Not recorded"}</p>
        </div>
      ))}
    </Section>
  );
}
export function AssetValuationPanel({ detail }: { detail: AssetDetail }) {
  const { api } = useSession(),
    [date, setDate] = useState(detail.valuation?.as_of ?? today()),
    [value, setValue] = useState<AssetValuation | undefined>(detail.valuation),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Section
      title="Daily accrual valuation"
      description="Calculated values include unposted accrual. Posted accumulated depreciation remains the General Ledger amount."
    >
      <Field label="Valuation as of">
        <Input
          type="date"
          min={detail.asset.last_financial_date}
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </Field>
      <Button
        type="button"
        variant="outline"
        disabled={busy || !date}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            setValue(await api.getFixedAssetValuation(detail.asset.id, detail.asset.company_id, date));
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : "Valuation unavailable.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Calculate valuation
      </Button>
      {value &&
        [
          ["Daily depreciation", value.daily_depreciation],
          ["Calculated depreciation to date", value.calculated_depreciation],
          ["Posted accumulated depreciation", value.posted_depreciation],
          ["Unposted accrual", value.unposted_accrual],
          ["Projected net book value", value.projected_net_book_value],
          ["Remaining depreciable value", value.remaining_depreciable_value],
        ].map(([label, amount]) => (
          <div key={label}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="font-medium">
              {moneyLabel(amount!, detail.asset.decimal_places)} {detail.asset.base_currency}
            </p>
          </div>
        ))}
      {value && (
        <p className="text-sm text-muted-foreground">
          Age: {value.age_days} days · Remaining life: {value.remaining_life_days} days · Life ends{" "}
          {value.useful_life_end}.{" "}
          {value.basis === "legacy_monthly"
            ? "This asset retains its approved monthly convention; daily accrual applies to new Actual/Actual policies."
            : "Daily accrual uses Actual/Actual calendar-year day counts."}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </Section>
  );
}
export function AssetJournalPanel({ detail }: { detail: AssetDetail }) {
  const { api } = useSession(),
    [offset, setOffset] = useState(0),
    [data, setData] = useState<AssetJournalDirectory | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true);
  useEffect(() => {
    let active = true;
    api
      .getFixedAssetJournals(detail.asset.id, detail.asset.company_id, offset)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((failure) => {
        if (active) setError(failure instanceof Error ? failure.message : "Journal history unavailable.");
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [api, detail.asset.id, detail.asset.version, detail.asset.company_id, offset]);
  return (
    <Section
      title="Accounting Transactions"
      description="Original acquisition, depreciation, lifecycle and reversal journals remain linked. Amounts are full journal totals; individual acquisition cost is shown in Purchase Information."
    >
      <div className="col-span-full flex min-w-0 flex-col gap-3">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <WorkTable tableId="asset-accounting-transactions" label="Accounting transactions" paging={false}>
          <thead>
            <tr>
              <th>Journal</th>
              <th>Date</th>
              <th>Source</th>
              <th>Debit</th>
              <th>Credit</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((row) => (
              <tr key={row.id}>
                <td>{row.reference}</td>
                <td>{row.date}</td>
                <td>{row.description}</td>
                <td>{moneyLabel(row.debit, detail.asset.decimal_places)}</td>
                <td>{moneyLabel(row.credit, detail.asset.decimal_places)}</td>
              </tr>
            ))}
            {!data?.items.length && (
              <tr>
                <td colSpan={5}>{busy ? "Loading journals…" : "No journal transactions recorded."}</td>
              </tr>
            )}
          </tbody>
        </WorkTable>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={busy || offset === 0}
            onClick={() => {
              setBusy(true);
              setError("");
              setOffset(Math.max(0, offset - 30));
            }}
          >
            Newer journals
          </Button>
          <Button
            variant="outline"
            disabled={busy || data?.next_offset == null}
            onClick={() => {
              setBusy(true);
              setError("");
              setOffset(data?.next_offset ?? 0);
            }}
          >
            Older journals
          </Button>
        </div>
      </div>
    </Section>
  );
}
export function AssetAccrualSchedulePanel({ detail, options }: { detail: AssetDetail; options: AssetOptions }) {
  const { api } = useSession(),
    asset = detail.asset;
  const next = asset.last_depreciation_end
    ? new Date(Date.parse(asset.last_depreciation_end) + 86400000).toISOString().slice(0, 10)
    : asset.depreciation_start;
  const initial = [next, asset.accrual_basis?.start ?? next].sort().at(-1)!;
  const [from, setFrom] = useState(initial),
    [to, setTo] = useState(new Date(Date.parse(initial) + 364 * 86400000).toISOString().slice(0, 10)),
    [frequency, setFrequency] = useState<AssetAccrualSchedule["frequency"]>(
      options.company_policy?.summary_frequency ?? "monthly",
    ),
    [data, setData] = useState<AssetAccrualSchedule | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (asset.category.calculation_basis !== "actual_actual" && asset.method !== "double_declining") return null;
  return (
    <Section
      title="Accrual schedule summaries"
      description="View up to 366 days of the current unposted accrual basis. Every frequency uses the same cumulative daily amounts; approved monthly GL history remains below."
    >
      <Field label="From">
        <Input type="date" min={initial} required value={from} onChange={(event) => setFrom(event.target.value)} />
      </Field>
      <Field label="Through">
        <Input type="date" min={from} required value={to} onChange={(event) => setTo(event.target.value)} />
      </Field>
      <Field label="Summary frequency">
        <Select
          value={frequency}
          items={[
            { id: "daily", name: "Daily" },
            { id: "monthly", name: "Monthly" },
            { id: "quarterly", name: "Quarterly" },
            { id: "annual", name: "Annual" },
          ]}
          onChange={(event) => setFrequency(assetAccrualQuerySchema.shape.frequency.parse(event.target.value))}
        />
      </Field>
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            setData(
              await api.getFixedAssetAccrualSchedule(asset.id, { company_id: asset.company_id, from, to, frequency }),
            );
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : "Accrual schedule unavailable.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Calculate schedule
      </Button>
      {error && (
        <p role="alert" className="col-span-full text-sm text-destructive">
          {error}
        </p>
      )}
      {data && (
        <div className="col-span-full min-w-0">
          <WorkTable tableId="asset-accrual-summary" label="Unposted accrual schedule">
            <thead>
              <tr>
                <th>Period</th>
                <th>Depreciation</th>
                <th>Accumulated depreciation</th>
                <th>Projected NBV</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.start}>
                  <td>
                    {row.start} – {row.end}
                  </td>
                  <td>{moneyLabel(row.amount, asset.decimal_places)}</td>
                  <td>{moneyLabel(row.accumulated_depreciation, asset.decimal_places)}</td>
                  <td>{moneyLabel(row.net_book_value, asset.decimal_places)}</td>
                </tr>
              ))}
            </tbody>
          </WorkTable>
        </div>
      )}
    </Section>
  );
}
export function AssetLifecycleHistory({
  detail,
  options,
  type,
  onOpen,
}: {
  detail: AssetDetail;
  options: AssetOptions;
  type: "maintenance" | "transfer";
  onOpen: (event: AssetEvent) => void;
}) {
  const events = detail.events.filter((event) => event.type === type);
  return (
    <Section title={type === "maintenance" ? "Maintenance History" : "Transfers and Assignments"}>
      {type === "transfer" && (
        <p className="col-span-full text-sm text-muted-foreground">
          Current custodian:{" "}
          {options.employees.find((value) => value.id === detail.asset.assignment.custodian_id)?.name ?? "Unassigned"}.
          Department:{" "}
          {options.departments.find((value) => value.id === detail.asset.assignment.department_id)?.name ??
            "Unassigned"}
          .
        </p>
      )}
      <div className="col-span-full flex flex-wrap gap-2">
        {events.map((event) => (
          <Button key={event.id} variant="outline" onClick={() => onOpen(event)}>
            {event.code} · {event.date} · {event.state}
          </Button>
        ))}
        {!events.length && (
          <p className="text-sm text-muted-foreground">
            No {type === "maintenance" ? "maintenance" : "transfer"} events recorded. Complete immutable evidence
            remains in Audit History.
          </p>
        )}
      </div>
    </Section>
  );
}
