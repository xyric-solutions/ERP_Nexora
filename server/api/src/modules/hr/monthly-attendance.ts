import type { HrDailyAttendanceRow, HrMonthlyAttendanceRow } from "@nexora/contracts";
import { hrDailyAttendanceStatusSchema } from "@nexora/contracts";
export function summarizeAttendanceMonth(
  days: { on_date: string; row: HrDailyAttendanceRow }[],
): HrMonthlyAttendanceRow[] {
  const employees = new Map<string, HrMonthlyAttendanceRow>();
  const leaveUnits = new Map<string, number>();
  for (const { on_date, row } of days) {
    let item = employees.get(row.employee_id);
    if (!item) {
      item = {
        employee_id: row.employee_id,
        employee_number: row.employee_number,
        display_name: row.display_name,
        departments: [],
        covered_days: 0,
        counts: Object.fromEntries(
          hrDailyAttendanceStatusSchema.options.map((s) => [s, 0]),
        ) as HrMonthlyAttendanceRow["counts"],
        worked_minutes: 0,
        late_minutes: 0,
        approved_leave_days: "0",
        potential_overtime_minutes: 0,
        approved_overtime_minutes: 0,
        correction_days: 0,
        days: [],
        finalized_input: null,
      };
      employees.set(row.employee_id, item);
    }
    if (row.department && !item.departments.includes(row.department)) item.departments.push(row.department);
    item.covered_days++;
    item.counts[row.status]++;
    item.worked_minutes += row.worked_minutes;
    item.late_minutes += row.late_minutes;
    item.potential_overtime_minutes += row.potential_overtime_minutes;
    item.approved_overtime_minutes += row.approved_overtime_minutes;
    item.correction_days += Number(row.correction_applied);
    leaveUnits.set(
      row.employee_id,
      (leaveUnits.get(row.employee_id) ?? 0) + Math.round(Number(row.leave_days) * 10000),
    );
    item.days.push({
      on_date,
      status: row.status,
      worked_minutes: row.worked_minutes,
      late_minutes: row.late_minutes,
      leave_days: row.leave_days,
      shift_name: row.shift_name,
      issues: row.issues,
      correction_applied: row.correction_applied,
      potential_overtime_minutes: row.potential_overtime_minutes,
      approved_overtime_minutes: row.approved_overtime_minutes,
    });
  }
  for (const item of employees.values()) {
    item.approved_leave_days = String((leaveUnits.get(item.employee_id) ?? 0) / 10000);
    item.days.sort((a, b) => a.on_date.localeCompare(b.on_date));
    item.departments.sort();
  }
  return [...employees.values()].sort(
    (a, b) => a.employee_number.localeCompare(b.employee_number) || a.employee_id.localeCompare(b.employee_id),
  );
}
