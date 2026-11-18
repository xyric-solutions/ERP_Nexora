"use client";
import { useState } from "react";
import { Plus, Trash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { WorkTable, workSelectClass } from "@/shared/ui/work-table";
import {
  budgetVersionInputSchema,
  spreadBudget,
  decimal,
  decimalText,
  type BudgetOptions,
  type BudgetDirectory,
  type BudgetDetail,
  type BudgetLineInput,
  type BudgetVersionInput,
} from "@nexora/contracts";
import {
  BudgetField,
  BudgetSelect,
  BudgetDimensionsFields,
  budgetPanel,
  budgetHead,
  budgetCell,
  budgetDisplay,
} from "./budget-controls";
type DraftLine = BudgetLineInput & { key: string };
export function BudgetEntry({
  options,
  directory,
  detail,
  company,
  busy,
  canEdit,
  onSave,
}: {
  options: BudgetOptions;
  directory: BudgetDirectory;
  detail: BudgetDetail | null;
  company: string;
  busy: boolean;
  canEdit: boolean;
  onSave: (input: BudgetVersionInput, id?: string, version?: number) => Promise<void>;
}) {
  const [plan, setPlan] = useState(detail?.record.plan_id ?? directory.plans[0]?.id ?? ""),
    [name, setName] = useState(detail?.record.name ?? ""),
    [reason, setReason] = useState("");
  const [kind, setKind] = useState<BudgetVersionInput["kind"]>(detail?.record.kind ?? "baseline"),
    [cutoff, setCutoff] = useState(detail?.record.cutoff ?? "");
  const [lines, setLines] = useState<DraftLine[]>(
    detail?.lines.map(({ account_id, dimensions, notes, allocations, id }) => ({
      key: id,
      account_id,
      dimensions,
      notes,
      allocations,
    })) ?? [],
  );
  const [error, setError] = useState(""),
    [spreadAmount, setSpreadAmount] = useState(""),
    [spreadMode, setSpreadMode] = useState("annual"),
    [quarter, setQuarter] = useState("1"),
    [weights, setWeights] = useState("1,1,1,1,1,1,1,1,1,1,1,1"),
    [spreadLine, setSpreadLine] = useState("");
  const selectedPlan = directory.plans.find((p) => p.id === plan),
    calendar = detail?.record.fiscal_calendar_id ?? selectedPlan?.fiscal_calendar_id;
  const periodIds = new Set(lines.flatMap((l) => l.allocations.map((a) => a.period_id)));
  const periods = options.periods.filter((p) => p.fiscal_calendar_id === calendar || periodIds.has(p.id));
  const editable = canEdit && (!detail || ["draft", "rejected"].includes(detail.record.state));
  const update = (key: string, patch: Partial<DraftLine>) =>
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const sum = (line: DraftLine) =>
    line.allocations.reduce((total, a) => {
      try {
        return total + decimal(a.amount || "0", 8);
      } catch {
        return total;
      }
    }, 0n);
  function spread() {
    try {
      const row = lines.find((l) => l.key === spreadLine);
      if (!row) throw new Error("Select the line to spread.");
      const selected =
        spreadMode === "quarterly"
          ? periods.filter((p) => p.number >= Number(quarter) * 3 - 2 && p.number <= Number(quarter) * 3)
          : periods.filter((p) => p.fiscal_calendar_id === calendar);
      if (!selected.length) throw new Error("Configure the selected fiscal periods.");
      const inputWeights =
        spreadMode === "weighted" ? weights.split(",").map((v) => v.trim()) : selected.map(() => "1");
      if (inputWeights.length !== selected.length) throw new Error("Enter one comma-separated weight for each period.");
      const amounts = spreadBudget(spreadAmount, inputWeights, options.decimal_places);
      update(row.key, {
        allocations: [
          ...row.allocations.filter((a) => !selected.some((p) => p.id === a.period_id)),
          ...selected.map((p, i) => ({ period_id: p.id, amount: amounts[i]! })),
        ],
      });
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The allocation could not be spread.");
    }
  }
  async function save() {
    try {
      setError("");
      const input = budgetVersionInputSchema.parse({
        company_id: company,
        plan_id: plan,
        name,
        kind,
        parent_id: detail?.record.parent_id ?? null,
        cutoff: cutoff || null,
        assumptions: detail?.record.assumptions ?? { method: "manual" },
        lines: lines.map(({ account_id, dimensions, notes, allocations }) => ({
          account_id,
          dimensions,
          notes,
          allocations,
        })),
        reason,
      });
      await onSave(input, detail?.record.id, detail?.record.version);
    } catch (e) {
      setError(
        e instanceof Error && e.name !== "ZodError"
          ? e.message
          : "Complete the version name, account allocations and reason.",
      );
    }
  }
  return (
    <section className={budgetPanel} aria-label="Budget allocation editor">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
        <div>
          <h2 className="text-base font-semibold">
            {detail ? `${detail.record.plan_code} / Version ${detail.record.number}` : "New budget version"}
          </h2>
          <p className="text-xs text-muted-foreground">
            {editable
              ? "Exact fiscal allocations · approved versions remain immutable"
              : "Approved or submitted allocations are read-only"}
          </p>
        </div>
        {editable && (
          <Button size="sm" disabled={busy} onClick={() => void save()}>
            <Save />
            Save version
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="m-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <fieldset disabled={!editable || busy} className="m-0 grid min-w-0 gap-4 border-0 p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <BudgetSelect
            label="Budget plan"
            value={plan}
            options={directory.plans}
            empty="Select plan"
            disabled={!!detail}
            onChange={(v) => {
              setPlan(v);
              setLines([]);
            }}
          />
          <BudgetField label="Version name">
            <Input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} required />
          </BudgetField>
          <BudgetField label="Purpose">
            <select
              className={workSelectClass}
              value={kind}
              onChange={(e) => setKind(e.target.value === "forecast" ? "forecast" : "baseline")}
              disabled={!!detail}
            >
              <option value="baseline">Budget baseline</option>
              <option value="forecast">Manual forecast</option>
              {detail && !["baseline", "forecast"].includes(kind) && <option value={kind}>{kind}</option>}
            </select>
          </BudgetField>
          {kind === "forecast" && (
            <BudgetField label="Actuals cutoff">
              <Input type="date" value={cutoff} onChange={(e) => setCutoff(e.target.value)} />
            </BudgetField>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-2 rounded-lg bg-muted p-3">
          <BudgetSelect
            label="Spread to line"
            value={spreadLine}
            options={lines.map((l, i) => ({
              id: l.key,
              name: options.accounts.find((a) => a.id === l.account_id)?.name ?? `Line ${i + 1}`,
            }))}
            empty="Select line"
            onChange={setSpreadLine}
          />
          <BudgetField label="Allocation">
            <select className={workSelectClass} value={spreadMode} onChange={(e) => setSpreadMode(e.target.value)}>
              <option value="annual">Annual · even spread</option>
              <option value="quarterly">Quarterly · even spread</option>
              <option value="weighted">Annual · weighted spread</option>
            </select>
          </BudgetField>
          {spreadMode === "quarterly" && (
            <BudgetField label="Fiscal quarter">
              <select className={workSelectClass} value={quarter} onChange={(e) => setQuarter(e.target.value)}>
                {[1, 2, 3, 4].map((v) => (
                  <option key={v} value={v}>
                    Q{v}
                  </option>
                ))}
              </select>
            </BudgetField>
          )}
          <BudgetField label="Total to allocate">
            <Input
              className="w-36"
              inputMode="decimal"
              value={spreadAmount}
              onChange={(e) => setSpreadAmount(e.target.value)}
            />
          </BudgetField>
          {spreadMode === "weighted" && (
            <BudgetField label="Period weights">
              <Input value={weights} onChange={(e) => setWeights(e.target.value)} />
            </BudgetField>
          )}
          <Button type="button" size="sm" variant="outline" onClick={spread}>
            Apply spread
          </Button>
        </div>
        <div
          className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-ring"
          role="region"
          aria-label="Fiscal allocation grid"
        >
          <WorkTable tableId="budget-allocation-grid" tools={false} paging={false} className="w-full border-collapse">
            <caption className="sr-only">Budget account allocations by fiscal period in {options.currency}</caption>
            <thead>
              <tr>
                <th className={`${budgetHead} sticky left-0 z-10 min-w-64`}>Account / dimensions</th>
                {periods.map((p) => (
                  <th key={p.id} className={`${budgetHead} min-w-28`}>
                    {p.start.slice(0, 7)}
                    <span className="block font-normal">P{p.number}</span>
                  </th>
                ))}
                <th className={`${budgetHead} min-w-32 text-right`}>Annual total</th>
                <th className={budgetHead}>Action</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={line.key}>
                  <td className={`${budgetCell} sticky left-0 z-10 bg-card align-top`}>
                    <label className="sr-only" htmlFor={`budget-account-${line.key}`}>
                      Account for line {index + 1}
                    </label>
                    <select
                      id={`budget-account-${line.key}`}
                      className={`${workSelectClass} w-full`}
                      value={line.account_id}
                      onChange={(e) => update(line.key, { account_id: e.target.value })}
                    >
                      <option value="">Select account</option>
                      {line.account_id && !options.accounts.some((a) => a.id === line.account_id) && (
                        <option value={line.account_id}>
                          {detail?.lines.find((l) => l.id === line.key)?.account_code}{" "}
                          {detail?.lines.find((l) => l.id === line.key)?.account_name}
                        </option>
                      )}
                      {options.accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} · {a.name}
                        </option>
                      ))}
                    </select>
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer text-muted-foreground">
                        Dimensions & notes{" "}
                        {Object.keys(line.dimensions).length ? `(${Object.keys(line.dimensions).length})` : ""}
                      </summary>
                      <div className="mt-2 min-w-60 space-y-2">
                        <BudgetDimensionsFields
                          value={line.dimensions}
                          options={options}
                          onChange={(dimensions) => update(line.key, { dimensions })}
                        />
                        <BudgetField label={`Notes for line ${index + 1}`}>
                          <Textarea
                            rows={2}
                            value={line.notes}
                            onChange={(e) => update(line.key, { notes: e.target.value })}
                          />
                        </BudgetField>
                      </div>
                    </details>
                  </td>
                  {periods.map((p) => (
                    <td key={p.id} className={budgetCell}>
                      <Input
                        aria-label={`Line ${index + 1} ${p.start.slice(0, 7)} amount`}
                        disabled={kind === "forecast" && !!cutoff && p.end <= cutoff}
                        title={
                          kind === "forecast" && !!cutoff && p.end <= cutoff
                            ? "Posted GL actuals through the cutoff are authoritative."
                            : undefined
                        }
                        className="h-8 w-28 text-right tabular-nums"
                        inputMode="decimal"
                        value={line.allocations.find((a) => a.period_id === p.id)?.amount ?? ""}
                        onChange={(e) =>
                          update(line.key, {
                            allocations: [
                              ...line.allocations.filter((a) => a.period_id !== p.id),
                              ...(e.target.value !== "" ? [{ period_id: p.id, amount: e.target.value }] : []),
                            ],
                          })
                        }
                      />
                    </td>
                  ))}
                  <td className={`${budgetCell} text-right font-semibold tabular-nums`}>
                    {budgetDisplay(decimalText(sum(line), 8), options.decimal_places)}
                  </td>
                  <td className={budgetCell}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove line ${index + 1}`}
                      onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}
                    >
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              ))}
              {!lines.length && (
                <tr>
                  <td colSpan={periods.length + 3} className="p-8 text-center text-sm text-muted-foreground">
                    Add an account line and enter monthly allocations, or use a saved model.
                  </td>
                </tr>
              )}
            </tbody>
          </WorkTable>
        </div>
        {editable && (
          <Button
            variant="outline"
            size="sm"
            className="justify-self-start"
            onClick={() =>
              setLines((current) => [
                ...current,
                { key: crypto.randomUUID(), account_id: "", dimensions: {}, notes: "", allocations: [] },
              ])
            }
          >
            <Plus />
            Add account line
          </Button>
        )}
        <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
          <span className="text-muted-foreground">
            {lines.length} account lines · {options.currency}
          </span>
          <strong className="tabular-nums">
            Total{" "}
            {budgetDisplay(
              decimalText(
                lines.reduce((total, line) => total + sum(line), 0n),
                8,
              ),
              options.decimal_places,
            )}
          </strong>
        </div>
        {editable && (
          <BudgetField label="Change reason">
            <Textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain this version or allocation change"
              maxLength={2000}
            />
          </BudgetField>
        )}
      </fieldset>
    </section>
  );
}
