import type { HrHiringBasis } from "@nexora/contracts";

/** How a requisitioned role is engaged. Separate from Employment Setup (pay route and cycle). */
export const hiringBasisOptions = [
  { value: "permanent", label: "Permanent" },
  { value: "temporary", label: "Temporary" },
  { value: "project_based", label: "Project-Based" },
  { value: "contract", label: "Contract" },
  { value: "internship", label: "Internship" },
  { value: "part_time", label: "Part-time" },
] as const satisfies readonly { value: HrHiringBasis; label: string }[];

export function hiringBasisLabel(value: string | null | undefined): string {
  if (!value) return "Not recorded";
  return hiringBasisOptions.find((option) => option.value === value)?.label ?? value;
}

export function isHiringBasis(value: string): value is HrHiringBasis {
  return hiringBasisOptions.some((option) => option.value === value);
}
