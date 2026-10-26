import type { HrDailyAttendanceRow } from "@nexora/contracts";
import { Badge } from "@/components/ui/badge";
export const attendanceLabel = (value: string) => value.replaceAll("_", " ").replace(/^./, (v) => v.toUpperCase());
export const attendanceMinutes = (value: number) => `${Math.floor(value / 60)}h ${value % 60}m`;
export function attendanceStatusClass(status: HrDailyAttendanceRow["status"]): string {
  if (status === "needs_review")
    return "border-[var(--nx-warning-border)] bg-[var(--nx-warning-soft)] text-[var(--nx-warning)]!";
  if (status === "present" || status === "official_duty" || status === "partial_leave")
    return "border-[var(--nx-success-border)] bg-[var(--nx-success-soft)] text-[var(--nx-success-text)]!";
  if (status === "absent") return "border-destructive/30 bg-destructive/10 text-destructive!";
  return "border-border bg-muted text-foreground!";
}
export function AttendanceStatusBadge({ status }: { status: HrDailyAttendanceRow["status"] }) {
  return (
    <Badge variant="outline" className={attendanceStatusClass(status)}>
      {attendanceLabel(status)}
    </Badge>
  );
}
