import { randomUUID } from "node:crypto";
import { evaluateApprovalActor } from "@nexora/auth";
import {
  budgetActionSchema,
  budgetDetailSchema,
  budgetPolicyInputSchema,
  budgetPolicySchema,
  budgetRequestInputSchema,
  budgetRequestActionSchema,
  budgetRequestSchema,
  budgetModelInputSchema,
  budgetModelSchema,
  budgetApplyModelSchema,
  budgetQuerySchema,
  decimal,
  decimalText,
  spreadBudget,
  type BudgetAction,
  type BudgetDetail,
  type BudgetPolicyInput,
  type BudgetRequestInput,
  type BudgetRequestAction,
  type BudgetModelInput,
  type BudgetApplyModel,
  type BudgetLineInput,
} from "@nexora/contracts";
import type { BankingActorContext } from "../banking/source-repository.js";
import { writeApprovalOverrideEvent } from "../security/approval-override-writer.js";
import { companyAuthoritySql } from "../security/company-authority.js";
import { resolveCompanyBaseCurrency } from "../finance/currencies/company-authority.js";
import { allocateBudgetCode, budgetAudit, budgetHash, budgetReject, type BudgetClient } from "./transaction.js";
import { loadBudgetReport } from "./reporting.js";
import type { SourceBudgetRepository } from "./source-repository.js";
import { validateBudgetReferences } from "./references.js";

const contentHash = (d: BudgetDetail) =>
  budgetHash({
    name: d.record.name,
    kind: d.record.kind,
    parent: d.record.parent_id,
    cutoff: d.record.cutoff,
    assumptions: d.record.assumptions,
    lines: d.lines,
  });
