import type { HrOrganizationUnitDirectory } from "@nexora/contracts";

type Unit = HrOrganizationUnitDirectory["items"][number];
export type OrganizationUnitType = Unit["type"];
export type OrganizationParentType = OrganizationUnitType | "company";

/**
 * Organisation Structure reads Company -> Project -> Location -> Department.
 * Stored types are unchanged: "branch" is shown as Project and "division" as
 * Location. Business units and warehouses are legacy levels: existing records
 * still display, but they are no longer offered for new units.
 */
export const organizationUnitTypeLabels: Record<OrganizationUnitType, string> = {
  branch: "Project",
  division: "Location",
  department: "Department",
  business_unit: "Business unit",
  warehouse: "Warehouse",
};

/** Unit types offered when creating a unit, in hierarchy order. */
export const selectableOrganizationUnitTypes = ["branch", "division", "department"] as const satisfies readonly OrganizationUnitType[];

/** Top-down order used wherever several levels are listed together. */
export const organizationHierarchyOrder: readonly OrganizationUnitType[] = [
  "business_unit",
  "branch",
  "division",
  "department",
  "warehouse",
];

/** Mirrors the API parent-type rule; the server remains the authority. */
const allowedParents: Record<OrganizationUnitType, readonly OrganizationParentType[]> = {
  business_unit: ["company"],
  branch: ["company", "business_unit"],
  division: ["company", "business_unit", "branch"],
  department: ["company", "business_unit", "branch", "division"],
  warehouse: ["company", "business_unit", "branch", "division"],
};

export function canReportTo(childType: OrganizationUnitType, parentType: OrganizationParentType): boolean {
  return allowedParents[childType].includes(parentType);
}

/** The usual next level beneath a parent: Project under a company, then Location, then Department. */
export function defaultChildType(parentType: OrganizationParentType): OrganizationUnitType {
  if (parentType === "branch") return "division";
  if (parentType === "division") return "department";
  return "branch";
}

/** True when `unitId` is `ancestorId` itself or sits anywhere beneath it. */
export function isWithinUnit(units: readonly Pick<Unit, "id" | "parent_id">[], unitId: string, ancestorId: string): boolean {
  const parents = new Map(units.map((unit) => [unit.id, unit.parent_id]));
  const visited = new Set<string>();
  let current: string | undefined = unitId;
  while (current && !visited.has(current)) {
    if (current === ancestorId) return true;
    visited.add(current);
    current = parents.get(current);
  }
  return false;
}
