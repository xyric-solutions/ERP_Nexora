import type { PoolClient } from "pg";
import { HrApiError } from "./source-repository.js";

export type PayrollJournalMapping = { account_id: string; cost_center_id: string };
type Line = { account_id: string; debit: string; credit: string; dimensions?: Record<string, string> };
type Account = { id: string; code: string; required_dimensions: unknown };
/** Explicit whole-account allocation, independently accepted with the accrual. No employee split is inferred. */
export async function resolvePayrollJournalDimensions(
  client: PoolClient,
  tenant: string,
  company: string,
  lines: Line[],
  accounts: Account[],
  mappings: PayrollJournalMapping[],
  required: boolean,
  lock: boolean,
) {
  const invalid = (message: string): never => {
    throw new HrApiError(409, "HR_PAYROLL_JOURNAL_REVIEW_REQUIRED", message);
  };
  if (!Array.isArray(mappings) || mappings.length > 1000)
    invalid("Cost-centre mappings exceed the supported journal boundary.");
  const seen = new Set<string>(),
    blocked: string[] = [];
  for (const m of mappings) {
    if (!m || typeof m.account_id !== "string" || typeof m.cost_center_id !== "string" || seen.has(m.account_id))
      invalid("Each journal account needs at most one valid cost-centre mapping.");
    seen.add(m.account_id);
    const a = accounts.find((a) => a.id === m.account_id);
    if (!a || !Array.isArray(a.required_dimensions) || !a.required_dimensions.includes("cost_center"))
      blocked.push("Mappings must belong to this accrual's accounts requiring the cost_center dimension.");
  }
  const ids = [...new Set(mappings.map((m) => m.cost_center_id))].sort();
  const centres = ids.length
    ? (
        await client.query<{ id: string; code: string; name: string; status: string }>(
          `select id,code,name,status from hr_master_record where tenant_id=$1 and company_id=$2 and master_type='cost_center' and id=any($3::text[]) order by id collate "C"${lock ? " for share" : ""}`,
          [tenant, company, ids],
        )
      ).rows
    : [];

  if (centres.length !== ids.length || centres.some((c) => c.status !== "active"))
    blocked.push(
      "Every mapped cost centre must remain active in the authorized company; reject an unposted proposal to change its mapping.",
    );
  for (const a of accounts) {
    if (!Array.isArray(a.required_dimensions) || a.required_dimensions.some((d) => typeof d !== "string")) {
      blocked.push("Finance account dimension authority is invalid: " + a.code);
      continue;
    }
    if (a.required_dimensions.some((d) => d !== "cost_center"))
      blocked.push(
        "This account requires unsupported accounting dimensions; a governed mapping is required: " + a.code,
      );
    if (required && a.required_dimensions.includes("cost_center") && !seen.has(a.id))
      blocked.push("Choose a cost centre for the whole account balance before preparing the journal: " + a.code);
  }
  const retained = mappings
    .map((m) => ({ account_id: m.account_id, cost_center_id: m.cost_center_id }))
    .sort((a, b) => a.account_id.localeCompare(b.account_id));
  const byAccount = new Map(retained.map((m) => [m.account_id, m.cost_center_id]));
  return {
    mappings: retained,
    authority: centres.map((c) => ({ id: c.id, code: c.code, name: c.name, status: c.status })),
    blocked,
    labels: Object.fromEntries(centres.map((c) => [c.id, c.code + " · " + c.name])),
    lines: lines.map((l) => {
      const centre = byAccount.get(l.account_id);
      return centre ? { ...l, dimensions: { cost_center: centre } } : l;
    }),
  };
}
