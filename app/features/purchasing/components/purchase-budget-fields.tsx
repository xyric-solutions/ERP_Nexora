"use client";
import { type ProcurementOptions, type PurchaseLine } from "@nexora/contracts";
import { LabeledField } from "@/shared/ui/labeled-field";
import { workSelectClass } from "@/shared/ui/work-table";

export function PurchaseBudgetFields({
  line,
  index,
  options,
  disabled,
  onChange,
}: {
  line: PurchaseLine;
  index: number;
  options: ProcurementOptions;
  disabled: boolean;
  onChange: (patch: Partial<PurchaseLine>) => void;
}) {
  const references = options.budget_dimensions;
  if (!references) return null;
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs text-muted-foreground">Budget period & dimensions</summary>
      <fieldset disabled={disabled} className="m-0 mt-2 grid min-w-52 gap-2 border-0 p-0">
        <LabeledField label={`Line ${index + 1} expected spend period`}>
          <select
            className={workSelectClass}
            value={line.budget_period_id ?? ""}
            onChange={(e) => onChange({ budget_period_id: e.target.value || undefined })}
          >
            <option value="">Use due date / document period</option>
            {references.periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.start.slice(0, 7)} · P{p.number}
              </option>
            ))}
          </select>
        </LabeledField>
        {(
          [
            ["department", "Department", references.departments],
            ["project", "Project", references.projects],
            ["cost_centre", "Cost centre", references.cost_centres],
            ["branch", "Branch", references.branches],
          ] as const
        ).map(([key, label, items]) => (
          <LabeledField key={key} label={`Line ${index + 1} ${label}`}>
            <select
              className={workSelectClass}
              value={line.dimensions?.[key] ?? ""}
              onChange={(e) => {
                const dimensions = { ...line.dimensions };
                if (e.target.value) dimensions[key] = e.target.value;
                else delete dimensions[key];
                onChange({ dimensions });
              }}
            >
              <option value="">Unrestricted</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} · {item.name}
                </option>
              ))}
            </select>
          </LabeledField>
        ))}
      </fieldset>
    </details>
  );
}
