"use client";
import { calculateHrSettlementMinor, type HrLifecycleCaseTerms } from "@nexora/contracts";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Field } from "../components/hr-workspace-controls";
type Line = Extract<HrLifecycleCaseTerms, { kind: "settlement" }>["lines"][number];
export function SettlementLineCalculation({
  line,
  index,
  busy,
  onChange,
}: {
  line: Line;
  index: number;
  busy: boolean;
  onChange: (value: Line) => void;
}) {
  const calc = line.calculation;
  function change(quantity: string, rate_minor: string) {
    let amount = line.amount_minor;
    try {
      amount = calculateHrSettlementMinor(quantity, rate_minor, calc?.rate_divisor, calc?.rate_multiplier);
    } catch {
      // Preserve the last valid amount while the officer completes quantity/rate input.
    }
    onChange({ ...line, calculation: { ...calc, quantity, rate_minor, rounding: "half_up" }, amount_minor: amount });
  }
  const id = "settlement-calculate-" + index;
  return (
    <div className="min-w-0 space-y-3">
      <label htmlFor={id} className="flex items-center gap-2 text-sm">
        <Checkbox
          id={id}
          checked={!!calc}
          disabled={busy}
          onCheckedChange={(checked) => {
            if (checked)
              onChange({ ...line, calculation: { quantity: "1", rate_minor: line.amount_minor, rounding: "half_up" } });
            else {
              const { calculation: removed, ...rest } = line;
              void removed;
              onChange(rest);
            }
          }}
        />
        Calculate this line from reviewed quantity and rate
      </label>
      {calc && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field title={"Line " + (index + 1) + " quantity"}>
              <Input
                value={calc.quantity}
                inputMode="decimal"
                pattern="(0|[1-9][0-9]{0,6})(\.[0-9]{1,4})?"
                required
                disabled={busy}
                onChange={(e) => change(e.target.value, calc.rate_minor)}
              />
            </Field>
            <Field title={"Line " + (index + 1) + " rate in minor units"}>
              <Input
                value={calc.rate_minor}
                inputMode="numeric"
                pattern="(0|[1-9][0-9]{0,14})"
                required
                disabled={busy}
                onChange={(e) => change(calc.quantity, e.target.value)}
              />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            Exact quantity × rate
            {calc.rate_multiplier || calc.rate_divisor
              ? " × " + (calc.rate_multiplier ?? 1) + " ÷ " + (calc.rate_divisor ?? 1)
              : ""}
            , rounded half up once to the smallest currency unit. Record the approved policy, eligible days or service
            period and rate source below. This calculator does not determine legal entitlement or consume a leave
            balance.
          </p>
        </>
      )}
    </div>
  );
}
