import { ArrowRightIcon, LandmarkIcon, Trash2Icon } from "lucide-react";
import type { BankTransferMode, BankTransferOptions } from "@nexora/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDecimalDisplay } from "@/shared/lib/decimal-display";
import { SearchableSelect } from "@/shared/ui/searchable-select";
import {
  estimateFxTransferAmount,
  reciprocalFxTransferRate,
  transferModes,
  type EditableTransferLine,
} from "../model/bank-transfer-entry";

type BankOption = BankTransferOptions["bank_accounts"][number];

export function BankFxTransferLine({
  line,
  index,
  count,
  accounts,
  editable,
  savedAmount,
  onChange,
  onDelete,
  destinationMatches,
}: {
  line: EditableTransferLine;
  index: number;
  count: number;
  accounts: BankOption[];
  editable: boolean;
  savedAmount?: { amount: string; currency: string; enteredRate: boolean };
  onChange: (patch: Partial<EditableTransferLine>) => void;
  onDelete: () => void;
  destinationMatches: (source: BankOption | undefined, destination: BankOption | undefined) => boolean;
}) {
  const source = accounts.find((account) => account.id === line.fromBankId);
  const destination = accounts.find((account) => account.id === line.toBankId);
  const crossCurrency = Boolean(source && destination && source.currency !== destination.currency);
  const estimate = crossCurrency ? estimateFxTransferAmount(line.amount, line.exchangeRate) : null;
  const inverse = crossCurrency ? reciprocalFxTransferRate(line.exchangeRate) : null;
  const inverseDisplay = inverse ? formatDecimalDisplay(inverse) : null;
  const receiving = savedAmount ? formatDecimalDisplay(savedAmount.amount) : estimate;
  const prefix = `fx-${line.id}`;
  const accountLabel = (account: BankOption) =>
    `${account.account_name} · ${account.currency} · ${account.account_number_masked ?? account.reference}`;

  return (
    <section aria-label={`FX transfer ${index + 1}`} className="min-w-0 rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">{count === 1 ? "Transfer details" : `Transfer ${index + 1}`}</h2>
          {source && destination ? (
            <Badge variant="outline">
              {source.currency} → {destination.currency}
            </Badge>
          ) : null}
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label="Delete transfer line"
          disabled={!editable || count === 1}
          onClick={onDelete}
        >
          <Trash2Icon className="size-3.5" />
          Remove
        </Button>
      </div>

      <div
        data-slot="fx-quote"
        className="grid min-w-0 gap-3 border-b border-border bg-muted/30 px-4 py-3 md:grid-cols-2 md:items-center"
      >
        {crossCurrency ? (
          <>
            <label htmlFor={`transfer-rate-${line.id}`} className="grid min-w-0 gap-1.5 text-xs font-semibold">
              Exchange rate
              <span className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 font-normal">1 {source?.currency} =</span>
                <Input
                  id={`transfer-rate-${line.id}`}
                  aria-label="Exchange rate"
                  inputMode="decimal"
                  className="min-w-0 max-w-60 text-right font-normal tabular-nums"
                  maxLength={39}
                  value={line.exchangeRate}
                  disabled={!editable}
                  placeholder="Configured rate"
                  onChange={(event) => onChange({ exchangeRate: event.target.value })}
                />
                <span className="shrink-0 font-normal">{destination?.currency} received</span>
              </span>
            </label>
            <div id={`${prefix}-quote-help`} className="grid min-w-0 gap-1 text-xs text-muted-foreground">
              {inverse ? (
                <p
                  className="m-0 font-medium text-foreground"
                  title={`1 ${destination?.currency} = ${inverse} ${source?.currency}`}
                >
                  1 {destination?.currency} {inverseDisplay === "0.00" ? "< 0.01" : `≈ ${inverseDisplay}`}{" "}
                  {source?.currency}
                </p>
              ) : null}
              <p className="m-0">Leave blank to use configured rates.</p>
              <p className="m-0">
                {savedAmount
                  ? `${savedAmount.currency} ${formatDecimalDisplay(savedAmount.amount)} · ${savedAmount.enteredRate ? "Entered exchange rate" : "Configured currency rates"}`
                  : estimate !== null
                    ? "Estimate only. The final receiving amount is confirmed when you save."
                    : "Save the draft to calculate and lock the destination amount and exchange-rate evidence."}
              </p>
            </div>
          </>
        ) : (
          <p id={`${prefix}-quote-help`} className="m-0 text-xs text-muted-foreground">
            Select the sending and receiving accounts to enter an exchange rate.
          </p>
        )}
      </div>

      <div className="grid min-w-0 gap-4 border-b border-border p-4 md:grid-cols-[minmax(0,1fr)_2.5rem_minmax(0,1fr)] md:gap-3">
        <div className="grid min-w-0 content-start gap-4">
          <div className="grid min-w-0 gap-1.5">
            <Label className="flex items-center gap-2 text-xs font-semibold">
              <LandmarkIcon className="size-3.5 text-muted-foreground" /> From Bank Account *
            </Label>
            <SearchableSelect
              label="From Bank"
              value={line.fromBankId}
              disabled={!editable}
              required
              placeholder="Select source Bank"
              options={accounts.map((account) => ({ value: account.id, label: accountLabel(account) }))}
              onValueChange={(value) =>
                onChange({
                  fromBankId: value,
                  toBankId:
                    value === line.toBankId ||
                    !destinationMatches(
                      accounts.find((account) => account.id === value),
                      destination,
                    )
                      ? ""
                      : line.toBankId,
                })
              }
            />
            <p className="m-0 min-h-4 truncate text-xs text-muted-foreground" title={source?.ledger_account_name}>
              {source ? `${source.ledger_account_code} · ${source.ledger_account_name}` : "Account to debit"}
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${prefix}-amount`} className="text-xs font-semibold">
              From amount *
            </Label>
            <div className="relative">
              <Input
                id={`${prefix}-amount`}
                aria-label="Amount"
                inputMode="decimal"
                className="h-12 pr-16 text-right text-lg font-semibold tabular-nums md:text-lg"
                placeholder="0.00"
                value={line.amount}
                disabled={!editable}
                onChange={(event) => onChange({ amount: event.target.value })}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                {source?.currency ?? "—"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center text-muted-foreground" aria-hidden="true">
          <ArrowRightIcon className="size-5 rotate-90 md:rotate-0" />
        </div>

        <div className="grid min-w-0 content-start gap-4">
          <div className="grid min-w-0 gap-1.5">
            <Label className="flex items-center gap-2 text-xs font-semibold">
              <LandmarkIcon className="size-3.5 text-muted-foreground" /> To Bank Account *
            </Label>
            <SearchableSelect
              label="To Bank"
              value={line.toBankId}
              disabled={!editable || !source}
              required
              placeholder="Select destination Bank"
              options={accounts
                .filter((account) => destinationMatches(source, account))
                .map((account) => ({
                  value: account.id,
                  label: accountLabel(account),
                  disabled: account.id === line.fromBankId,
                }))}
              onValueChange={(value) => onChange({ toBankId: value })}
            />
            <p
              className={`m-0 min-h-4 text-xs text-muted-foreground${destination ? " truncate" : ""}`}
              title={destination?.ledger_account_name}
            >
              {destination
                ? `${destination.ledger_account_code} · ${destination.ledger_account_name}`
                : source && !accounts.some((account) => account.id !== source.id && destinationMatches(source, account))
                  ? "No Bank Account in another currency is available for this company."
                  : "Account to credit"}
            </p>
          </div>
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`${prefix}-receiving`} className="text-xs font-semibold">
                To amount
              </Label>
              <span className="text-xs text-muted-foreground">{savedAmount ? "Saved amount" : "Estimated"}</span>
            </div>
            <div className="relative">
              <Input
                id={`${prefix}-receiving`}
                aria-label="To Amount"
                aria-describedby={`${prefix}-quote-help`}
                className="h-12 bg-muted/30 pr-16 text-right text-lg font-semibold tabular-nums md:text-lg"
                value={receiving ?? ""}
                title={savedAmount?.amount}
                placeholder="—"
                readOnly
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                {destination?.currency ?? "—"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid min-w-0 gap-3 p-4 sm:grid-cols-2">
        <label htmlFor={`${prefix}-mode`} className="grid gap-1.5 text-xs font-semibold">
          Mode
          <select
            id={`${prefix}-mode`}
            aria-label="Transfer mode"
            className="h-10 min-w-0 rounded-md border border-input bg-background px-3 font-normal"
            value={line.mode}
            disabled={!editable}
            onChange={(event) => onChange({ mode: event.target.value as BankTransferMode })}
          >
            {transferModes.map((mode) => (
              <option key={mode.value} value={mode.value}>
                {mode.label}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={`${prefix}-reference`} className="grid gap-1.5 text-xs font-semibold">
          Ref. No.
          <Input
            id={`${prefix}-reference`}
            aria-label="Reference number"
            className="font-normal"
            value={line.reference}
            maxLength={128}
            placeholder="Bank reference (optional)"
            disabled={!editable}
            onChange={(event) => onChange({ reference: event.target.value })}
          />
        </label>
        <label htmlFor={`${prefix}-date`} className="grid gap-1.5 text-xs font-semibold">
          Date *
          <Input
            id={`${prefix}-date`}
            aria-label="Transfer date"
            className="min-w-0 font-normal"
            type="date"
            value={line.date}
            disabled={!editable}
            onChange={(event) => onChange({ date: event.target.value })}
          />
        </label>
        <label htmlFor={`${prefix}-details`} className="grid gap-1.5 text-xs font-semibold">
          Detail
          <Textarea
            id={`${prefix}-details`}
            aria-label="Details"
            className="h-10 min-h-10 min-w-0 resize-y font-normal"
            rows={1}
            maxLength={500}
            placeholder="Reason for this transfer (optional)"
            value={line.details}
            disabled={!editable}
            onChange={(event) => onChange({ details: event.target.value })}
          />
        </label>
        <div className="min-w-0 sm:col-span-2">
          {line.chargeExpanded ? (
            <div className="flex flex-wrap items-end gap-3">
              <label htmlFor={`${prefix}-charge`} className="grid gap-1.5 text-xs font-medium">
                Bank charge ({source?.currency ?? "source currency"})
                <Input
                  id={`${prefix}-charge`}
                  aria-label="Bank charge"
                  className="w-44 text-right tabular-nums"
                  inputMode="decimal"
                  value={line.bankCharge}
                  disabled={!editable}
                  onChange={(event) => onChange({ bankCharge: event.target.value })}
                />
              </label>
              {editable ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange({ bankCharge: "0", chargeExpanded: false })}
                >
                  Remove charge
                </Button>
              ) : null}
              <p className="m-0 text-xs text-muted-foreground">Charged separately in the sending currency.</p>
            </div>
          ) : editable ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="px-0"
              onClick={() => onChange({ chargeExpanded: true })}
            >
              + Add bank charge
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
