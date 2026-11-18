import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { z } from "zod";
import {
  budgetImportSchema,
  budgetLineInputSchema,
  budgetDetailSchema,
  budgetDimensionKey,
  budgetQuerySchema,
  budgetImportMaxBytes,
  budgetImportMaxRows,
  type BudgetLineInput,
  type BudgetQuery,
  type BudgetImport,
} from "@nexora/contracts";
import type { BankingActorContext } from "../banking/source-repository.js";
import { parseBankStatementFile, BankStatementFileError } from "../banking/statements/file-parser.js";
import { writeXlsx } from "../../files/xlsx.js";
import { budgetAudit, budgetHash, budgetReject } from "./transaction.js";
import { loadBudgetReport } from "./reporting.js";
import type { SourceBudgetRepository } from "./source-repository.js";

export const budgetImportHeaders = [
  "Account Code",
  "Department Code",
  "Project Code",
  "Cost Centre Code",
  "Branch Code",
  "Period Start",
  "Amount",
  "Notes",
] as const;
export class BudgetFiles {
  constructor(readonly repository: SourceBudgetRepository) {}
  template(ctx: BankingActorContext, company: string) {
    return this.repository.transactions.run(ctx, company, "budget.data.export", false, async () =>
      writeXlsx("Budget", budgetImportHeaders, []),
    );
  }
  preview(
    ctx: BankingActorContext,
    company: string,
    versionId: string,
    targetVersion: number,
    file: Buffer,
    format: "csv" | "xlsx",
    key: string,
    correlation: string,
  ) {
    if (!file.length || file.length > budgetImportMaxBytes)
      budgetReject("Upload a nonempty spreadsheet of at most 10 MB.");
    return this.repository.transactions.mutate<BudgetImport>(
      ctx,
      company,
      "budget.data.create",
      key,
      { op: "import.preview", versionId, targetVersion, format, hash: budgetHash(file) },
      async (c) => {
        const target = await this.repository.read(c, ctx.tenantId, company, versionId);
        if (target.record.version !== targetVersion || !["draft", "rejected"].includes(target.record.state))
          budgetReject("Select the current draft version before importing.", "BUDGET_VERSION_CONFLICT", 409);
        let parsed;
        try {
          parsed = await parseBankStatementFile(
            Readable.from(file),
            format === "xlsx"
              ? {
                  format,
                  worksheet: "Budget",
                  headerRow: 1,
                  rejectFormulas: true,
                  limits: { maxFileBytes: budgetImportMaxBytes, maxRows: budgetImportMaxRows },
                }
              : {
                  format,
                  delimiter: ",",
                  encoding: "utf-8",
                  headerRow: 1,
                  limits: { maxFileBytes: budgetImportMaxBytes, maxRows: budgetImportMaxRows },
                },
          );
        } catch (error) {
          if (error instanceof BankStatementFileError) budgetReject(error.message, "BUDGET_FILE_INVALID", 400);
          throw error;
        }
        if (
          budgetImportHeaders.some((h) => !parsed.headers.includes(h)) ||
          parsed.headers.length !== budgetImportHeaders.length
        )
          budgetReject("Use the Budget template headers.", "BUDGET_IMPORT_HEADERS", 400);
        const errors: { row: number; message: string }[] = [],
          lines = new Map<string, BudgetLineInput>();
        const codes = (header: string) => [
          ...new Set(parsed.rows.flatMap((row) => (row.values[header] ? [row.values[header]!] : []))),
        ];
        const accounts = new Map(
          (
            await c.query<{ id: string; code: string }>(
              "select id,code from account where tenant_id=$1 and company_id=$2 and code=any($3::text[]) and status='active' and not is_header and not reconciliation_required",
              [ctx.tenantId, company, codes("Account Code")],
            )
          ).rows.map((a) => [a.code, a]),
        );
        const references = new Map<string, Map<string, string>>();
        for (const [header, dimension] of [
          ["Department Code", "department"],
          ["Branch Code", "branch"],
          ["Project Code", "project"],
          ["Cost Centre Code", "cost_centre"],
        ] as const) {
          const found =
            dimension === "project"
              ? await c.query<{ id: string; code: string }>(
                  "select id,code from erp_project where tenant_id=$1 and company_id=$2 and code=any($3::text[]) and status='active'",
                  [ctx.tenantId, company, codes(header)],
                )
              : dimension === "cost_centre"
                ? await c.query<{ id: string; code: string }>(
                    "select id,code from hr_master_record where tenant_id=$1 and company_id=$2 and code=any($3::text[]) and master_type='cost_center' and status='active'",
                    [ctx.tenantId, company, codes(header)],
                  )
                : await c.query<{ id: string; code: string }>(
                    "select id,code from organization_unit where tenant_id=$1 and code=any($3::text[]) and type=$4 and status='active' and organization_unit_is_within_company($1,id,$2)",
                    [ctx.tenantId, company, codes(header), dimension],
                  );
          references.set(dimension, new Map(found.rows.map((r) => [r.code, r.id])));
        }
        const periods = new Map(
          (
            await c.query<{ id: string; start: string }>(
              "select id,period_start::text as start from financial_period where tenant_id=$1 and company_id=$2 and (fiscal_calendar_id=$3 or $4::boolean) order by period_start",
              [
                ctx.tenantId,
                company,
                target.record.fiscal_calendar_id,
                ["forecast", "scenario"].includes(target.record.kind),
              ],
            )
          ).rows.map((p) => [p.start, p]),
        );
        for (const row of parsed.rows) {
          try {
            const values = row.values,
              account = accounts.get(values["Account Code"] ?? "");
            if (!account) throw new Error("Select an active posting account code in this company.");
            const dimensions: Record<string, string> = {};
            for (const [header, dimension] of [
              ["Department Code", "department"],
              ["Project Code", "project"],
              ["Cost Centre Code", "cost_centre"],
              ["Branch Code", "branch"],
            ]) {
              const code = values[header!];
              if (!code) continue;
              const match = references.get(dimension!)?.get(code);
              if (!match) throw new Error(`${header} is unavailable in this company.`);
              dimensions[dimension!] = match;
            }
            const date = z.iso.date().parse(values["Period Start"]),
              period = periods.get(date);
            if (!period) throw new Error("Period Start must match a period in the selected fiscal calendar.");
            const k = `${account.id}:${budgetDimensionKey(dimensions)}`,
              prior = lines.get(k);
            if (prior?.allocations.some((a) => a.period_id === period.id))
              throw new Error("Duplicate account/dimension/period allocation.");
            const line = budgetLineInputSchema.parse({
              account_id: account.id,
              dimensions,
              notes: values["Notes"] ?? "",
              allocations: [...(prior?.allocations ?? []), { period_id: period.id, amount: values["Amount"] }],
            });
            lines.set(k, line);
          } catch (error) {
            errors.push({
              row: row.sourceRowNumber,
              message:
                error instanceof z.ZodError
                  ? "Enter a valid period, amount and notes."
                  : error instanceof Error
                    ? error.message
                    : "Invalid Budget row.",
            });
          }
        }
        const imported = [...lines.values()];
        if (!parsed.rows.length) errors.push({ row: 1, message: "The import contains no allocation rows." });
        if (imported.length > 500)
          errors.push({ row: 1, message: "A budget supports at most 500 account/dimension lines." });
        if (!errors.length)
          try {
            await this.repository.validateLines(
              c,
              ctx.tenantId,
              company,
              target.record.fiscal_calendar_id,
              target.record.kind,
              imported,
            );
          } catch (error) {
            errors.push({ row: 1, message: error instanceof Error ? error.message : "Invalid imported allocations." });
          }
        const id = randomUUID(),
          hash = budgetHash(file);
        await c.query(
          "insert into budget_import(tenant_id,company_id,id,version_id,target_version,content_hash,lines,errors,state,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$7,$8,'preview',$9,$9)",
          [
            ctx.tenantId,
            company,
            id,
            versionId,
            targetVersion,
            hash,
            JSON.stringify(imported),
            JSON.stringify(errors),
            ctx.actor.userId,
          ],
        );
        await budgetAudit(
          c,
          ctx,
          company,
          "budget_import",
          id,
          "previewed",
          "Validated spreadsheet preview",
          correlation,
        );
        return {
          id,
          version_id: versionId,
          target_version: targetVersion,
          version: 1,
          state: "preview",
          lines: imported,
          errors,
          content_hash: hash,
        };
      },
      (v) => budgetImportSchema.parse(v),
    );
  }
  commit(
    ctx: BankingActorContext,
    company: string,
    id: string,
    expected: number,
    reason: string,
    key: string,
    correlation: string,
  ) {
    return this.repository.transactions.mutate(
      ctx,
      company,
      "budget.data.create",
      key,
      { op: "import.commit", id, expected, reason },
      async (c) => {
        const row = (
          await c.query(
            "select id,version_id,target_version,version,state,lines,errors,content_hash from budget_import where tenant_id=$1 and company_id=$2 and id=$3 for update",
            [ctx.tenantId, company, id],
          )
        ).rows[0];
        if (!row) budgetReject("The import preview was not found.", "NOT_FOUND", 404);
        const batch = budgetImportSchema.parse(row);
        if (batch.version !== expected || batch.state !== "preview")
          budgetReject("The import preview changed or was already committed.", "BUDGET_VERSION_CONFLICT", 409);
        if (batch.errors.length) budgetReject("Correct every import error before committing.");
        const target = await this.repository.read(c, ctx.tenantId, company, batch.version_id);
        if (target.record.version !== batch.target_version)
          budgetReject(
            "The target budget changed after preview. Preview the file again.",
            "BUDGET_VERSION_CONFLICT",
            409,
          );
        await this.repository.replaceLines(c, ctx, company, batch.version_id, batch.lines);
        await c.query(
          "update budget_version set version=version+1,updated_by=$4,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3",
          [ctx.tenantId, company, batch.version_id, ctx.actor.userId],
        );
        await budgetAudit(c, ctx, company, "budget_version", batch.version_id, "imported", reason, correlation);
        await c.query(
          "update budget_import set state='committed',version=version+1,updated_by=$4,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3",
          [ctx.tenantId, company, id, ctx.actor.userId],
        );
        await budgetAudit(c, ctx, company, "budget_import", id, "committed", reason, correlation);
        return this.repository.read(c, ctx.tenantId, company, batch.version_id);
      },
      (v) => budgetDetailSchema.parse(v),
    );
  }
  export(ctx: BankingActorContext, q: BudgetQuery, format: "csv" | "xlsx", allocations = false) {
    return this.repository.transactions.run(ctx, q.company_id, "budget.data.export", false, async (c) => {
      let headers: readonly string[], rows: string[][];
      if (allocations) {
        if (!q.version_id) budgetReject("Select a budget version to export allocations.");
        const detail = await this.repository.read(c, ctx.tenantId, q.company_id, q.version_id);
        headers = budgetImportHeaders;
        rows = [];
        const dimensions = detail.lines.map((l) => l.dimensions),
          orgIds = dimensions.flatMap((d) => [d.department, d.branch].filter((v): v is string => !!v));
        const organizationCodes = new Map(
          (
            await c.query<{ id: string; code: string }>(
              "select id,code from organization_unit where tenant_id=$1 and id=any($2::text[]) and organization_unit_is_within_company($1,id,$3)",
              [ctx.tenantId, orgIds, q.company_id],
            )
          ).rows.map((r) => [r.id, r.code]),
        );
        const projectCodes = new Map(
          (
            await c.query<{ id: string; code: string }>(
              "select id,code from erp_project where tenant_id=$1 and company_id=$2 and id=any($3::text[])",
              [ctx.tenantId, q.company_id, dimensions.flatMap((d) => (d.project ? [d.project] : []))],
            )
          ).rows.map((r) => [r.id, r.code]),
        );
        const costCentreCodes = new Map(
          (
            await c.query<{ id: string; code: string }>(
              "select id,code from hr_master_record where tenant_id=$1 and company_id=$2 and id=any($3::text[])",
              [ctx.tenantId, q.company_id, dimensions.flatMap((d) => (d.cost_centre ? [d.cost_centre] : []))],
            )
          ).rows.map((r) => [r.id, r.code]),
        );
        const periods = new Map(
          (
            await c.query<{ id: string; start: string }>(
              "select id,period_start::text as start from financial_period where tenant_id=$1 and company_id=$2 and id=any($3::text[])",
              [ctx.tenantId, q.company_id, detail.lines.flatMap((l) => l.allocations.map((a) => a.period_id))],
            )
          ).rows.map((p) => [p.id, p.start]),
        );
        for (const line of detail.lines)
          for (const allocation of line.allocations) {
            rows.push([
              line.account_code,
              organizationCodes.get(line.dimensions.department ?? "") ?? "",
              projectCodes.get(line.dimensions.project ?? "") ?? "",
              costCentreCodes.get(line.dimensions.cost_centre ?? "") ?? "",
              organizationCodes.get(line.dimensions.branch ?? "") ?? "",
              periods.get(allocation.period_id) ?? "",
              allocation.amount,
              line.notes,
            ]);
          }
      } else {
        headers = [
          "Currency",
          "As Of",
          "Version",
          "Account Code",
          "Account",
          "Period Start",
          "Department",
          "Project",
          "Cost Centre",
          "Branch",
          "Budget",
          "Transfers",
          "Actual",
          "Open Commitment",
          "Available",
          "Variance",
          "Variance %",
        ];
        const first = await loadBudgetReport(
          c,
          ctx.tenantId,
          q.company_id,
          budgetQuerySchema.parse({ ...q, offset: 0, limit: 100 }),
          true,
        );
        const results = [...first.rows];
        rows = results.map((r) => [
          first.currency,
          first.as_of,
          q.version_id ?? first.policy?.control_version_id ?? "",
          r.account_code,
          r.account_name,
          r.period_start,
          r.dimensions.department ?? "",
          r.dimensions.project ?? "",
          r.dimensions.cost_centre ?? "",
          r.dimensions.branch ?? "",
          r.budget,
          r.transfers,
          r.actual,
          r.commitment,
          r.available,
          r.variance,
          r.variance_percent ?? "",
        ]);
      }
      if (format === "xlsx") return writeXlsx("Budget", headers, rows);
      const cell = (value: string) =>
        `"${(/^[\s]*[=+@-]/.test(value) && !/^-[\d.]+$/.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`;
      return Buffer.from([headers, ...rows].map((row) => row.map(cell).join(",")).join("\r\n"), "utf8");
    });
  }
}
