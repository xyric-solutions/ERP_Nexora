/**
 * Row standard for every HR & Payroll table: `text-sm` with `px-4 py-3` cells, matching the
 * Organisation & Masters sheets. Use `hrCell` on hand-styled cells and `hrDataTableClass` on a
 * table whose cells carry no classes of their own (it replaces the legacy `nx-data-table` in HR).
 * Empty-state rows may use extra vertical padding; dense day-by-day grids are deliberate exceptions.
 */
export const hrCell = "px-4 py-3";

/**
 * Compact record-list standard (Employee Lifecycle and its approval lists): every cell stays on one
 * line, so all sections share the same row height. Column order is Code, Name (or the primary
 * identifying field; employee lists use Employee Code then Employee Name), remaining details, and
 * Status last. Never stack a code underneath a name.
 */
export const hrListCell = "px-4 py-2.5 whitespace-nowrap align-middle";
export const hrListHead = `${hrListCell} font-semibold`;
/** A record or employee code cell. */
export const hrListCode = `${hrListCell} font-mono text-[13px]`;
/** A long text cell (name, description) that truncates instead of wrapping. */
export const hrListText = `${hrListCell} max-w-72 truncate`;

/** "Re-approve" for a rejected record, otherwise "Approve": rejected records can be approved again. */
export const hrApproveLabel = (status: string) => (status === "rejected" ? "Re-approve" : "Approve");

export const hrDataTableClass = [
  "w-full min-w-210 border-separate border-spacing-0 text-left text-sm",
  "[&_th]:whitespace-nowrap [&_th]:border-b [&_th]:border-border [&_th]:bg-muted/60 [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:font-semibold",
  "[&_td]:border-b [&_td]:border-border [&_td]:bg-card [&_td]:px-4 [&_td]:py-3 [&_td]:align-middle",
  "[&_tbody_tr:last-child_td]:border-b-0 [&_tbody_tr:hover_td]:bg-muted/60",
  "[&_.amount]:whitespace-nowrap [&_.amount]:text-right [&_.amount]:tabular-nums",
  "[&_input[type=checkbox]]:size-3.75 [&_input[type=checkbox]]:accent-primary",
].join(" ");
