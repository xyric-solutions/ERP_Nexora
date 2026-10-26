import type { PoolClient } from "pg";
import type { HrLeaveBalance } from "@nexora/contracts";
import { HrApiError, type HrActorContext } from "./source-repository.js";
import { attendanceHash } from "./attendance-completion.js";
const fail = (message: string): never => {
  throw new HrApiError(409, "HR_LEAVE_REVIEW_REQUIRED", message);
};
export const leaveUnits = (value: string): number => {
  if (!/^-?\d+(\.\d{1,4})?$/.test(value)) fail("Use an exact day quantity with up to four decimal places.");
  const negative = value.startsWith("-"),
    [whole, fraction = ""] = value.replace("-", "").split(".");
  return (negative ? -1 : 1) * (Number(whole) * 10000 + Number(fraction.padEnd(4, "0")));
};
export const leaveDecimal = (units: number): string => (units / 10000).toFixed(4);
export async function readLeaveBalances(
  client: PoolClient,
  c: HrActorContext,
  company: string,
  pairs: { employee: string; type: string }[],
  date: string,
  exclude?: string,
): Promise<HrLeaveBalance[]> {
  if (!pairs.length) return [];
  const employees = [...new Set(pairs.map((p) => p.employee))],
    types = [...new Set(pairs.map((p) => p.type))];
  const people = (
    await client.query<{ id: string; employee_number: string; display_name: string }>(
      `select id,employee_number,concat_ws(' ',first_name,middle_name,last_name) as display_name from employee where tenant_id=$1 and id=any($2::text[])`,
      [c.tenantId, employees],
    )
  ).rows;
  const leaveTypes = (
    await client.query<{ id: string; name: string; paid: boolean }>(
      `select id,name,paid from hr_leave_type where tenant_id=$1 and company_id=$2 and id=any($3::text[])`,
      [c.tenantId, company, types],
    )
  ).rows;
  const ledger = (
    await client.query<{
      id: string;
      employee_id: string;
      leave_type_id: string;
      kind: string;
      days: string;
      effective_on: string;
    }>(
      `select id,employee_id,leave_type_id,kind,days::text,effective_on::text from hr_leave_transaction where tenant_id=$1 and company_id=$2 and employee_id=any($3::text[]) and leave_type_id=any($4::text[]) order by effective_on,id`,
      [c.tenantId, company, employees, types],
    )
  ).rows;
  const pending = (
    await client.query<{ id: string; employee_id: string; leave_type_id: string; requested_days: string }>(
      `select id,employee_id,leave_type_id,requested_days::text from hr_leave_request where tenant_id=$1 and company_id=$2 and employee_id=any($3::text[]) and leave_type_id=any($4::text[]) and status in ('pending_manager','pending_hr') and ($5::text is null or id<>$5) order by id`,
      [c.tenantId, company, employees, types, exclude ?? null],
    )
  ).rows;
  return pairs.map((pair) => {
    const person = people.find((p) => p.id === pair.employee),
      type = leaveTypes.find((t) => t.id === pair.type);
    if (!person || !type)
      throw new HrApiError(
        404,
        "HR_LEAVE_BALANCE_NOT_FOUND",
        "The employee or leave type is unavailable in your company scope.",
      );
    const entries = ledger.filter((t) => t.employee_id === pair.employee && t.leave_type_id === pair.type),
      reservations = pending.filter((t) => t.employee_id === pair.employee && t.leave_type_id === pair.type),
      asOf = entries.filter((t) => t.effective_on <= date);
    const sum = (kind: string) => asOf.filter((t) => t.kind === kind).reduce((n, t) => n + leaveUnits(t.days), 0),
      posted = asOf.reduce((n, t) => n + leaveUnits(t.days), 0),
      reserved = reservations.reduce((n, r) => n + leaveUnits(r.requested_days), 0),
      future = entries
        .filter(
          (t) =>
            t.effective_on > date &&
            (t.kind === "used" ||
              t.kind === "reversal" ||
              t.kind === "encashed" ||
              t.kind === "encashment_reversal" ||
              t.kind === "encashment_correction"),
        )
        .reduce((n, t) => n - leaveUnits(t.days), 0);
    return {
      employee_id: pair.employee,
      employee_number: person.employee_number,
      display_name: person.display_name,
      leave_type_id: pair.type,
      leave_type: type.name,
      paid: type.paid,
      as_of: date,
      opening: leaveDecimal(sum("opening")),
      accrued: leaveDecimal(sum("accrual")),
      carried: leaveDecimal(sum("carry_forward")),
      adjusted: leaveDecimal(sum("adjustment") + sum("reversal")),
      expired: leaveDecimal(-sum("expiry")),
      used: leaveDecimal(-sum("used")),
      balance: leaveDecimal(posted),
      reserved: leaveDecimal(reserved),
      encashed: leaveDecimal(-sum("encashed") - sum("encashment_reversal") - sum("encashment_correction")),
      future_used: leaveDecimal(future),
      available: leaveDecimal(posted - reserved - future),
      hash: attendanceHash({
        company,
        employee: pair.employee,
        typeId: pair.type,
        date,
        ledger: entries,
        pending: reservations,
      }),
    };
  });
}
