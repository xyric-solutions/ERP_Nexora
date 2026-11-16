"use client";
import type { AssetDashboard } from "@nexora/contracts";
import { Button } from "@/components/ui/button";
import { WorkTable } from "./asset-table";
import { Section, moneyLabel } from "./asset-fields";
export const assetGroupReports: Record<string, AssetDashboard["groups"][number]["dimension"]> = {
  Categories: "category",
  Locations: "location",
  Custodians: "custodian",
  Departments: "department",
  Projects: "project",
};
export function AssetGroupReport({
  dashboard,
  report,
  dp,
  busy,
  offset,
  limit,
  onOffset,
  onDrill,
}: {
  dashboard: AssetDashboard;
  report: string;
  dp: number;
  busy: boolean;
  offset: number;
  limit: number;
  onOffset: (offset: number) => void;
  onDrill: (id: string) => void;
}) {
  const dimension = assetGroupReports[report],
    page = dashboard.group_pages.find((item) => item.dimension === dimension),
    rows = dashboard.groups.filter((item) => item.dimension === dimension);
  return (
    <Section
      title={`${report} report`}
      description={`${page?.total ?? 0} groups. Values exclude returned and disposed assets.`}
    >
      <div className="col-span-full min-w-0">
        <WorkTable
          tableId={`asset-group-${dimension}`}
          label={`${report} report`}
          aria-label={`${report} report`}
          tools={false}
          paging={false}
        >
          <thead>
            <tr>
              {[
                "Group",
                "Assets",
                "Acquisition cost",
                "Accumulated depreciation",
                "Impairment",
                "Net book value",
                "Actions",
              ].map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.label}</td>
                <td>{row.count}</td>
                <td>{moneyLabel(row.cost, dp)}</td>
                <td>{moneyLabel(row.accumulated_depreciation, dp)}</td>
                <td>{moneyLabel(row.impairment, dp)}</td>
                <td>{moneyLabel(row.net_book_value, dp)}</td>
                <td>
                  <Button variant="outline" size="sm" onClick={() => onDrill(row.id)}>
                    View assets
                  </Button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={7}>No matching asset groups.</td>
              </tr>
            )}
          </tbody>
        </WorkTable>
        <div className="mt-3 flex gap-2">
          <Button variant="outline" disabled={busy || !offset} onClick={() => onOffset(Math.max(0, offset - limit))}>
            Previous groups
          </Button>
          <Button
            variant="outline"
            disabled={busy || page?.next_offset == null}
            onClick={() => onOffset(page?.next_offset ?? offset)}
          >
            Next groups
          </Button>
        </div>
      </div>
    </Section>
  );
}
