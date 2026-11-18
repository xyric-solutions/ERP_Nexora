"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { workSelectClass } from "@/shared/ui/work-table";
import { BudgetField, BudgetSelect, BudgetDimensionsFields } from "./budget-controls";
import {
  budgetModelInputSchema,
  type BudgetOptions,
  type BudgetDetail,
  type BudgetPolicy,
  type BudgetGenerate,
  type BudgetModelInput,
  type BudgetModel,
  type BudgetRequestInput,
  type BudgetPolicyInput,
  type BudgetPlanInput,
  type BudgetSourceControl,
} from "@nexora/contracts";

export function BudgetDialog({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function NewBudgetDialog({
  options,
  company,
  busy,
  onSave,
  onClose,
}: {
  options: BudgetOptions;
  company: string;
  busy: boolean;
  onSave: (input: BudgetPlanInput) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(""),
    [calendar, setCalendar] = useState(options.calendars[0]?.id ?? ""),
    [reason, setReason] = useState("");
  return (
    <BudgetDialog
      title="Create budget plan"
      description="A stable code is allocated when the plan is saved. Versions hold its allocations and approvals."
      onClose={onClose}
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ company_id: company, name, fiscal_calendar_id: calendar, reason });
        }}
      >
        <BudgetField label="Budget name">
          <Input required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
        </BudgetField>
        <BudgetSelect
          label="Fiscal calendar"
          value={calendar}
          options={options.calendars}
          empty="Select fiscal year"
          onChange={setCalendar}
        />
        <BudgetField label="Reason">
          <Textarea required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </BudgetField>
        <Button type="submit" disabled={busy || !calendar}>
          Create plan
        </Button>
      </form>
    </BudgetDialog>
  );
}
export function GenerateBudgetDialog({
  detail,
  kind,
  initialCase = "expected",
  company,
  busy,
  onSave,
  onClose,
}: {
  detail: BudgetDetail;
  kind: "revision" | "scenario" | "forecast";
  initialCase?: "best" | "expected" | "worst";
  company: string;
  busy: boolean;
  onSave: (input: BudgetGenerate) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(""),
    [method, setMethod] = useState<BudgetGenerate["method"]>("copy"),
    [scenario, setScenario] = useState<BudgetGenerate["case"]>(initialCase),
    [growth, setGrowth] = useState("0"),
    [cutoff, setCutoff] = useState(new Date().toLocaleDateString("en-CA")),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [horizon, setHorizon] = useState(12),
    [reason, setReason] = useState("");
  return (
    <BudgetDialog
      title={`Create ${kind}`}
      description={`Source: ${detail.record.plan_code} version ${detail.record.number}. A separate draft preserves the source.`}
      onClose={onClose}
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            company_id: company,
            source_version_id: detail.record.id,
            name,
            kind,
            case: scenario,
            method,
            growth_percent: growth,
            cutoff,
            ...(from ? { history_from: from } : {}),
            ...(to ? { history_to: to } : {}),
            horizon,
            reason,
          });
        }}
      >
        <BudgetField label="Version name">
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </BudgetField>
        <div className="grid gap-3 sm:grid-cols-2">
          <BudgetField label="Calculation method">
            <select
              className={workSelectClass}
              value={method}
              onChange={(e) => setMethod(e.target.value as BudgetGenerate["method"])}
            >
              <option value="copy">Copy / manual adjustment</option>
              {kind !== "revision" && (
                <>
                  <option value="historical">Historical seasonal forecast</option>
                  <option value="rolling">Rolling historical forecast</option>
                </>
              )}
            </select>
          </BudgetField>
          <BudgetField label="Scenario">
            <select
              className={workSelectClass}
              value={scenario}
              onChange={(e) => setScenario(e.target.value as BudgetGenerate["case"])}
            >
              <option value="expected">Expected case</option>
              <option value="best">Best case</option>
              <option value="worst">Worst case</option>
            </select>
          </BudgetField>
          <BudgetField label="Growth / adjustment %">
            <Input inputMode="decimal" value={growth} onChange={(e) => setGrowth(e.target.value)} />
          </BudgetField>
          <BudgetField label="Actuals cutoff">
            <Input type="date" required value={cutoff} onChange={(e) => setCutoff(e.target.value)} />
          </BudgetField>
          {method !== "copy" && (
            <>
              <BudgetField label="History from">
                <Input type="date" required value={from} onChange={(e) => setFrom(e.target.value)} />
              </BudgetField>
              <BudgetField label="History through">
                <Input type="date" required value={to} onChange={(e) => setTo(e.target.value)} />
              </BudgetField>
            </>
          )}
          {method === "rolling" && (
            <BudgetField label="Future periods">
              <Input
                type="number"
                min={1}
                max={36}
                value={horizon}
                onChange={(e) => setHorizon(Number(e.target.value))}
              />
            </BudgetField>
          )}
        </div>
        <BudgetField label="Reason and assumptions">
          <Textarea required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </BudgetField>
        <Button type="submit" disabled={busy}>
          Create draft {kind}
        </Button>
      </form>
    </BudgetDialog>
  );
}
export function BudgetPolicyDialog({
  detail,
  policy,
  company,
  busy,
  onSave,
  onClose,
}: {
  detail: BudgetDetail;
  policy: BudgetPolicy | null;
  company: string;
  busy: boolean;
  onSave: (input: BudgetPolicyInput) => void;
  onClose: () => void;
}) {
  const [enabled, setEnabled] = useState(policy?.enabled ?? true),
    [mode, setMode] = useState<BudgetPolicyInput["mode"]>(policy?.mode ?? "block"),
    [threshold, setThreshold] = useState(policy?.warn_percent ?? "80"),
    [date, setDate] = useState(new Date().toLocaleDateString("en-CA")),
    [reason, setReason] = useState("");
  return (
    <BudgetDialog
      title="Activate budget controls"
      description="Binds this independently approved version to purchasing and GL controls. Existing exposure is rechecked atomically."
      onClose={onClose}
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            company_id: company,
            fiscal_calendar_id: detail.record.fiscal_calendar_id,
            control_version_id: detail.record.id,
            expected_version: policy?.version ?? 0,
            enabled,
            mode,
            warn_percent: threshold,
            effective_date: date,
            reason,
          });
        }}
      >
        <div className="flex items-center gap-2">
          <Checkbox id="budget-controls-enabled" checked={enabled} onCheckedChange={(v) => setEnabled(v === true)} />
          <label htmlFor="budget-controls-enabled" className="text-sm">
            Enable controls
          </label>
        </div>
        <BudgetField label="Over-budget handling">
          <select
            className={workSelectClass}
            value={mode}
            onChange={(e) => setMode(e.target.value as BudgetPolicyInput["mode"])}
          >
            <option value="warning">Warn and allow</option>
            <option value="approval">Require independent exception</option>
            <option value="block">Block until budget is available</option>
          </select>
        </BudgetField>
        <BudgetField label="Utilization warning threshold %">
          <Input inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        </BudgetField>
        <BudgetField label="Effective date">
          <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </BudgetField>
        <BudgetField label="Activation reason">
          <Textarea required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </BudgetField>
        <Button type="submit" disabled={busy}>
          Save control policy
        </Button>
      </form>
    </BudgetDialog>
  );
}
export function BudgetTransferDialog({
  detail,
  options,
  company,
  busy,
  onSave,
  onClose,
}: {
  detail: BudgetDetail;
  options: BudgetOptions;
  company: string;
  busy: boolean;
  onSave: (input: BudgetRequestInput) => void;
  onClose: () => void;
}) {
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [fromPeriod, setFromPeriod] = useState(""),
    [toPeriod, setToPeriod] = useState(""),
    [amount, setAmount] = useState(""),
    [reason, setReason] = useState("");
  const choices = detail.lines.map((l) => ({
    id: l.id,
    name: `${l.account_code} ${l.account_name} ${Object.values(l.dimensions).join(" / ")}`,
  }));
  const periods = (line: string) =>
    options.periods
      .filter((p) => detail.lines.find((l) => l.id === line)?.allocations.some((a) => a.period_id === p.id))
      .map((p) => ({ id: p.id, name: p.start.slice(0, 7) }));
  return (
    <BudgetDialog
      title="Request budget transfer"
      description="An independent approval moves available budget between allocations without changing approved source amounts."
      onClose={onClose}
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            company_id: company,
            request: {
              kind: "transfer",
              version_id: detail.record.id,
              from_line_id: from,
              from_period_id: fromPeriod,
              to_line_id: to,
              to_period_id: toPeriod,
              amount,
            },
            reason,
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <BudgetSelect
            label="From allocation"
            value={from}
            options={choices}
            empty="Select source"
            onChange={(v) => {
              setFrom(v);
              setFromPeriod("");
            }}
          />
          <BudgetSelect
            label="Source period"
            value={fromPeriod}
            options={periods(from)}
            empty="Select period"
            onChange={setFromPeriod}
          />
          <BudgetSelect
            label="To allocation"
            value={to}
            options={choices}
            empty="Select destination"
            onChange={(v) => {
              setTo(v);
              setToPeriod("");
            }}
          />
          <BudgetSelect
            label="Destination period"
            value={toPeriod}
            options={periods(to)}
            empty="Select period"
            onChange={setToPeriod}
          />
        </div>
        <BudgetField label={`Amount (${detail.record.currency})`}>
          <Input required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </BudgetField>
        <BudgetField label="Transfer reason">
          <Textarea required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </BudgetField>
        <Button type="submit" disabled={busy || !from || !to || !fromPeriod || !toPeriod}>
          Submit transfer for approval
        </Button>
      </form>
    </BudgetDialog>
  );
}
export function BudgetModelDialog({
  options,
  model,
  company,
  busy,
  onSave,
  onClose,
}: {
  options: BudgetOptions;
  model: BudgetModel | null;
  company: string;
  busy: boolean;
  onSave: (input: BudgetModelInput, id?: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(model?.name ?? ""),
    [active, setActive] = useState(model?.active ?? true),
    [reason, setReason] = useState(""),
    [lines, setLines] = useState<BudgetModelInput["lines"]>(model?.lines ?? []),
    [error, setError] = useState("");
  return (
    <BudgetDialog
      title={model ? "Edit budget model" : "Create budget model"}
      description="Reusable account allocations and fiscal-period weights. Applying this model changes only a draft."
      onClose={onClose}
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            onSave(
              budgetModelInputSchema.parse({
                company_id: company,
                name,
                active,
                ...(model ? { expected_version: model.version } : {}),
                lines,
                reason,
              }),
              model?.id,
            );
          } catch {
            setError("Complete the name, account amounts, twelve weights and reason.");
          }
        }}
      >
        <BudgetField label="Model name">
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </BudgetField>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        {lines.map((line, index) => (
          <fieldset key={index} className="grid gap-3 rounded-lg border border-border p-3">
            <legend className="text-sm font-medium">Account {index + 1}</legend>
            <BudgetSelect
              label="Account"
              value={line.account_id}
              options={options.accounts}
              empty="Select posting account"
              onChange={(value) =>
                setLines((current) => current.map((l, i) => (i === index ? { ...l, account_id: value } : l)))
              }
            />
            <BudgetDimensionsFields
              options={options}
              value={line.dimensions}
              onChange={(value) =>
                setLines((current) => current.map((l, i) => (i === index ? { ...l, dimensions: value } : l)))
              }
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <BudgetField label="Annual amount">
                <Input
                  required
                  inputMode="decimal"
                  value={line.amount}
                  onChange={(e) =>
                    setLines((current) => current.map((l, i) => (i === index ? { ...l, amount: e.target.value } : l)))
                  }
                />
              </BudgetField>
              <BudgetField label="Twelve fiscal period weights">
                <Input
                  value={line.weights.join(",")}
                  onChange={(e) =>
                    setLines((current) =>
                      current.map((l, i) =>
                        i === index ? { ...l, weights: e.target.value.split(",").map((v) => v.trim()) } : l,
                      ),
                    )
                  }
                />
              </BudgetField>
            </div>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
            >
              Remove account
            </Button>
          </fieldset>
        ))}
        <Button
          variant="outline"
          type="button"
          size="sm"
          onClick={() =>
            setLines((current) => [
              ...current,
              {
                account_id: "",
                dimensions: {},
                amount: "0",
                weights: Array.from({ length: 12 }, () => "1"),
                notes: "",
              },
            ])
          }
        >
          Add model account
        </Button>
        <div className="flex items-center gap-2">
          <Checkbox id="budget-model-active" checked={active} onCheckedChange={(v) => setActive(v === true)} />
          <label htmlFor="budget-model-active">Active model</label>
        </div>
        <BudgetField label="Reason">
          <Textarea required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </BudgetField>
        <Button type="submit" disabled={busy}>
          Save model
        </Button>
      </form>
    </BudgetDialog>
  );
}
export function BudgetExceptionDialog({
  source,
  company,
  busy,
  onSave,
  onClose,
}: {
  source: BudgetSourceControl;
  company: string;
  busy: boolean;
  onSave: (input: BudgetRequestInput) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const approvalPolicies = source.policies.filter((policy) => policy.enabled && policy.mode === "approval");
  const [policyId, setPolicyId] = useState(
    source.policy?.mode === "approval" ? source.policy.id : (approvalPolicies[0]?.id ?? ""),
  );
  return (
    <BudgetDialog
      title={`Request exception · ${source.code}`}
      description="Approval is tied to this source version and policy. Changes to source terms invalidate the exception."
      onClose={onClose}
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (approvalPolicies.some((policy) => policy.id === policyId))
            onSave({
              company_id: company,
              request: {
                kind: "exception",
                source_document_id: source.source_document_id,
                source_version: source.source_version,
                source_hash: source.source_hash,
                policy_id: policyId,
              },
              reason,
            });
        }}
      >
        <BudgetSelect
          label="Expected spending year policy"
          value={policyId}
          onChange={setPolicyId}
          options={approvalPolicies.map((policy) => ({
            id: policy.id,
            name: `${policy.fiscal_calendar_id} · effective ${policy.effective_date}`,
          }))}
          empty="Select approval policy"
        />
        <BudgetField label="Business justification">
          <Textarea required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </BudgetField>
        <Button type="submit" disabled={busy || !policyId}>
          Submit exception
        </Button>
      </form>
    </BudgetDialog>
  );
}
