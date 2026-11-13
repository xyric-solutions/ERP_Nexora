"use client";

import {
  administrationModuleCatalogue,
  type AccessLevel,
  type AdministrationModuleId,
  type ModuleAccessMap,
} from "@nexora/contracts";
import { useId } from "react";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const levels: readonly { value: AccessLevel; label: string }[] = [
  { value: "none", label: "None" },
  { value: "view", label: "View" },
  { value: "user", label: "User" },
  { value: "admin", label: "Admin" },
];

/**
 * One row per grantable module with a None / View / User / Admin choice (plan D4).
 * The Super Admin switch grants everything and disables the matrix.
 */
export function AccessMatrix({
  access,
  superAdmin,
  onAccessChange,
  onSuperAdminChange,
  disabled = false,
  superAdminLocked = false,
}: {
  access: ModuleAccessMap;
  superAdmin: boolean;
  onAccessChange: (access: ModuleAccessMap) => void;
  onSuperAdminChange: (superAdmin: boolean) => void;
  disabled?: boolean;
  /** Set when the switch must not be turned off (e.g. last active Super Admin). */
  superAdminLocked?: boolean;
}) {
  const switchId = useId();
  const setLevel = (moduleId: AdministrationModuleId, level: AccessLevel) => {
    const next = { ...access };
    if (level === "none") delete next[moduleId];
    else next[moduleId] = level;
    onAccessChange(next);
  };
  const matrixDisabled = disabled || superAdmin;

  return (
    <div className="grid gap-3">
      <label
        htmlFor={switchId}
        className="flex items-start gap-3 rounded-[var(--nx-radius-md)] border border-border bg-muted/40 p-3"
      >
        <Checkbox
          id={switchId}
          checked={superAdmin}
          disabled={disabled || (superAdmin && superAdminLocked)}
          onCheckedChange={(checked) => onSuperAdminChange(checked === true)}
        />
        <span className="grid gap-0.5">
          <span className="text-sm font-semibold text-foreground">Super Admin (full access)</span>
          <span className="text-xs text-muted-foreground">
            Every module, plus users, access and organisation settings. Changes apply immediately and are audited.
            {superAdmin && superAdminLocked ? " This is the last active Super Admin, so it cannot be removed." : null}
          </span>
        </span>
      </label>

      <fieldset
        disabled={matrixDisabled}
        aria-describedby={superAdmin ? `${switchId}-hint` : undefined}
        className="m-0 grid min-w-0 gap-0 rounded-[var(--nx-radius-md)] border border-border p-0 disabled:opacity-60"
      >
        <legend className="sr-only">Module access</legend>
        {superAdmin ? (
          <p id={`${switchId}-hint`} className="m-0 border-b border-border px-3 py-2 text-xs text-muted-foreground">
            Super Admins have full access, so module levels are not used.
          </p>
        ) : null}
        <div
          aria-hidden="true"
          className="hidden grid-cols-[minmax(0,1fr)_repeat(4,4rem)] gap-2 border-b border-border px-3 py-2 text-xs font-semibold text-muted-foreground sm:grid"
        >
          <span>Module</span>
          {levels.map((level) => (
            <span key={level.value} className="text-center">
              {level.label}
            </span>
          ))}
        </div>
        {administrationModuleCatalogue.map((entry) => {
          const value = superAdmin ? "admin" : (access[entry.id] ?? "none");
          const labelId = `${switchId}-${entry.id}`;
          return (
            <div
              key={entry.id}
              className="grid gap-2 border-b border-border px-3 py-2 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_16.5rem] sm:items-center"
            >
              <span id={labelId} className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-foreground">
                {entry.label}
                {!entry.live ? (
                  <Badge variant="outline" className="text-[11px] font-normal text-muted-foreground">
                    Prototype — UI only
                  </Badge>
                ) : null}
              </span>
              <RadioGroup
                aria-labelledby={labelId}
                className="grid grid-cols-4 gap-2"
                value={value}
                disabled={matrixDisabled}
                onValueChange={(next) => setLevel(entry.id, next as AccessLevel)}
              >
                {levels.map((level) => (
                  <label
                    key={level.value}
                    className="flex cursor-pointer items-center justify-center gap-1.5 text-xs text-muted-foreground has-[[data-disabled]]:cursor-not-allowed sm:flex-col sm:gap-0"
                  >
                    <RadioGroupItem value={level.value} aria-label={`${entry.label}: ${level.label}`} />
                    <span className="sm:sr-only">{level.label}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>
          );
        })}
      </fieldset>
    </div>
  );
}
