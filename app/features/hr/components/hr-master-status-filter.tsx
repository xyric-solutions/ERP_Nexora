import { Button } from "@/components/ui/button";

export type HrMasterStatus = "active" | "inactive" | "all";

/** Display order is fixed for every Organisation & Masters page; pages default to "active". */
const statusOptions: readonly { value: HrMasterStatus; label: string }[] = [
  { value: "all", label: "All records" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Deactivated" },
];

export function HrMasterStatusFilter({
  value,
  onChange,
}: {
  value: HrMasterStatus;
  onChange: (status: HrMasterStatus) => void;
}) {
  return (
    <div role="group" aria-label="Record status" className="flex flex-wrap gap-1">
      {statusOptions.map((option) => (
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
