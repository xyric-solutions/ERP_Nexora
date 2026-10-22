"use client";
import type { HrSettlementSalaryEvidence } from "@nexora/contracts";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "./hr-workspace-controls";
import { formatHrMinor } from "./payroll-money";

export function SettlementSalaryFactors({ busy, labelPrefix = "Salary" }: { busy: boolean; labelPrefix?: string }) {
  return (
    <>
      <Field title={labelPrefix + " multiplier"}>
        <Input name="salary_multiplier" type="number" min={1} max={10000} step={1} required disabled={busy} />
      </Field>
      <Field title={labelPrefix + " divisor"}>
        <Input name="salary_divisor" type="number" min={1} max={36600} step={1} required disabled={busy} />
      </Field>
    </>
  );
}
export function SettlementSalaryComponents({
  busy,
  components,
}: {
  busy: boolean;
  components: Array<{ id: string; name: string; code: string }>;
}) {
  return (
    <fieldset className="min-w-0 space-y-2 rounded-lg border border-border p-3">
      <legend className="px-1 text-sm font-medium">Included salary earning components</legend>
      <p className="text-sm text-muted-foreground">
        Select fixed earnings from the independently approved monthly salary. Enter the signed policy multiplier and
        divisor explicitly. Formula, hourly, daily and annual rates are not converted automatically.
      </p>
      {!components.length && (
        <p className="text-sm">No active fixed earning components are available. Review Payroll setup first.</p>
      )}
      {components.map((c) => (
        <label key={c.id} className="flex items-start gap-2 text-sm">
          <Checkbox name="salary_components" value={c.id} disabled={busy} />
          <span className="min-w-0 break-words">
            {c.name} ({c.code})
          </span>
        </label>
      ))}
    </fieldset>
  );
}
export function SettlementSalaryEvidence({
  salary,
  currency,
  scale,
  quantity,
  unit,
}: {
  salary: HrSettlementSalaryEvidence;
  currency: string;
  scale: number;
  quantity: string | number;
  unit: string;
}) {
  return (
    <section
      aria-label="Approved salary basis evidence"
      className="space-y-2 rounded-lg border border-border p-3 text-sm"
    >
      <h4 className="font-semibold">Approved salary basis</h4>
      <p className="break-all">
        Salary {salary.assignment_id} · version {salary.assignment_version} · effective {salary.effective_from}
        {salary.effective_to ? " to " + salary.effective_to : ""}
      </p>
      <ul className="space-y-1">
        {salary.components.map((c) => (
          <li key={c.id} className="break-words">
            {c.name}: {currency} {formatHrMinor(c.amount_minor, scale)}
          </li>
        ))}
      </ul>
      <p className="font-medium">
        Basis {currency} {formatHrMinor(salary.basis_minor, scale)} × {salary.multiplier} ÷ {salary.divisor} ×{" "}
        {quantity} {unit}. The total rounds half up once.
      </p>
    </section>
  );
}
