"use client";
import type { ComponentProps } from "react";
import { cn } from "cn";
import { WorkTable as SharedWorkTable, WorkOffsetPagination } from "@/shared/ui/work-table";

/** Server-filtered asset tables still need scrolling and their remote pager when local tools are disabled. */
export function WorkTable({ tools = true, pagination, className, ...props }: ComponentProps<typeof SharedWorkTable>) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-card">
      <div className={tools ? undefined : "min-w-0 overflow-x-auto"}>
        <SharedWorkTable
          {...props}
          tools={tools}
          pagination={pagination}
          className={cn(
            "w-full min-w-max border-collapse text-sm [&_th]:border-b [&_th]:border-border [&_th]:bg-muted/40 [&_th]:px-3 [&_th]:py-3 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-3 [&_td]:py-3 [&_td]:align-top [&_tbody_tr:last-child_td]:border-b-0 [&_tbody_tr]:hover:bg-muted/30",
            className,
          )}
        />
      </div>
      {!tools && pagination && (
        <WorkOffsetPagination
          total={pagination.total ?? pagination.offset + pagination.limit}
          offset={pagination.offset}
          size={pagination.limit}
          previousDisabled={pagination.offset === 0}
          nextDisabled={
            !(
              pagination.hasNext ??
              (pagination.total !== undefined && pagination.offset + pagination.limit < pagination.total)
            )
          }
          busy={pagination.busy}
          onSizeChange={pagination.onLimitChange}
          onPrevious={() => pagination.onOffsetChange(Math.max(0, pagination.offset - pagination.limit))}
          onNext={() => pagination.onOffsetChange(pagination.offset + pagination.limit)}
        />
      )}
    </div>
  );
}
