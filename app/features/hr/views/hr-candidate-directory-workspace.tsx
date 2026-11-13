"use client";
import { WorkTable } from "@/shared/ui/work-table";
import { WorkForm } from "@/shared/ui/work-form";

import { HrRecordDrawer } from "../components/hr-record-drawer";
import { HrRecordCodeField } from "../components/hr-create-form";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { HrCandidateDirectory } from "@nexora/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/session/session-provider";

import { HrApiClient } from "../api/hr-client";
import { HrConfirmDeleteButton } from "../components/hr-confirm-delete-button";
import {
  HrDetailAudit,
  HrDetailGroup,
  HrDetailSection,
  HrDetailSummary,
  HrDetailTile,
  hrDisplayDate,
} from "../components/hr-detail-tile";
import { HrDrawerActions } from "../components/hr-drawer-context";
import { HrEditButton } from "../components/hr-icon-buttons";
import { HrMasterStatusBadge } from "../components/hr-master-status-badge";
import { HrMasterStatusFilter, type HrMasterStatus } from "../components/hr-master-status-filter";

type Candidate = HrCandidateDirectory["items"][number];
type CandidateSource = Candidate["source"];
type Editor = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  source: CandidateSource;
  status: Candidate["status"];
};
const sourceLabel: Record<CandidateSource, string> = {
  direct: "Direct",
  referral: "Referral",
  agency: "Agency",
  job_board: "Job board",
  other: "Other",
};
/** Candidates are stored as active/archived; the interface calls archived records Deactivated. */
const statusLabel = (status: Candidate["status"]) => (status === "active" ? "Active" : "Deactivated");
const filterToStatus = (filter: HrMasterStatus): Candidate["status"] | undefined =>
  filter === "all" ? undefined : filter === "active" ? "active" : "archived";
const selectClass = "h-9 min-w-0 w-full rounded-md border border-input bg-background px-2";