export async function budgetWorkflow(
  c: BudgetClient,
  ctx: BankingActorContext,
  kind: "version" | "request",
  id: string,
  action: "submit" | "approve" | "reject",
  reason: string,
  instance?: string,
) {
  const t = ctx.tenantId,
    definition = `budget-${kind}-approval`;
  if (action === "submit") {
    await c.query(
      `insert into workflow_definition(id,tenant_id,module,trigger,entry_step_id,steps,version,status,created_at)
   values($1,$2,'budget',$3,'review',$4,1,'active',clock_timestamp()) on conflict(tenant_id,id) do nothing`,
      [definition, t, `${kind}_approval`, JSON.stringify([{ id: "review", level: 1, independent: true }])],
    );
    instance = randomUUID();
    await c.query(
      `insert into approval_instance(id,tenant_id,workflow_definition_id,workflow_definition_version,source_type,source_id,current_step_id,requested_by,started_at,due_at,state,created_at)
   values($1,$2,$3,1,$4,$5,'review',$6,clock_timestamp(),clock_timestamp()+interval '7 days','pending',clock_timestamp())`,
      [instance, t, definition, `budget_${kind}`, id, ctx.actor.userId],
    );
  } else {
    if (!instance) budgetReject("The approval history is incomplete.", "BUDGET_APPROVAL_MISSING", 409);
    if (
      !(
        await c.query(
          "update approval_instance set state=$3,updated_at=clock_timestamp() where tenant_id=$1 and id=$2 and state='pending'",
          [t, instance, action === "approve" ? "approved" : "rejected"],
        )
      ).rowCount
    )
      budgetReject("The approval has already been decided.", "BUDGET_STATE_CONFLICT", 409);
  }
  await c.query(
    `insert into approval_action(id,tenant_id,approval_instance_id,step_id,level,actor_id,action,comments,previous_state,new_state,acted_at,sequence)
  values($1,$2,$3,'review',1,$4,$5,$6,'pending',$7,clock_timestamp(),$8)`,
    [
      randomUUID(),
      t,
      instance,
      ctx.actor.userId,
      action,
      reason,
      action === "submit" ? "pending" : action === "approve" ? "approved" : "rejected",
      action === "submit" ? 1 : 2,
    ],
  );
  return instance;
}
async function independent(
  c: BudgetClient,
  ctx: BankingActorContext,
  company: string,
  makers: string[],
  permission: string,
  id: string,
  reason: string,
  key: string,
  correlation: string,
) {
  const decision = evaluateApprovalActor({
    account: ctx.actor,
    makerActorIds: makers,
    normalDecisionPermission: permission,
    impersonated: !!ctx.realActorId,
  });
  if (decision.kind === "forbidden")
    budgetReject("An independent authorized reviewer must decide this Budget record.", "MAKER_CHECKER_REQUIRED", 403);
  if (decision.kind === "override")
    await writeApprovalOverrideEvent(c, {
      tenantId: ctx.tenantId,
      account: ctx.actor,
      makerActorIds: makers,
      normalDecisionPermission: permission,
      resourceType: "budget.record",
      resourceId: id,
      decisionAction: "approve",
      reason,
      correlationId: correlation,
      idempotencyKey: `budget-override-${budgetHash({ id, key })}`,
      metadata: { company_id: company },
    });
  return decision;
}
export class BudgetGovernance {
  constructor(readonly repository: SourceBudgetRepository) {}
  action(ctx: BankingActorContext, id: string, raw: BudgetAction, key: string, correlation: string) {
    const input = budgetActionSchema.parse(raw),
      permission = input.action === "submit" ? "budget.plan.submit" : "budget.plan.approve";
    return this.repository.transactions.mutate(
      ctx,
      input.company_id,
      permission,
      key,
      { op: "version.action", id, input },
      async (c) => {
        const before = await this.repository.read(c, ctx.tenantId, input.company_id, id);
        if (before.record.version !== input.expected_version)
          budgetReject("This budget version changed. Reload before acting.", "BUDGET_VERSION_CONFLICT", 409);
        if (input.action === "submit") {
          if (!["draft", "rejected"].includes(before.record.state) || !before.lines.length)
            budgetReject("Submit a nonempty draft or corrected budget.", "BUDGET_STATE_CONFLICT", 409);
          await this.repository.validateLines(
            c,
            ctx.tenantId,
            input.company_id,
            before.record.fiscal_calendar_id,
            before.record.kind,
            before.lines,
          );
          this.repository.assertDisjoint(before.lines);
          if (!input.approver_id) budgetReject("Select an independent budget approver.");
          const makers = [
            before.record.created_by,
            ...before.history.filter((a) => !["approve", "reject"].includes(a.action)).map((a) => a.actor_id),
            ctx.actor.userId,
          ];
          if (
            makers.includes(input.approver_id) ||
            !(
              await c.query(companyAuthoritySql, [
                ctx.tenantId,
                input.approver_id,
                input.company_id,
                "budget.plan.approve",
              ])
            ).rowCount
          )
            budgetReject("Select a current, independently authorized company approver.");
          const instance = await budgetWorkflow(c, ctx, "version", id, "submit", input.reason);
          await c.query(
            "update budget_version set state='submitted',version=version+1,approver_id=$4,approval_instance_id=$5,submitted_hash=$6,updated_by=$7,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3",
            [ctx.tenantId, input.company_id, id, input.approver_id, instance, contentHash(before), ctx.actor.userId],
          );
        } else {
          if (before.record.state !== "submitted")
            budgetReject("Only submitted budgets can be decided.", "BUDGET_STATE_CONFLICT", 409);
          const decision = await independent(
            c,
            ctx,
            input.company_id,
            [
              before.record.created_by,
              ...before.history.filter((a) => !["approve", "reject"].includes(a.action)).map((a) => a.actor_id),
            ],
            permission,
            id,
            input.reason,
            key,
            correlation,
          );
          if (before.record.approver_id !== ctx.actor.userId && decision.kind !== "override")
            budgetReject("Only the assigned reviewer can decide this budget.", "BUDGET_APPROVER_REQUIRED", 403);
          const retained = (
            await c.query<{ approval_instance_id: string; submitted_hash: string }>(
              "select approval_instance_id,submitted_hash from budget_version where tenant_id=$1 and company_id=$2 and id=$3",
              [ctx.tenantId, input.company_id, id],
            )
          ).rows[0]!;
          if (retained.submitted_hash !== contentHash(before))
            budgetReject(
              "Submitted allocations no longer match their approval evidence.",
              "BUDGET_CONTENT_CHANGED",
              409,
            );
          await budgetWorkflow(c, ctx, "version", id, input.action, input.reason, retained.approval_instance_id);
          await c.query(
            "update budget_version set state=$4,version=version+1,updated_by=$5,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3",
            [
              ctx.tenantId,
              input.company_id,
              id,
              input.action === "approve" ? "approved" : "rejected",
              ctx.actor.userId,
            ],
          );
        }
        await c.query(
          "update budget set status=$4 where tenant_id=$1 and company_id=$2 and managed_line_id in(select id from budget_line where tenant_id=$1 and company_id=$2 and version_id=$3)",
          [
            ctx.tenantId,
            input.company_id,
            id,
            input.action === "submit" ? "pending_approval" : input.action === "approve" ? "approved" : "rejected",
          ],
        );
        await budgetAudit(c, ctx, input.company_id, "budget_version", id, input.action, input.reason, correlation);
        return this.repository.read(c, ctx.tenantId, input.company_id, id);
      },
      (v) => budgetDetailSchema.parse(v),
    );
  }
  policy(ctx: BankingActorContext, raw: BudgetPolicyInput, key: string) {
    const input = budgetPolicyInputSchema.parse(raw);
    return this.repository.transactions.mutate(
      ctx,
      input.company_id,
      "budget.policy.configure",
      key,
      { op: "policy", input },
      async (c) => {
        if (
          !ctx.actor.permissions.includes("budget.plan.activate") ||
          !(
            await c.query(companyAuthoritySql, [
              ctx.tenantId,
              ctx.actor.userId,
              input.company_id,
              "budget.plan.activate",
            ])
          ).rowCount
        )
          budgetReject("Budget activation authority is required.", "PERMISSION_DENIED", 403);
        const target = await this.repository.read(c, ctx.tenantId, input.company_id, input.control_version_id);
        if (
          target.record.state !== "approved" ||
          !["baseline", "revision"].includes(target.record.kind) ||
          target.record.fiscal_calendar_id !== input.fiscal_calendar_id
        )
          budgetReject("Select an independently approved baseline/revision for this fiscal calendar.");
        this.repository.assertDisjoint(target.lines);
        const prior = (
          await c.query<{ version: number; effective_date: string }>(
            "select version,effective_date::text from budget_policy where tenant_id=$1 and company_id=$2 and fiscal_calendar_id=$3 order by version desc limit 1",
            [ctx.tenantId, input.company_id, input.fiscal_calendar_id],
          )
        ).rows[0];
        if ((prior?.version ?? 0) !== input.expected_version)
          budgetReject("The control policy changed. Reload before activation.", "BUDGET_VERSION_CONFLICT", 409);
        const today = (await c.query<{ date: string }>("select current_date::text as date")).rows[0]!.date;
        if (input.effective_date < today) budgetReject("Control configuration cannot be backdated.");
        if (prior && input.effective_date < prior.effective_date)
          budgetReject("The effective date cannot precede the latest control policy.");
        if (input.enabled) {
          const report = await loadBudgetReport(
            c,
            ctx.tenantId,
            input.company_id,
            budgetQuerySchema.parse({
              company_id: input.company_id,
              version_id: input.control_version_id,
              as_of: input.effective_date,
              limit: 100,
            }),
            true,
          );
          if (!report.complete) budgetReject(report.issues.join(" "), "BUDGET_RECONCILIATION_REQUIRED", 409);
          // Activation cannot hide existing overspend behind a different baseline.
          if (
            report.rows.some((r) => ["expense", "asset"].includes(r.account_type) && decimal(r.available, 8, true) < 0n)
          )
            budgetReject(
              "Reconcile overcommitted or unbudgeted expenditure before activating this baseline.",
              "BUDGET_ACTIVATION_EXCEEDED",
              409,
            );
        }
        const id = randomUUID(),
          v = (prior?.version ?? 0) + 1;
        await c.query(
          "insert into budget_policy(tenant_id,company_id,id,fiscal_calendar_id,version,control_version_id,enabled,mode,warn_percent,effective_date,created_by,reason) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
          [
            ctx.tenantId,
            input.company_id,
            id,
            input.fiscal_calendar_id,
            v,
            input.control_version_id,
            input.enabled,
            input.mode,
            input.warn_percent,
            input.effective_date,
            ctx.actor.userId,
            input.reason,
          ],
        );
        const { expected_version: _expected, ...settings } = input;
        void _expected;
        return { ...settings, id, version: v, created_by: ctx.actor.userId };
      },
      (value) => budgetPolicySchema.parse(value),
    );
  }
  model(ctx: BankingActorContext, id: string | undefined, raw: BudgetModelInput, key: string, correlation: string) {
    const input = budgetModelInputSchema.parse(raw);
    return this.repository.transactions.mutate(
      ctx,
      input.company_id,
      "budget.model.manage",
      key,
      { op: "model", id, input },
      async (c) => {
        const base = await resolveCompanyBaseCurrency(c, ctx.tenantId, input.company_id, false);
        await validateBudgetReferences(c, ctx.tenantId, input.company_id, input.lines);
        for (const line of input.lines) {
          try {
            spreadBudget(line.amount, line.weights, base.decimalPlaces);
          } catch {
            budgetReject("Model values or spread weights exceed valid company precision.");
          }
          if (
            !(
              await c.query(
                "select 1 from account where tenant_id=$1 and company_id=$2 and id=$3 and status='active' and not is_header and not reconciliation_required",
                [ctx.tenantId, input.company_id, line.account_id],
              )
            ).rowCount
          )
            budgetReject("Select real posting accounts for this model.");
        }
        if (id) {
          const before = (
            await c.query<{ version: number }>(
              "select version from budget_model where tenant_id=$1 and company_id=$2 and id=$3 for update",
              [ctx.tenantId, input.company_id, id],
            )
          ).rows[0];
          if (!before) budgetReject("The model was not found.", "NOT_FOUND", 404);
          if (before.version !== input.expected_version)
            budgetReject("The model changed. Reload before editing.", "BUDGET_VERSION_CONFLICT", 409);
          await c.query(
            "update budget_model set name=$4,definition=$5,active=$6,version=version+1,updated_by=$7,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3",
            [
              ctx.tenantId,
              input.company_id,
              id,
              input.name,
              JSON.stringify({ lines: input.lines }),
              input.active,
              ctx.actor.userId,
            ],
          );
        } else {
          id = randomUUID();
          const code = await allocateBudgetCode(c, ctx.tenantId, input.company_id, "BMD");
          await c.query(
            "insert into budget_model(tenant_id,company_id,id,code,name,definition,active,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$7,$8,$8)",
            [
              ctx.tenantId,
              input.company_id,
              id,
              code,
              input.name,
              JSON.stringify({ lines: input.lines }),
              input.active,
              ctx.actor.userId,
            ],
          );
        }
        await budgetAudit(c, ctx, input.company_id, "budget_model", id, "saved", input.reason, correlation);
        return (
          await c.query(
            "select id,company_id,code,name,version,active,definition->'lines' as lines from budget_model where tenant_id=$1 and company_id=$2 and id=$3",
            [ctx.tenantId, input.company_id, id],
          )
        ).rows[0];
      },
      (v) => budgetModelSchema.parse(v),
    );
  }
  applyModel(ctx: BankingActorContext, raw: BudgetApplyModel, key: string, correlation: string) {
    const input = budgetApplyModelSchema.parse(raw);
    return this.repository.transactions.mutate(
      ctx,
      input.company_id,
      "budget.plan.update",
      key,
      { op: "model.apply", input },
      async (c) => {
        const target = await this.repository.read(c, ctx.tenantId, input.company_id, input.version_id);
        if (target.record.version !== input.expected_version)
          budgetReject("The target budget changed.", "BUDGET_VERSION_CONFLICT", 409);
        const row = (
          await c.query(
            "select id,company_id,code,name,version,active,definition->'lines' as lines from budget_model where tenant_id=$1 and company_id=$2 and id=$3 and active",
            [ctx.tenantId, input.company_id, input.model_id],
          )
        ).rows[0];
        if (!row) budgetReject("Select an active company budget model.");
        const model = budgetModelSchema.parse(row);
        const periods = (
          await c.query<{ id: string; period_number: number }>(
            "select id,period_number from financial_period where tenant_id=$1 and company_id=$2 and fiscal_calendar_id=$3 order by period_number",
            [ctx.tenantId, input.company_id, target.record.fiscal_calendar_id],
          )
        ).rows;
        if (periods.length !== 12) budgetReject("Configure all twelve fiscal periods before applying an annual model.");
        const base = await resolveCompanyBaseCurrency(c, ctx.tenantId, input.company_id, false);
        const lines: BudgetLineInput[] = model.lines.map((line) => ({
          ...line,
          allocations: spreadBudget(line.amount, line.weights, base.decimalPlaces).map((amount, index) => ({
            period_id: periods[index]!.id,
            amount,
          })),
        }));
        await this.repository.replaceLines(c, ctx, input.company_id, input.version_id, lines);
        await c.query(
          "update budget_version set assumptions=assumptions||$4::jsonb,version=version+1,updated_by=$5,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3",
          [
            ctx.tenantId,
            input.company_id,
            input.version_id,
            JSON.stringify({ method: "model", model_id: model.id }),
            ctx.actor.userId,
          ],
        );
        await budgetAudit(
          c,
          ctx,
          input.company_id,
          "budget_version",
          input.version_id,
          "model_applied",
          input.reason,
          correlation,
        );
        return this.repository.read(c, ctx.tenantId, input.company_id, input.version_id);
      },
      (v) => budgetDetailSchema.parse(v),
    );
  }
  request(ctx: BankingActorContext, raw: BudgetRequestInput, key: string, correlation: string) {
    const input = budgetRequestInputSchema.parse(raw),
      permission = input.request.kind === "transfer" ? "budget.transfer.create" : "budget.plan.submit";
    return this.repository.transactions.mutate(
      ctx,
      input.company_id,
      permission,
      key,
      { op: "request", input },
      async (c) => {
        const payload = input.request;
        if (payload.kind === "transfer") {
          const target = await this.repository.read(c, ctx.tenantId, input.company_id, payload.version_id);
          if (target.record.state !== "approved" || !["baseline", "revision"].includes(target.record.kind))
            budgetReject("Transfers require an approved baseline/revision.");
          if (payload.from_line_id === payload.to_line_id && payload.from_period_id === payload.to_period_id)
            budgetReject("A transfer requires different source and destination allocations.");
          for (const [lineId, periodId] of [
            [payload.from_line_id, payload.from_period_id],
            [payload.to_line_id, payload.to_period_id],
          ])
            if (!target.lines.some((l) => l.id === lineId && l.allocations.some((a) => a.period_id === periodId)))
              budgetReject("Both transfer allocations must exist in the selected version.");
        } else if (payload.kind === "exception") {
          const doc = (
            await c.query(
              "select row_version, to_jsonb(d) as snapshot from procurement_document d where tenant_id=$1 and company_id=$2 and id=$3",
              [ctx.tenantId, input.company_id, payload.source_document_id],
            )
          ).rows[0];
          if (!doc || doc.row_version !== payload.source_version || budgetHash(doc.snapshot) !== payload.source_hash)
            budgetReject("The purchase source changed. Refresh its control evidence.");
          if (
            !(
              await c.query(
                "select 1 from budget_policy where tenant_id=$1 and company_id=$2 and id=$3 and enabled and mode='approval'",
                [ctx.tenantId, input.company_id, payload.policy_id],
              )
            ).rowCount
          )
            budgetReject("An approval-mode policy is required for an exception.");
        } else if (
          !(
            await c.query("select 1 from budget_commitment where tenant_id=$1 and company_id=$2 and id=$3", [
              ctx.tenantId,
              input.company_id,
              payload.commitment_id,
            ])
          ).rowCount
        )
          budgetReject("The source commitment was not found.");
        const id = randomUUID(),
          code = await allocateBudgetCode(
            c,
            ctx.tenantId,
            input.company_id,
            payload.kind === "transfer" ? "BTR" : payload.kind === "exception" ? "BEX" : "BCL",
          );
        const instance = await budgetWorkflow(c, ctx, "request", id, "submit", input.reason);
        await c.query(
          "insert into budget_request(tenant_id,company_id,id,code,kind,payload,approval_instance_id,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$7,$8,$8)",
          [ctx.tenantId, input.company_id, id, code, payload.kind, JSON.stringify(payload), instance, ctx.actor.userId],
        );
        await budgetAudit(c, ctx, input.company_id, "budget_request", id, "submitted", input.reason, correlation);
        return this.readRequest(c, ctx.tenantId, input.company_id, id);
      },
      (v) => budgetRequestSchema.parse(v),
    );
  }
  async readRequest(c: BudgetClient, t: string, company: string, id: string) {
    const row = (
      await c.query(
        `select r.id,r.company_id,r.code,r.kind,r.payload,r.state,r.version,r.created_by,r.updated_by,r.created_at::text,
   coalesce((select a.reason from budget_audit a where a.tenant_id=r.tenant_id and a.company_id=r.company_id and a.entity_id=r.id order by record_version limit 1),'') as reason from budget_request r where r.tenant_id=$1 and r.company_id=$2 and r.id=$3`,
        [t, company, id],
      )
    ).rows[0];
    if (!row) budgetReject("The Budget request was not found.", "NOT_FOUND", 404);
    return budgetRequestSchema.parse(row);
  }
  requestAction(ctx: BankingActorContext, id: string, raw: BudgetRequestAction, key: string, correlation: string) {
    const input = budgetRequestActionSchema.parse(raw);
    // Load kind inside a permission-checked read; mutations reauthorize its exact action.
    return this.repository.transactions
      .run(ctx, input.company_id, "budget.plan.read", false, (c) =>
        this.readRequest(c, ctx.tenantId, input.company_id, id),
      )
      .then((before) => {
        const permission =
          before.kind === "transfer"
            ? "budget.transfer.approve"
            : before.kind === "exception"
              ? "budget.exception.approve"
              : "budget.commitment.close";
        return this.repository.transactions.mutate(
          ctx,
          input.company_id,
          permission,
          key,
          { op: "request.action", id, input },
          async (c) => {
            const current = await this.readRequest(c, ctx.tenantId, input.company_id, id);
            if (current.version !== input.expected_version || current.state !== "submitted")
              budgetReject("The request changed or has already been decided.", "BUDGET_VERSION_CONFLICT", 409);
            await independent(
              c,
              ctx,
              input.company_id,
              [current.created_by],
              permission,
              id,
              input.reason,
              key,
              correlation,
            );
            if (input.action === "approve") {
              const p = current.payload;
              if (p.kind === "transfer") {
                const target = await this.repository.read(c, ctx.tenantId, input.company_id, p.version_id);
                const report = await loadBudgetReport(
                  c,
                  ctx.tenantId,
                  input.company_id,
                  budgetQuerySchema.parse({
                    company_id: input.company_id,
                    version_id: p.version_id,
                    period_id: p.from_period_id,
                    limit: 100,
                  }),
                  true,
                );
                const line = target.lines.find((l) => l.id === p.from_line_id),
                  destination = target.lines.find((l) => l.id === p.to_line_id);
                if (!line || !destination) budgetReject("Transfer allocations are unavailable.");
                const source = report.rows.find((r) => r.id === `${p.from_line_id}:${p.from_period_id}`);
                if (!report.complete || !source || decimal(source.available, 8, true) < decimal(p.amount, 8))
                  budgetReject(
                    "The source allocation no longer has sufficient available budget.",
                    "BUDGET_TRANSFER_EXCEEDED",
                    409,
                  );
                const base = await resolveCompanyBaseCurrency(c, ctx.tenantId, input.company_id, false);
                if (decimal(p.amount, 8) % 10n ** BigInt(8 - base.decimalPlaces))
                  budgetReject("The transfer exceeds company currency precision.");
                const periods = (
                  await c.query<{ status: string; period_end: string }>(
                    "select status,period_end::text from financial_period where tenant_id=$1 and company_id=$2 and id=any($3::text[])",
                    [ctx.tenantId, input.company_id, [p.from_period_id, p.to_period_id]],
                  )
                ).rows;
                const today = (await c.query<{ date: string }>("select current_date::text as date")).rows[0]!.date;
                if (periods.some((p) => p.status !== "open" || p.period_end < today))
                  budgetReject(
                    "Transfers require open, unelapsed periods; use an independently approved revision for historical adjustments.",
                  );
                for (const [lineId, period, amount] of [
                  [p.from_line_id, p.from_period_id, decimalText(-decimal(p.amount, 8), 8)],
                  [p.to_line_id, p.to_period_id, p.amount],
                ])
                  await c.query(
                    "insert into budget_transfer_effect(tenant_id,company_id,request_id,line_id,period_id,amount) values($1,$2,$3,$4,$5,$6)",
                    [ctx.tenantId, input.company_id, id, lineId, period, amount],
                  );
              } else if (p.kind === "exception") {
                const source = (
                  await c.query(
                    "select row_version,to_jsonb(d) as snapshot from procurement_document d where tenant_id=$1 and company_id=$2 and id=$3",
                    [ctx.tenantId, input.company_id, p.source_document_id],
                  )
                ).rows[0];
                if (!source || source.row_version !== p.source_version || budgetHash(source.snapshot) !== p.source_hash)
                  budgetReject("Source terms changed after the exception request.", "BUDGET_SOURCE_CHANGED", 409);
              } else {
                const today = (await c.query<{ date: string }>("select current_date::text as date")).rows[0]!.date;
                if (p.effective_date !== today) budgetReject("Commitment closure must use today's effective date.");
                const balance = (
                  await c.query<{ remaining: string; native: string }>(
                    `select (c.reserved_base-coalesce(sum(e.base_delta),0))::text as remaining,(c.reserved_native-coalesce(sum(e.native_delta),0))::text as native
       from budget_commitment c left join budget_commitment_event e on e.tenant_id=c.tenant_id and e.company_id=c.company_id and e.commitment_id=c.id
       where c.tenant_id=$1 and c.company_id=$2 and c.id=$3 group by c.tenant_id,c.company_id,c.id`,
                    [ctx.tenantId, input.company_id, p.commitment_id],
                  )
                ).rows[0];
                if (!balance || decimal(balance.remaining, 8, true) <= 0n)
                  budgetReject("The commitment has no remaining exposure.");
                await c.query(
                  "insert into budget_commitment_event(tenant_id,company_id,id,commitment_id,kind,base_delta,native_delta,request_id,event_date,actor_id) values($1,$2,$3,$4,'close',$5,$6,$7,$8,$9)",
                  [
                    ctx.tenantId,
                    input.company_id,
                    randomUUID(),
                    p.commitment_id,
                    balance.remaining,
                    balance.native,
                    id,
                    p.effective_date,
                    ctx.actor.userId,
                  ],
                );
              }
            }
            const instance = (
              await c.query<{ approval_instance_id: string }>(
                "select approval_instance_id from budget_request where tenant_id=$1 and company_id=$2 and id=$3",
                [ctx.tenantId, input.company_id, id],
              )
            ).rows[0]!.approval_instance_id;
            await budgetWorkflow(c, ctx, "request", id, input.action, input.reason, instance);
            await c.query(
              "update budget_request set state=$4,version=version+1,updated_by=$5,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3",
              [
                ctx.tenantId,
                input.company_id,
                id,
                input.action === "approve" ? "approved" : "rejected",
                ctx.actor.userId,
              ],
            );
            await budgetAudit(c, ctx, input.company_id, "budget_request", id, input.action, input.reason, correlation);
            return this.readRequest(c, ctx.tenantId, input.company_id, id);
          },
          (v) => budgetRequestSchema.parse(v),
        );
      });
  }
}
