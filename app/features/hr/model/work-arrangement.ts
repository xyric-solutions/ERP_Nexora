import type { HrWorkArrangement } from "@nexora/contracts";

/** Where a role or location works; shared by Work Locations and Manpower Requisitions. */
export const workArrangementOptions = [
  { value: "on_site", label: "On-site" },
  { value: "hybrid", label: "Hybrid" },
  { value: "remote", label: "Remote" },
  { value: "client_site", label: "Client site" },
] as const satisfies readonly { value: HrWorkArrangement; label: string }[];

export function workArrangementLabel(value: string | null | undefined): string {
  if (!value) return "Not recorded";
  return workArrangementOptions.find((option) => option.value === value)?.label ?? value;
}

export function isWorkArrangement(value: string): value is HrWorkArrangement {
  return workArrangementOptions.some((option) => option.value === value);
}