export function HrCandidateDirectoryWorkspace() {
  const { api, csrfToken, session, loading: sessionLoading, refresh: refreshSession } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const permissions = session?.user.permissions ?? [];
  const canRead = permissions.includes("hr.employee.read");
  const canUpdate = permissions.includes("hr.employee.update");
  const [companyId, setCompanyId] = useState("");
  const [records, setRecords] = useState<Candidate[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<HrMasterStatus>("active");
  const [selectedId, setSelectedId] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(
    async (company: string, nextSearch: string, nextFilter: HrMasterStatus) => {
      if (!company) return;
      setLoading(true);
      try {
        const result = await client.candidates({
          companyId: company,
          search: nextSearch,
          status: filterToStatus(nextFilter),
        });
        setRecords(result.items);
        setSelectedId((current) => (result.items.some((item) => item.id === current) ? current : ""));
      } catch {
        setMessage("Candidates could not be loaded from the authorized API. No prototype rows are shown.");
        setRecords([]);
      } finally {
        setLoading(false);
      }
    },
    [client],
  );

  useEffect(() => {
    if (sessionLoading || !canRead) {
      if (!sessionLoading) setLoading(false);
      return;
    }
    client
      .companies()
      .then((result) => {
        const first = result.items[0]?.id ?? "";
        setCompanyId(first);
        if (!first) {
          setMessage("No authorized company is available. Ask your administrator to review company access.");
          setLoading(false);
          return;
        }
        return load(first, "", "active");
      })
      .catch(() => {
        setMessage("Authorized companies could not be loaded.");
        setLoading(false);
      });
  }, [canRead, client, load, sessionLoading]);

  const selected = records.find((record) => record.id === selectedId);
  const reload = () => load(companyId, search, filter);
  const editorFor = (record: Candidate): Editor => {
    const [first = "", ...rest] = record.display_name.split(" ");
    return {
      firstName: first,
      lastName: rest.join(" "),
      email: record.email,
      phone: record.phone,
      source: record.source,
      status: record.status,
    };
  };
  const failure = (cause: unknown, fallback: string) =>
    cause instanceof Error && cause.message ? cause.message : fallback;

  const save = async (candidate: Candidate, values: Editor) => {
    if (!values.firstName.trim() || !values.lastName.trim() || !values.email.trim()) {
      setMessage("First name, last name and email are required.");
      return false;
    }
    setSaving(true);
    try {
      await client.updateCandidate(
        candidate.id,
        {
          company_id: companyId,
          first_name: values.firstName.trim(),
          last_name: values.lastName.trim(),
          email: values.email.trim(),
          phone: values.phone.trim(),
          source: values.source,
          status: values.status,
        },
        csrfToken(),
        crypto.randomUUID(),
      );
      setMessage(
        values.status === candidate.status
          ? `${candidate.reference} was saved.`
          : `${candidate.reference} is now ${statusLabel(values.status).toLowerCase()}.`,
      );
      setEditor(null);
      await reload();
      return true;
    } catch (cause) {
      setMessage(failure(cause, "The candidate could not be saved."));
      return false;
    } finally {
      setSaving(false);
    }
  };
  const remove = async (candidate: Candidate) => {
    setSaving(true);
    try {
      await client.deleteCandidate(candidate.id, companyId, csrfToken(), crypto.randomUUID());
      setMessage(`${candidate.reference} was deleted.`);
      setSelectedId("");
      await reload();
      return true;
    } catch (cause) {
      setMessage(failure(cause, "The candidate could not be deleted."));
      return false;
    } finally {
      setSaving(false);
    }
  };

  if (sessionLoading) return <Skeleton className="h-96 w-full" />;
  if (!session)
    return (
      <Alert>
        <AlertTitle>Sign in required</AlertTitle>
        <AlertDescription>
          Your session is not active.{" "}
          <Button size="sm" variant="outline" onClick={() => void refreshSession()}>
            Retry session
          </Button>
        </AlertDescription>
      </Alert>
    );
  if (!canRead)
    return (
      <Alert>
        <AlertTitle>Recruitment access required</AlertTitle>
        <AlertDescription>This screen requires HR employee read permission.</AlertDescription>
      </Alert>
    );
  return (
    <section className="grid min-w-0 gap-3" aria-label="Candidate Directory">
      {message && !selected ? (
        <Alert>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      <WorkForm
        className="grid gap-3 rounded-lg border border-border bg-card p-3 md:grid-cols-[minmax(14rem,1fr)_auto] md:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          void reload();
        }}
      >
        <label htmlFor="candidate-search" className="grid content-start gap-1 text-sm font-medium">
          Search
          <Input
            id="candidate-search"
            placeholder="Name, email or reference"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <Button type="submit" variant="outline">
          Search
        </Button>
      </WorkForm>
      <HrMasterStatusFilter
        value={filter}
        onChange={(next) => {
          setFilter(next);
          void load(companyId, search, next);
        }}
      />
      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="relative min-w-0 overflow-x-auto rounded-lg border border-border bg-card">
          <WorkTable tableId="app/features/hr/views/hr-candidate-directory-workspace:1" className="w-full min-w-160 text-left text-sm">
            <thead className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Candidate</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Added</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr
                  key={record.id}
                  tabIndex={0}
                  className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                  onClick={() => {
                    setEditor(null);
                    setMessage("");
                    setSelectedId(record.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setEditor(null);
                      setSelectedId(record.id);
                    }
                  }}
                >
                  <td className="px-4 py-3">
                    <span className="block font-medium">{record.display_name}</span>
                    <span className="block text-xs text-muted-foreground">{record.reference}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="block">{record.email}</span>
                    {record.phone ? <span className="block text-xs text-muted-foreground">{record.phone}</span> : null}
                  </td>
                  <td className="px-4 py-3">{sourceLabel[record.source]}</td>
                  <td className="px-4 py-3">
                    <HrMasterStatusBadge status={record.status === "active" ? "active" : "inactive"} />
                  </td>
                  <td className="px-4 py-3">{new Date(record.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {records.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-muted-foreground" colSpan={5}>
                    No candidates match this filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </WorkTable>
        </div>
      )}
      <HrRecordDrawer
        title={selected ? (editor ? `Edit ${selected.display_name}` : selected.display_name) : "Candidate"}
        open={Boolean(selected)}
        onClose={() => {
          setEditor(null);
          setSelectedId("");
        }}
        busy={saving}
        notice={message}
      >
        {selected && editor ? (
          <WorkForm
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              void save(selected, editor);
            }}
          >
            <HrRecordCodeField
              id="candidate-code"
              kind="candidate"
              companyId={companyId}
              value={selected.reference}
              existing
            />
            <HrDetailSection title="Name">
              <div className="grid grid-cols-1 gap-4">
                <label htmlFor="candidate-firstName" className="grid content-start gap-1 text-sm font-medium">
                  First name
                  <Input
                    id="candidate-firstName"
                    required
                    maxLength={100}
                    value={editor.firstName}
                    onChange={(event) => setEditor({ ...editor, firstName: event.target.value })}
                  />
                </label>
                <label htmlFor="candidate-lastName" className="grid content-start gap-1 text-sm font-medium">
                  Last name
                  <Input
                    id="candidate-lastName"
                    required
                    maxLength={100}
                    value={editor.lastName}
                    onChange={(event) => setEditor({ ...editor, lastName: event.target.value })}
                  />
                </label>
              </div>
            </HrDetailSection>
            <HrDetailSection title="Contact">
              <div className="grid grid-cols-1 gap-4">
                <label htmlFor="candidate-email" className="grid content-start gap-1 text-sm font-medium">
                  Email
                  <Input
                    id="candidate-email"
                    required
                    type="email"
                    maxLength={320}
                    value={editor.email}
                    onChange={(event) => setEditor({ ...editor, email: event.target.value })}
                  />
                </label>
                <label htmlFor="candidate-phone" className="grid content-start gap-1 text-sm font-medium">
                  Phone
                  <Input
                    id="candidate-phone"
                    maxLength={40}
                    value={editor.phone}
                    onChange={(event) => setEditor({ ...editor, phone: event.target.value })}
                  />
                </label>
              </div>
            </HrDetailSection>
            <HrDetailSection title="Sourcing">
              <div className="grid grid-cols-1 gap-4">
                <label className="grid content-start gap-1 text-sm font-medium">
                  Source
                  <select
                    className={selectClass}
                    value={editor.source}
                    onChange={(event) => setEditor({ ...editor, source: event.target.value as CandidateSource })}
                  >
                    {(Object.keys(sourceLabel) as CandidateSource[]).map((source) => (
                      <option key={source} value={source}>
                        {sourceLabel[source]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid content-start gap-1 text-sm font-medium">
                  Status
                  <select
                    className={selectClass}
                    value={editor.status}
                    onChange={(event) => setEditor({ ...editor, status: event.target.value as Candidate["status"] })}
                  >
                    <option value="active">Active</option>
                    <option value="archived">Deactivated</option>
                  </select>
                </label>
              </div>
            </HrDetailSection>
            <HrDrawerActions>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </HrDrawerActions>
          </WorkForm>
        ) : selected ? (
          <>
            <HrDetailSummary
              code={selected.reference}
              status={selected.status}
              statusLabel={statusLabel(selected.status)}
            >
              {sourceLabel[selected.source]} candidate · added {hrDisplayDate(selected.created_at, false)}
            </HrDetailSummary>
            <HrDetailGroup title="Candidate">
              <HrDetailTile label="Name" value={selected.display_name} />
              <HrDetailTile label="Email" value={selected.email} />
              <HrDetailTile label="Phone" value={selected.phone} />
              <HrDetailTile label="Source" value={sourceLabel[selected.source]} />
            </HrDetailGroup>
            <HrDetailAudit items={[{ label: "Added", value: hrDisplayDate(selected.created_at, true) }]} />
            {canUpdate ? (
              <HrDrawerActions>
                <Button
                  variant="outline"
                  disabled={saving}
                  onClick={() =>
                    void save(selected, {
                      ...editorFor(selected),
                      status: selected.status === "active" ? "archived" : "active",
                    })
                  }
                >
                  {selected.status === "active" ? "Deactivate" : "Activate"}
                </Button>
                <HrEditButton
                  label={`Edit ${selected.display_name}`}
                  disabled={saving}
                  onClick={() => setEditor(editorFor(selected))}
                />
                <HrConfirmDeleteButton
                  label={`Delete ${selected.display_name}`}
                  title={`Delete ${selected.display_name}?`}
                  description="Candidates without applications can be deleted. The deletion is kept in the audit trail."
                  variant="outline"
                  disabled={saving}
                  onConfirm={() => remove(selected)}
                />
              </HrDrawerActions>
            ) : null}
          </>
        ) : null}
      </HrRecordDrawer>
    </section>
  );
}
