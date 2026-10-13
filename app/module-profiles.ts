/**
 * Registry of matured module profiles for the isolated Nexora UI/UX prototype.
 *
 * Modules are matured one at a time. A module listed here renders
 * domain-specific screens; every other module keeps the generic archetype
 * rendering, so the 34-module catalogue stays complete throughout.
 */

import { bankingProfile } from "./module-banking-data.ts";
import { financeProfile } from "./module-finance-data.ts";
import { fleetProfile } from "./module-fleet-data.ts";
import type { ModulePageProfile, ModuleProfile } from "./module-profile-types";

export const moduleProfiles: readonly ModuleProfile[] = [bankingProfile, financeProfile, fleetProfile];

/** Modules whose screens have been matured beyond the generic archetypes. */
export const MATURED_MODULE_IDS: readonly string[] = moduleProfiles.map((profile) => profile.moduleId);

const profilesByModuleId = new Map(moduleProfiles.map((profile) => [profile.moduleId, profile]));

export function getModulePageProfile(moduleId: string, pageId: string): ModulePageProfile | null {
  return profilesByModuleId.get(moduleId)?.pages[pageId] ?? null;
}

export function isMaturedModule(moduleId: string): boolean {
  return profilesByModuleId.has(moduleId);
}
