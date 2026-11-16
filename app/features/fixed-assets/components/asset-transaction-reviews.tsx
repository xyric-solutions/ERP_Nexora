"use client";
import type { ReactNode } from "react";
import type { AssetOptions, AssetEvent, AssetDepreciationRun } from "@nexora/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WorkTable } from "./asset-table";
import { Section, Field, moneyLabel, today } from "./asset-fields";
import { lifecycleLabels } from "./asset-lifecycle-form";

type Common = {
  options: AssetOptions | null;
  dp: number;
  busy: boolean;
  actorId: string;
  reason: string;
  actionReason: ReactNode;
  can: (action: string) => boolean;
  onClose: () => void;
};
export function AssetDepreciationReview({
  run,
  options,
  dp,
  busy,
  actorId,
  reason,
  actionReason,
  can,
  onClose,
  reversalDate,
  setReversalDate,
  runAction,
}: Common & {
  run: AssetDepreciationRun;
  reversalDate: string;
  setReversalDate: (date: string) => void;
  runAction: (run: AssetDepreciationRun, action: "submit" | "approve" | "reject" | "post" | "reverse") => void;
}) {
  return (
    <Section
      title={`${run.code} · ${run.state}`}
      description={`Period ${run.start} – ${run.end}. Total ${moneyLabel(run.total, dp)} ${options?.base_currency}.`}
    >
      <div className="col-span-full min-w-0">
        <WorkTable tableId="asset-depreciation-preview" label="Depreciation preview" aria-label="Depreciation preview">
          <thead>
            <tr>
              {["Asset", "Opening carrying amount", "Depreciation", "Closing carrying amount", "Result"].map(
                (label) => (
                  <th key={label}>{label}</th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {run.details.map((row) => (
              <tr key={row.asset_id}>
                <td>{row.code}</td>
                <td>{moneyLabel(row.opening_carrying, dp)}</td>
                <td>{moneyLabel(row.amount, dp)}</td>
                <td>{moneyLabel(row.closing_carrying, dp)}</td>
                <td>{row.skip_reason ?? "Eligible"}</td>
              </tr>
            ))}
          </tbody>
        </WorkTable>
      </div>
      {actionReason}
      <Field label="Reversal date">
        <Input
          type="date"
          value={reversalDate}
          min={run.end}
          max={today()}
          onChange={(e) => setReversalDate(e.target.value)}
        />
      </Field>
      <div className="col-span-full flex flex-wrap gap-2">
        {run.state === "draft" && can("depreciate") && (
          <Button disabled={busy || reason.trim().length < 3} onClick={() => runAction(run, "submit")}>
            Submit depreciation
          </Button>
        )}
        {run.state === "submitted" && can("approve") && run.maker_id !== actorId && (
          <>
            <Button disabled={busy || reason.trim().length < 3} onClick={() => runAction(run, "approve")}>
              Approve depreciation
            </Button>
            <Button
              variant="outline"
              disabled={busy || reason.trim().length < 3}
              onClick={() => runAction(run, "reject")}
            >
              Reject run
            </Button>
          </>
        )}
        {run.state === "approved" && can("depreciate") && (
          <Button disabled={busy || reason.trim().length < 3} onClick={() => runAction(run, "post")}>
            Post depreciation journal
          </Button>
        )}
        {run.state === "posted" && can("reverse") && run.maker_id !== actorId && (
          <Button
            variant="outline"
            disabled={busy || reason.trim().length < 3}
            onClick={() => runAction(run, "reverse")}
          >
            Reverse latest depreciation
          </Button>
        )}
        <Button variant="ghost" onClick={() => onClose()}>
          Close review
        </Button>
      </div>
      {run.journal_id && (
        <p className="col-span-full break-all text-sm">
          Journal: {run.journal_reference ?? run.journal_id}
          {run.reversal_journal_id ? ` · Reversal: ${run.reversal_journal_reference ?? run.reversal_journal_id}` : ""}
        </p>
      )}
    </Section>
  );
}
export function AssetEventReview({
  event,
  options,
  dp,
  busy,
  actorId,
  reason,
  actionReason,
  can,
  onClose,
  eventAction,
}: Common & {
  event: AssetEvent;
  eventAction: (event: AssetEvent, action: "submit" | "approve" | "reject" | "post") => void;
}) {
  return (
    <Section title={`${event.code} · ${lifecycleLabels[event.type]} · ${event.state}`}>
      <Field label="Asset">
        <Input readOnly value={event.asset_code} />
      </Field>
      <Field label="Date">
        <Input readOnly value={event.date} />
      </Field>
      <Field label="Carrying amount">
        <Input readOnly value={moneyLabel(event.preview.carrying, dp)} />
      </Field>
      <Field label="Transaction amount">
        <Input readOnly value={moneyLabel(event.preview.amount, dp)} />
      </Field>
      <Field label="Gain / (loss)">
        <Input readOnly value={moneyLabel(event.preview.gain, dp)} />
      </Field>
      {actionReason}
      <div className="col-span-full">
        {!!event.preview.depreciation.length && (
          <div className="mb-4 space-y-2 rounded border p-3">
            <p className="text-sm font-medium">Depreciation included in this approval</p>
            <p className="text-sm text-muted-foreground">
              The carrying amount above includes the following depreciation. Posting requires depreciation authority and
              records all journals atomically with this event.
            </p>
            <ul className="space-y-1 text-sm">
              {event.preview.depreciation.map((item) => (
                <li key={item.start}>
                  {item.detail.start} — {item.detail.end}: {moneyLabel(item.detail.amount, dp)} {options?.base_currency}
                  ; posting date {item.posting_date}
                </li>
              ))}
            </ul>
          </div>
        )}
        <WorkTable tableId="asset-event-preview" label="Lifecycle journal preview" tools={false} paging={false}>
          <thead>
            <tr>
              <th>Account</th>
              <th>Debit</th>
              <th>Credit</th>
            </tr>
          </thead>
          <tbody>
            {event.preview.lines.map((line, i) => (
              <tr key={i}>
                <td>{options?.accounts.find((account) => account.id === line.account_id)?.name ?? line.account_id}</td>
                <td>{moneyLabel(line.debit, dp)}</td>
                <td>{moneyLabel(line.credit, dp)}</td>
              </tr>
            ))}
            {!event.preview.lines.length && (
              <tr>
                <td colSpan={3}>
                  {event.preview.linked_journal_id
                    ? "Uses independently posted financial evidence; no duplicate journal."
                    : "Operational evidence only; no journal."}
                </td>
              </tr>
            )}
          </tbody>
        </WorkTable>
      </div>
      <div className="col-span-full flex flex-wrap gap-2">
        {event.state === "draft" &&
          can(
            {
              transfer: "transfer",
              return: "return",
              refund: "return",
              maintenance: "maintain",
              verification: "maintain",
              impairment: "impair",
              disposal: "dispose",
            }[event.type],
          ) && (
            <Button disabled={busy || reason.trim().length < 3} onClick={() => eventAction(event, "submit")}>
              Submit event
            </Button>
          )}
        {event.state === "submitted" && can("approve") && event.maker_id !== actorId && (
          <>
            <Button disabled={busy || reason.trim().length < 3} onClick={() => eventAction(event, "approve")}>
              Approve event
            </Button>
            <Button
              variant="outline"
              disabled={busy || reason.trim().length < 3}
              onClick={() => eventAction(event, "reject")}
            >
              Reject event
            </Button>
          </>
        )}
        {event.state === "approved" &&
          can(
            {
              transfer: "transfer",
              return: "return",
              refund: "return",
              maintenance: "maintain",
              verification: "maintain",
              impairment: "impair",
              disposal: "dispose",
            }[event.type],
          ) && (
            <Button
              disabled={busy || reason.trim().length < 3 || (!!event.preview.depreciation.length && !can("depreciate"))}
              onClick={() => eventAction(event, "post")}
            >
              Post approved event
            </Button>
          )}
        <Button variant="ghost" onClick={() => onClose()}>
          Close review
        </Button>
      </div>
      {event.journal_id && (
        <p className="col-span-full break-all text-sm">Journal: {event.journal_reference ?? event.journal_id}</p>
      )}
    </Section>
  );
}
