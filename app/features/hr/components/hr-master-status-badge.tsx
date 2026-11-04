/** Display wording for Organisation & Masters record status; stored values stay "active" / "inactive". */
export function hrMasterStatusLabel(status: string): string {
  return status === "inactive" ? "Deactivated" : status === "active" ? "Active" : status;
}

export function HrMasterStatusBadge({ status, className = "" }: { status: string; className?: string }) {
  return <span className={`nx-status nx-status-${status} ${className}`.trim()}>{hrMasterStatusLabel(status)}</span>;
}
