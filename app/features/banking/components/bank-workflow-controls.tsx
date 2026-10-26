"use client";
import { useEffect, useState } from "react";
import type { BankWorkflowOptions, BankWorkflowOptionQuery } from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { ApiError } from "@/lib/api/generated";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/shared/ui/searchable-select";
import { Alert, AlertDescription } from "@/components/ui/alert";

export interface BankWorkflowSelection {
  project_id: string;
  location_id: string;
  approver_user_id: string;
}
export const emptyBankWorkflowSelection: BankWorkflowSelection = {
  project_id: "",
  location_id: "",
  approver_user_id: "",
};
export function BankWorkflowControls({
  transaction,
  company,
  value,
  disabled,
  onChange,
  onSelfApprovalChange,
}: {
  transaction: "payments" | "receipts" | "transfers";
  company: string;
  value: BankWorkflowSelection;
  disabled: boolean;
  onChange: (value: BankWorkflowSelection) => void;
  onSelfApprovalChange?: (allowed: boolean) => void;
}) {
  const { session } = useSession();
  return (
    <section
      aria-label="Workflow context"
      className="grid gap-4 rounded-lg border border-border bg-card p-4 md:grid-cols-3"
    >
      {(
        [
          ["project", "project_id", "Project"],
          ["location", "location_id", "Location / City"],
          ["approver", "approver_user_id", "Approver"],
        ] as const
      ).map(([kind, key, label]) => (
        <WorkflowSelect
          key={`${session?.tenant_id}:${company}:${transaction}:${kind}`}
          transaction={transaction}
          company={company}
          kind={kind}
          label={label}
          selected={value[key]}
          disabled={disabled}
          onSelfApprovalChange={kind === "approver" ? onSelfApprovalChange : undefined}
          onChange={(selected) => onChange({ ...value, [key]: selected })}
        />
      ))}
    </section>
  );
}
export function WorkflowSelect({
  transaction,
  company,
  kind,
  label,
  selected,
  disabled,
  onChange,
  onSelfApprovalChange,
}: {
  transaction: "payments" | "receipts" | "transfers";
  company: string;
  kind: BankWorkflowOptionQuery["kind"];
  label: string;
  selected: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onSelfApprovalChange?: (allowed: boolean) => void;
}) {
  const { api } = useSession();
  const [search, setSearch] = useState(""),
    [cursor, setCursor] = useState("");
  const [page, setPage] = useState<BankWorkflowOptions>({ items: [], selected: null, next_cursor: null });
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!company) return;
    let active = true;
    const timer = setTimeout(() => {
      const query = new URLSearchParams({
        company_id: company,
        kind,
        limit: "50",
        ...(search ? { search } : {}),
        ...(selected ? { selected_id: selected } : {}),
        ...(cursor ? { cursor } : {}),
      });
      Promise.resolve()
        .then(() => api.listBankWorkflowOptions(transaction, `?${query}`))
        .then((result) => {
          if (active)
            setPage((current) => ({
              ...result,
              items: cursor
                ? [
                    ...current.items,
                    ...result.items.filter((item) => !current.items.some((prior) => prior.id === item.id)),
                  ]
                : result.items,
            }));
        })
        .catch((caught) => {
          if (active)
            setError(
              caught instanceof ApiError ? caught.message : `Could not load ${label.toLowerCase()} options. Retry.`,
            );
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, transaction, company, kind, selected, search, cursor, label, retry]);
  const choices =
    page.selected && !page.items.some((item) => item.id === page.selected!.id)
      ? [page.selected, ...page.items]
      : page.items;
  const selectedSelfAllowed =
    !loading &&
    !error &&
    kind === "approver" &&
    choices.some((item) => item.id === selected && item.eligible && item.self_approval);
  useEffect(() => {
    onSelfApprovalChange?.(selectedSelfAllowed);
  }, [onSelfApprovalChange, selectedSelfAllowed]);
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">
          {label}
          {kind === "approver" ? " *" : ""}
        </span>
        <SearchableSelect
          label={label}
          required={kind === "approver"}
          value={selected}
          options={[
            {
              value: "",
              label: kind === "approver" ? "Select approver before submission" : `No ${label.toLowerCase()} selected`,
            },
            ...(selected && !choices.some((item) => item.id === selected)
              ? [{ value: selected, label: `Saved reference · ${selected}`, disabled: true }]
              : []),
            ...choices.map((item) => ({
              value: item.id,
              label: `${item.code ? item.code + " · " : ""}${item.name}${!item.eligible ? " (not currently eligible)" : item.self_approval ? " (audited self-approval)" : ""}`,
              disabled: !item.eligible,
            })),
          ]}
          placeholder={!company ? "Choose company first" : loading ? "Loading…" : `Select ${label.toLowerCase()}`}
          disabled={disabled || !company || !!error}
          loading={loading}
          search={search}
          onSearchChange={(next) => {
            setSearch(next);
            setCursor("");
            setPage((current) => ({
              items: [],
              selected: current.selected ?? current.items.find((item) => item.id === selected) ?? null,
              next_cursor: null,
            }));
            setLoading(true);
            setError("");
          }}
          onValueChange={(next) => {
            setLoading(true);
            setError("");
            onChange(next);
          }}
          footer={
            page.next_cursor ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled || loading}
                onClick={() => {
                  setCursor(page.next_cursor!);
                  setLoading(true);
                  setError("");
                }}
              >
                Load more {label.toLowerCase()}
              </Button>
            ) : null
          }
        />
      </label>
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {error}{" "}
            <Button
              variant="link"
              disabled={disabled}
              onClick={() => {
                setError("");
                setLoading(true);
                setRetry((attempt) => attempt + 1);
              }}
            >
              Retry {label.toLowerCase()}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {page.selected && !page.selected.eligible && (
        <p role="status" className="text-sm text-destructive">
          The saved {label.toLowerCase()} is no longer eligible. Historical details are retained.
        </p>
      )}
      {kind === "approver" && (
        <p className="text-xs text-muted-foreground">
          Assignment does not grant permission. The server rechecks approval authority; approval never posts
          automatically.
        </p>
      )}
    </div>
  );
}
