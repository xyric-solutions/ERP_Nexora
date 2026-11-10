import { Button } from "@/components/ui/button";

export type HrMasterStatus = "active" | "inactive" | "all";

/** Display order is fixed for every Organisation & Masters page; pages default to "active". */
const statusOptions: readonly { value: HrMasterStatus; label: string }[] = [
  { value: "all", label: "All records" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Deactivated" },
];

/**
 * Status category buttons shown beneath a list toolbar. Defaults to All records /
 * Active / Deactivated; a list with its own states (e.g. leave requests) can pass
 * `options` to keep the same look.
 */
export function HrMasterStatusFilter<T extends string = HrMasterStatus>({
  value,
  onChange,
  options,
  label = "Record status",
}: {
  value: T;
  onChange: (status: T) => void;
  options?: readonly { value: T; label: string }[];
  label?: string;
}) {
  const choices = options ?? (statusOptions as unknown as readonly { value: T; label: string }[]);
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1">
      {choices.map((option) => (
        <Button
          key={option.value}
          variant={value === option.value ? "default" : "ghost"}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
