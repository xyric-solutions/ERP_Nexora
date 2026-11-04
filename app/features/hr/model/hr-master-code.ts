import type { HrMasterType } from "@nexora/contracts";

const masterPrefixes: Partial<Record<HrMasterType, string>> = {
  designation: "DSG",
  job_grade: "GRD",
  job: "JOB",
  cost_center: "CC",
  work_location: "LOC",
  employment_setup: "ES",
  employment_type: "ET",
  employee_category: "EC",
};

export const organizationUnitPrefixes = {
  business_unit: "BU",
  division: "DIV",
  branch: "BR",
  department: "DEPT",
  warehouse: "WH",
} as const;

export function nextGeneratedCode(prefix: string, existingCodes: readonly string[]): string {
  const normalizedPrefix = prefix.toUpperCase();
  const matcher = new RegExp(`^${normalizedPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`, "i");
  const next =
    existingCodes.reduce((highest, code) => {
      const match = matcher.exec(code.trim());
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0) + 1;
  return `${normalizedPrefix}-${String(next).padStart(3, "0")}`;
}

export function nextMasterCode(type: HrMasterType, existingCodes: readonly string[]): string {
  return nextGeneratedCode(masterPrefixes[type] ?? "MST", existingCodes);
}
