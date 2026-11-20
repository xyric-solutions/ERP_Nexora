import type { PoolClient } from "pg";
import type { SalesSource, SalesAction } from "@nexora/contracts";
import type { ReferenceMasterContext } from "../master-data/source-repository.js";
import { operationalFailure as fail } from "../shared/operational-transaction.js";
import { validateSalesReview } from "./lifecycle.js";

/** Commercial confirmation never substitutes for independent Stock/Finance posting. */
export async function changeSalesState(
  client: PoolClient,
  context: ReferenceMasterContext,
  source: SalesSource,
  input: SalesAction,
) {
  if (source.version !== input.expected_version)
    fail("The commercial record changed. Reload before acting.", "STALE_VERSION");
  const maker = source.maker_id === context.actor.userId,
    named = source.approver_id === context.actor.userId;
  const review = input.action === "reject" || (input.action === "approve" && source.state === "submitted");
  const permission = review ? "sales.document.approve" : "sales.document.create";
  if (
    !context.actor.permissions.includes(permission) ||
    !(
      await client.query("select 1 where bank_has_live_permission($1,$2,$3,$4)", [
        context.tenantId,
        input.company_id,
        context.actor.userId,
        permission,
      ])
    ).rowCount
  )
    fail("The required current commercial authority is missing.", "PERMISSION_DENIED", 403);
  if (review ? !named : !maker)
    fail("This action belongs to the document's creator or assigned reviewer.", "SALES_ACTOR_REQUIRED", 403);
  let state = source.state,
    details: unknown = null;
  if (input.action === "submit") {
    if (!["draft", "rejected"].includes(state) || !source.approver_id)
      fail("Submit a draft with its named reviewer.", "SALES_STATE_CONFLICT");
    await validateSalesReview(client, context, source);
    state = "submitted";
  } else if (input.action === "approve") {
    if (!((state === "submitted" && named) || (state === "draft" && !source.approver_id)))
      fail("This commercial document is not ready for its approval path.", "SALES_STATE_CONFLICT");
    if (
      !maker &&
      !(
        await client.query("select 1 where bank_has_live_permission($1,$2,$3,'sales.document.create')", [
          context.tenantId,
          input.company_id,
          source.maker_id,
        ])
      ).rowCount
    )
      fail("The commercial creator no longer has current authority.", "SALES_MAKER_AUTHORITY_CHANGED", 403);
    await validateSalesReview(client, context, source);
    state = "approved";
  } else if (input.action === "reject") {
    if (state !== "submitted") fail("Only a submitted commercial document can be rejected.", "SALES_STATE_CONFLICT");
    state = "rejected";
  } else if (input.action === "pause" || input.action === "resume") {
    if (
      state !== "approved" ||
      source.kind !== "recurring" ||
      !source.recurrence ||
      source.recurrence.enabled === (input.action === "resume")
    )
      fail("Choose the applicable recurring-template enablement action.", "SALES_STATE_CONFLICT");
    const row = (
      await client.query<{ details: Record<string, unknown> }>(
        "select details from sales_document where(tenant_id,company_id,id)=($1,$2,$3)",
        [context.tenantId, input.company_id, source.id],
      )
    ).rows[0]!;
    details = { ...row.details, recurrence: { ...source.recurrence, enabled: input.action === "resume" } };
  } else if (input.action === "revise") {
    if (
      !["submitted", "rejected"].includes(state) &&
      !(state === "approved" && ["quotation", "recurring"].includes(source.kind))
    )
      fail("This commercial document cannot be revised in its current state.", "SALES_STATE_CONFLICT");
    state = "draft";
  } else {
    if (state === "cancelled") fail("This commercial record is already cancelled.", "SALES_STATE_CONFLICT");
    state = "cancelled";
  }
  await client.query(
    "update sales_document set state=$4,details=coalesce($5::jsonb,details),row_version=row_version+1,updated_by=$6,updated_at=clock_timestamp() where(tenant_id,company_id,id)=($1,$2,$3)",
    [
      context.tenantId,
      input.company_id,
      source.id,
      state,
      details ? JSON.stringify(details) : null,
      context.actor.userId,
    ],
  );
}
