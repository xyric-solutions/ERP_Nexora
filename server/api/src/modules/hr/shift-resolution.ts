import type { HrShiftSummary } from "@nexora/contracts";

/** One weekly-rotation authority for roster previews and attendance. */
export function resolveHrShiftOnDate(
  root: HrShiftSummary,
  members: HrShiftSummary[],
  onDate: string,
): HrShiftSummary | null {
  if (!root.configured) return null;
  if (root.kind !== "rotating") return root;
  if (!root.rotation_anchor_date || !members.length) return null;
  const weeks = Math.floor(
    (Date.parse(onDate + "T00:00:00Z") - Date.parse(root.rotation_anchor_date + "T00:00:00Z")) / 604800000,
  );
  return members[((weeks % members.length) + members.length) % members.length] ?? null;
}
