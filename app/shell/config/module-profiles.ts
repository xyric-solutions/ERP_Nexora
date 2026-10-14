/**
 * Registry of matured module profiles for the isolated Nexora UI/UX prototype.
 *
 * Modules are matured one at a time. A module listed here renders
 * domain-specific screens; every other module keeps the generic archetype
 * rendering, so the 34-module catalogue stays complete throughout.
 */

import { bankingProfile } from "@prototype/features/banking/model/banking-profile.ts";
import { financeProfile } from "@prototype/features/finance/model/finance-profile.ts";
import { fleetProfile } from "@prototype/features/fleet/model/fleet-profile.ts";
import type { ModulePageProfile, ModuleProfile } from "@prototype/shared/types/module-profile-types";

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
