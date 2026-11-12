import type { HrOrganizationUnitDirectory } from "@nexora/contracts";

type Unit = HrOrganizationUnitDirectory["items"][number];
export type OrganizationUnitType = Unit["type"];
export type OrganizationParentType = OrganizationUnitType | "company";

/**
 * Organisation Structure reads Company -> Location -> Project -> Department.
 * Stored types are unchanged: "division" is shown as Location and "branch" as
 * Project. Business units and warehouses are legacy levels: existing records
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
export const selectableOrganizationUnitTypes = ["division", "branch", "department"] as const satisfies readonly OrganizationUnitType[];

/** Top-down order used wherever several levels are listed together. */
export const organizationHierarchyOrder: readonly OrganizationUnitType[] = [
  "business_unit",
  "division",
  "branch",
  "department",
  "warehouse",
];

/**
 * Mirrors the API parent-type rule for new or re-parented units; the server
 * remains the authority. A Location sits under the company, a Project under a
 * Location and a Department under a Project.
 */
const allowedParents: Record<OrganizationUnitType, readonly OrganizationParentType[]> = {
  business_unit: ["company"],
  division: ["company", "business_unit"],
  branch: ["division"],
  department: ["branch"],
  warehouse: ["company", "business_unit", "division", "branch"],
};

export function canReportTo(childType: OrganizationUnitType, parentType: OrganizationParentType): boolean {
  return allowedParents[childType].includes(parentType);
}

/** The usual next level beneath a parent: Location under a company, then Project, then Department. */
export function defaultChildType(parentType: OrganizationParentType): OrganizationUnitType {
  if (parentType === "division") return "branch";
  if (parentType === "branch") return "department";
  return "division";
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
