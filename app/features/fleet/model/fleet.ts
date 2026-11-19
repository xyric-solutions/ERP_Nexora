import type { FleetBillingStatus } from "@nexora/contracts";
import { ApiError } from "@/lib/api/generated";

/*
 * Live Fleet pages (meeting 16 Nov 2026): Vehicles (with their tools), Drivers (HR employees),
 * Fuel entries with an automatic km-per-litre average, Maintenance and the Fuel Efficiency report.
 * Every other Fleet menu page remains a prototype served from `fleet-profile.ts`.
 */
export type FleetSurface = "vehicles" | "drivers" | "fuel" | "maintenance" | "efficiency";
export interface FleetSection {
  surface: FleetSurface;
  listPage: string;
  formPage: string | null;
  title: string;
  singular: string;
  description: string;
  readPermission: string;
  createPermission: string | null;
}
export const fleetSections: Record<FleetSurface, FleetSection> = {
  vehicles: {
    surface: "vehicles",
    listPage: "vehicles",
    formPage: "add-vehicle",
    title: "Vehicles",
    singular: "Vehicle",
    description: "Vehicles in operation, their driver, odometer and the tools kept in each one.",
    readPermission: "fleet.vehicle.read",
    createPermission: "fleet.vehicle.create",
  },
  drivers: {
    surface: "drivers",
    listPage: "drivers",
    formPage: "add-driver",
    title: "Drivers",
    singular: "Driver",
    description: "HR employees who drive company vehicles, with their licence details.",
    readPermission: "fleet.driver.read",
    createPermission: "fleet.driver.create",
  },
  fuel: {
    surface: "fuel",
    listPage: "fuel-register",
    formPage: "add-fuel-entry",
    title: "Fuel",
    singular: "Fuel entry",
    description: "Fuel added to each vehicle. The fuel average is calculated from the odometer readings.",
    readPermission: "fleet.fuel.read",
    createPermission: "fleet.fuel.create",
  },
  maintenance: {
    surface: "maintenance",
    listPage: "maintenance-entries",
    formPage: "add-maintenance-entry",
    title: "Maintenance",
    singular: "Maintenance entry",
    description: "Maintenance and repairs carried out on each vehicle, in-house or by a vendor.",
    readPermission: "fleet.maintenance.read",
    createPermission: "fleet.maintenance.create",
  },
  efficiency: {
    surface: "efficiency",
    listPage: "fuel-efficiency",
    formPage: null,
    title: "Fuel Efficiency",
    singular: "Fuel efficiency",
    description: "Kilometres per litre for each vehicle: distance travelled ÷ litres added over the period.",
    readPermission: "fleet.fuel.read",
    createPermission: null,
  },
};

/** Page id -> section, for the live pages only. */
export const fleetLivePages: Record<string, FleetSurface> = {
  vehicles: "vehicles",
  "add-vehicle": "vehicles",
  drivers: "drivers",
  "add-driver": "drivers",
  "fuel-register": "fuel",
  "add-fuel-entry": "fuel",
  "maintenance-entries": "maintenance",
  "add-maintenance-entry": "maintenance",
  "fuel-efficiency": "efficiency",
};
export function isFleetLivePage(pageId: string): boolean {
  return Object.prototype.hasOwnProperty.call(fleetLivePages, pageId);
}

/**
 * Fuel and maintenance forms opened from a vehicle carry `vehicle:<id>` as their reference,
 * so the vehicle is chosen already.
 */
export const vehicleReference = (vehicleId: string) => `vehicle:${vehicleId}`;
export function vehicleFromReference(reference?: string): string | null {
  return reference?.startsWith("vehicle:") ? reference.slice("vehicle:".length) || null : null;
}

export const fleetSelectClass =
  "h-10 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

export function fleetError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "Fleet data could not be loaded or saved. Check your connection and retry.";
}

export const billingStatusLabels: Record<FleetBillingStatus, string> = {
  not_applicable: "No vendor",
  pending: "Bill pending",
  billed: "Billed",
};
export const vehicleStatusLabels = { active: "Active", workshop: "In workshop", retired: "Retired" } as const;
export const ownershipLabels = { owned: "Owned", leased: "Leased" } as const;
export const fuelTypeLabels = {
  petrol: "Petrol",
  diesel: "Diesel",
  cng: "CNG",
  hybrid: "Hybrid",
  electric: "Electric",
} as const;
export const toolConditionLabels = { good: "Good", damaged: "Damaged", destroyed: "Destroyed" } as const;
export const paymentRouteLabels: Record<string, string> = {
  payroll: "Payroll",
  stipend: "Stipend",
  accounts_payable: "Accounts payable",
};

export function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Display a decimal string with thousands separators, keeping its decimals. */
export function formatNumber(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const [whole = "0", fraction] = value.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction ? `${grouped}.${fraction}` : grouped;
}
