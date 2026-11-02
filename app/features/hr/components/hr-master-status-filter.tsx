import { Button } from "@/components/ui/button";

export type HrMasterStatus = "active" | "inactive" | "all";

export function HrMasterStatusFilter({
  value,
  onChange,
}: {
  value: HrMasterStatus;
  onChange: (status: HrMasterStatus) => void;
}) {
  return (
    <div role="group" aria-label="Record status" className="flex flex-wrap gap-1">
      <Button
        variant={value === "active" ? "secondary" : "ghost"}
        aria-pressed={value === "active"}
        onClick={() => onChange("active")}
      >
        Active
      </Button>
      <Button
        variant={value === "inactive" ? "secondary" : "ghost"}
        aria-pressed={value === "inactive"}
        onClick={() => onChange("inactive")}
      >
        Inactive / archived
      </Button>
      <Button
        variant={value === "all" ? "secondary" : "ghost"}
        aria-pressed={value === "all"}
        onClick={() => onChange("all")}
      >
        All records
      </Button>
    </div>
  );
}
