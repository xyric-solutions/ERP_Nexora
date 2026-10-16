"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { SecurityPage } from "@nexora/contracts";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { ApiError } from "../../lib/api/generated";
import { useSession } from "../../lib/session/session-provider";

type Row = Record<string, unknown>;

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "The access review operation was rejected.";
}

function localDateTime(days: number): string {
  const date = new Date(Date.now() + days * 86_400_000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export default function AccessReviewPanel({ permissions }: { permissions: ReadonlySet<string> }) {
  const { api, csrfToken } = useSession();
  const [campaigns, setCampaigns] = useState<Row[]>([]);
  const [items, setItems] = useState<Row[]>([]);
  const [users, setUsers] = useState<Row[]>([]);
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [reviewerId, setReviewerId] = useState("");
  const [startsAt, setStartsAt] = useState(() => localDateTime(0));
  const [endsAt, setEndsAt] = useState(() => localDateTime(30));
  const [decisions, setDecisions] = useState<
    Record<string, { decision: "retain" | "revoke" | "remediate"; reason: string }>
  >({});

  const selected = useMemo(
    () => campaigns.find((campaign) => campaign.campaign_id === selectedCampaign) ?? null,
    [campaigns, selectedCampaign],
  );

  const loadCampaigns = useCallback(async () => {
    const [campaignPage, userPage, options] = await Promise.all([
      api.listSecurityAccessReviewCampaigns("?limit=100"),
      api.listSecurityUsers("?status=active&archived=false&limit=100"),
      api.listSecurityUserOptions(),
    ]);
    setCampaigns(campaignPage.items);
    setUsers(userPage.items);
    setCompanies(options.companies.map((company) => ({ id: company.id, name: company.name })));
    setSelectedCampaign((current) =>
      current && campaignPage.items.some((campaign) => campaign.campaign_id === current)
        ? current
        : campaignPage.items[0]
          ? String(campaignPage.items[0].campaign_id)
          : null,
    );
  }, [api]);

  const loadItems = useCallback(
    async (campaignId: string | null) => {
      if (!campaignId) {
        setItems([]);
        return;
      }
      const page: SecurityPage = await api.listSecurityAccessReviewItems(
        `?campaign_id=${encodeURIComponent(campaignId)}&limit=100`,
      );
      setItems(page.items);
    },
    [api],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      await loadCampaigns();
    } catch (error) {
      setCampaigns([]);
      setMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [loadCampaigns]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        void loadItems(selectedCampaign).catch((error) => {
          setItems([]);
          setMessage(errorMessage(error));
        }),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [loadItems, selectedCampaign]);

  async function createCampaign(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !reviewerId || busy) return;
    setBusy(true);
    setMessage("");
    try {
      await api.createSecurityAccessReviewCampaign(
        {
          name: name.trim(),
          description: description.trim(),
          company_ids: companyId ? [companyId] : [],
          reviewer_ids: [reviewerId],
          review_starts_at: new Date(startsAt).toISOString(),
          review_ends_at: new Date(endsAt).toISOString(),
        },
        csrfToken(),
        `web-access-review-create-${crypto.randomUUID()}`,
      );
      setShowCreate(false);
      setName("");
      await loadCampaigns();
      setMessage("Access review draft created. Submit it for independent approval.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function transition(action: "submit" | "approve" | "reject" | "activate" | "close") {
    if (!selected || busy) return;
    setBusy(true);
    setMessage("");
    try {
      await api.actOnSecurityAccessReviewCampaign(
        action === "reject"
          ? {
              action,
              campaign_id: String(selected.campaign_id),
              expected_version: Number(selected.row_version),
              reason: "Rejected during access certification",
            }
          : {
              action,
              campaign_id: String(selected.campaign_id),
              expected_version: Number(selected.row_version),
            },
        csrfToken(),
        `web-access-review-${action}-${crypto.randomUUID()}`,
      );
      await loadCampaigns();
      await loadItems(String(selected.campaign_id));
      setMessage(`Access review ${action} recorded and audited.`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function decide(item: Row) {
    const itemId = String(item.item_id);
    const value = decisions[itemId] ?? { decision: "retain" as const, reason: "" };
    if (value.decision !== "retain" && !value.reason.trim()) {
      setMessage("A reason is required for revoke or remediate decisions.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await api.decideSecurityAccessReviewItem(
        {
          item_id: itemId,
          decision: value.decision,
          reason: value.reason.trim() || null,
          expected_version: Number(item.row_version),
        },
        csrfToken(),
        `web-access-review-decision-${itemId}-${crypto.randomUUID()}`,
      );
      await loadItems(selectedCampaign);
      setMessage("Immutable review decision recorded.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (!permissions.has("security.access_review.read")) {
    return (
      <p className="p-9 text-center text-sm text-muted-foreground">
        You do not have permission to view access reviews.
      </p>
    );
  }

  return (
    <div className="grid gap-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <p className="text-sm text-muted-foreground">
          Campaigns certify persisted role assignments without directly deleting authority.
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={loading || busy} onClick={() => void refresh()}>
            Refresh
          </Button>
          {permissions.has("security.access_review.create") ? (
            <Button type="button" disabled={busy} onClick={() => setShowCreate((current) => !current)}>
              {showCreate ? "Close" : "Create campaign"}
            </Button>
          ) : null}
        </div>
      </div>
      {message ? (
        <Alert className="m-5" role="status">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      {showCreate ? (
        <form className="grid gap-4 border-b border-border bg-muted/40 p-5 md:grid-cols-2" onSubmit={createCampaign}>
          <Label className="grid gap-2 text-sm">
            Campaign name
            <Input value={name} onChange={(event) => setName(event.target.value)} required maxLength={160} />
          </Label>
          <Label className="grid gap-2 text-sm">
            Description
            <Input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} />
          </Label>
          <Label className="grid gap-2 text-sm">
            Scope
            <select value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
              <option value="">Entire tenant</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </Label>
          <Label className="grid gap-2 text-sm">
            Reviewer
            <select value={reviewerId} onChange={(event) => setReviewerId(event.target.value)} required>
              <option value="">Select an independent reviewer</option>
              {users.map((user) => (
                <option key={String(user.id)} value={String(user.id)}>
                  {String(user.display_name)} · {String(user.email)}
                </option>
              ))}
            </select>
          </Label>
          <Label className="grid gap-2 text-sm">
            Starts
            <Input
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
              required
            />
          </Label>
          <Label className="grid gap-2 text-sm">
            Ends
            <Input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} required />
          </Label>
          <div className="md:col-span-2">
            <Button type="submit" disabled={busy || !name.trim() || !reviewerId}>
              Save draft
            </Button>
          </div>
        </form>
      ) : null}
      {loading ? <p className="p-9 text-center text-sm text-muted-foreground">Loading access reviews…</p> : null}
      {!loading && campaigns.length === 0 ? (
        <p className="p-9 text-center text-sm text-muted-foreground">No access review campaigns exist.</p>
      ) : null}
      {campaigns.length ? (
        <div className="grid min-w-0 lg:grid-cols-[minmax(320px,0.7fr)_minmax(500px,1.3fr)]">
          <div className="border-r border-border">
            {campaigns.map((campaign) => (
              <button
                type="button"
                key={String(campaign.campaign_id)}
                className={`grid w-full gap-1 border-b border-border p-4 text-left ${selectedCampaign === campaign.campaign_id ? "bg-[var(--nx-selection-background)]" : "hover:bg-muted/50"}`}
                onClick={() => setSelectedCampaign(String(campaign.campaign_id))}
              >
                <strong>{String(campaign.name)}</strong>
                <span className="text-xs text-muted-foreground">
                  {String(campaign.lifecycle_state)} · {String(campaign.decision_count)} / {String(campaign.item_count)}{" "}
                  decided
                </span>
              </button>
            ))}
          </div>
          <div className="min-w-0">
            {selected ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
                <div>
                  <strong>{String(selected.name)}</strong>
                  <p className="text-xs text-muted-foreground">
                    State: {String(selected.lifecycle_state)} · Version {String(selected.row_version)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selected.lifecycle_state === "draft" && permissions.has("security.access_review.submit") ? (
                    <Button type="button" disabled={busy} onClick={() => void transition("submit")}>
                      Submit
                    </Button>
                  ) : null}
                  {selected.lifecycle_state === "submitted" && permissions.has("security.access_review.approve") ? (
                    <>
                      <Button type="button" disabled={busy} onClick={() => void transition("approve")}>
                        Approve
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={busy}
                        onClick={() => void transition("reject")}
                      >
                        Reject
                      </Button>
                    </>
                  ) : null}
                  {selected.lifecycle_state === "approved" && permissions.has("security.access_review.activate") ? (
                    <Button type="button" disabled={busy} onClick={() => void transition("activate")}>
                      Activate and snapshot
                    </Button>
                  ) : null}
                  {selected.lifecycle_state === "active" && permissions.has("security.access_review.close") ? (
                    <Button type="button" disabled={busy} onClick={() => void transition("close")}>
                      Close campaign
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
            {selected?.lifecycle_state === "active" || selected?.lifecycle_state === "closed" ? (
              items.length ? (
                items.map((item) => {
                  const snapshot = (item.snapshot ?? {}) as Row;
                  const itemId = String(item.item_id);
                  const current = decisions[itemId] ?? { decision: "retain" as const, reason: "" };
                  return (
                    <article className="grid gap-3 border-b border-border p-4" key={itemId}>
                      <div className="flex flex-wrap justify-between gap-3">
                        <div>
                          <strong>{String(snapshot.display_name ?? snapshot.email ?? item.subject_user_id)}</strong>
                          <p className="text-xs text-muted-foreground">
                            {String(snapshot.role_name ?? "Account access")} · {String(snapshot.role_code ?? "No role")}
                          </p>
                        </div>
                        {item.decision ? (
                          <span className="rounded-full bg-muted px-2 py-1 text-xs font-semibold">
                            {String(item.decision)}
                          </span>
                        ) : null}
                      </div>
                      {!item.decision &&
                      selected.lifecycle_state === "active" &&
                      permissions.has("security.access_review.decide") ? (
                        <div className="grid gap-2 sm:grid-cols-[160px_minmax(180px,1fr)_auto]">
                          <select
                            aria-label={`Decision for ${itemId}`}
                            value={current.decision}
                            onChange={(event) =>
                              setDecisions((state) => ({
                                ...state,
                                [itemId]: { ...current, decision: event.target.value as typeof current.decision },
                              }))
                            }
                          >
                            <option value="retain">Retain</option>
                            <option value="revoke">Revoke</option>
                            <option value="remediate">Remediate</option>
                          </select>
                          <Input
                            aria-label={`Reason for ${itemId}`}
                            placeholder="Reason when revoking or remediating"
                            value={current.reason}
                            onChange={(event) =>
                              setDecisions((state) => ({
                                ...state,
                                [itemId]: { ...current, reason: event.target.value },
                              }))
                            }
                          />
                          <Button type="button" disabled={busy} onClick={() => void decide(item)}>
                            Record decision
                          </Button>
                        </div>
                      ) : null}
                      {item.remediation_request_id ? (
                        <p className="text-xs text-muted-foreground">
                          Governed remediation request: {String(item.remediation_request_id)}
                        </p>
                      ) : null}
                    </article>
                  );
                })
              ) : (
                <p className="p-9 text-center text-sm text-muted-foreground">
                  This campaign has no captured role assignments.
                </p>
              )
            ) : (
              <p className="p-9 text-center text-sm text-muted-foreground">
                Approve and activate the campaign to capture its immutable entitlement snapshot.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
