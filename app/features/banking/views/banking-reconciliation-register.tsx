"use client";

/**
 * Bank reconciliation register for the isolated Nexora UI/UX prototype.
 *
 * `Bank > Reconciliation` opens this list, not a workspace: a reconciliation is
 * a record with its own identity, period, balance and approval state, so the
 * menu lands on the register of those records and `+ Add New` starts one.
 *
 * Fixtures and the pure register helpers live in banking-reconciliation-data.ts
 * so they can be asserted directly by the tests.
 *
 * Deterministic presentation data only: no API, database, Demo Account,
 * authorization, posting, or business-transaction dependency. Every record
 * created here lives in local state and resets on reload.
 */

import { useMemo } from "react";
import { formatMoney } from "../model/banking-master-data";
import {
  differenceInBaseCurrency,
  liveStatuses,
  registerColumns,
  toRow,
  type ReconciliationRecord,
} from "../model/banking-reconciliation-data";
import { ModuleSearchableTable } from "@prototype/shared/ui/module-views";

export function BankingReconciliationRegister({
  records,
  onAction,
  onOpen,
}: {
  records: readonly ReconciliationRecord[];
  onAction: (action: string, subject?: string) => void;
  onOpen: (recordId: string) => void;
}) {
  const rows = useMemo(() => records.map(toRow), [records]);
  const openRecords = records.filter((record) => liveStatuses.includes(record.status));
  const awaitingApproval = records.filter((record) => record.status === "Submitted");
  const openItems = openRecords.reduce((total, record) => total + record.openItems, 0);
  const unexplained = differenceInBaseCurrency(openRecords);

  return (
    <div className="nx-recon">
      <div className="nx-recon__summary">
        <article>
          <span>Live reconciliations</span>
          <strong>{openRecords.length}</strong>
          <small>Draft, in progress or submitted</small>
        </article>
        <article>
          <span>Awaiting approval</span>
          <strong>{awaitingApproval.length}</strong>
          <small>Balanced and submitted for sign-off</small>
        </article>
        <article className={openItems > 0 ? "warning" : undefined}>
          <span>Open items</span>
          <strong>{openItems}</strong>
          <small>Statement lines still unmatched</small>
        </article>
        <article className={unexplained > 0 ? "warning" : undefined}>
          <span>Difference to explain</span>
          <strong>{formatMoney(unexplained)}</strong>
          <small>Ledger against statement, live records, in USD</small>
        </article>
      </div>

      <ModuleSearchableTable
        columns={registerColumns}
        rows={rows}
        linkKey="id"
        label="Reconciliations"
        filters={["Method: All", "Period: All"]}
        summary={`Showing ${rows.length} of ${rows.length} reconciliations`}
        totalRecords={rows.length}
        onOpen={(row) => onOpen(row.id)}
        onAction={onAction}
      />
    </div>
  );
}
