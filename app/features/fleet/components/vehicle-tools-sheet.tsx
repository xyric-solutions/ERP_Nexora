"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FleetTool, FleetToolInput, FleetVehicle } from "@nexora/contracts";
import { fleetToolInputSchema } from "@nexora/contracts";
import { Plus } from "lucide-react";
import { useSession } from "@/lib/session/session-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LabeledField } from "@/shared/ui/labeled-field";
import { useActionFeedback } from "@/shared/ui/action-feedback";
import { fleetError, today, toolConditionLabels } from "../model/fleet";

type Draft = { name: string; quantity: string; notes: string; replaces: FleetTool | null };
const emptyDraft: Draft = { name: "", quantity: "1", notes: "", replaces: null };

/**
 * Tools kept in a vehicle (fire extinguisher, wrench…). Staff search the list, add new tools,
 * mark an item damaged or destroyed, and record its replacement against it.
 */
export function VehicleToolsSheet({
  open,
  onOpenChange,
  company,
  vehicle,
  canWrite,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: string;
  vehicle: FleetVehicle;
  canWrite: boolean;
  /** Called when the sheet closes after tools changed, so the vehicle's tool count refreshes. */
  onChanged: () => void;
}) {
  const { api, csrfToken } = useSession(),
    notify = useActionFeedback(),
    [tools, setTools] = useState<FleetTool[]>([]),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [draft, setDraft] = useState<Draft | null>(null);
  const changed = useRef(false),
    keys = useRef(new Map<string, string>());
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setTools((await api.listFleetVehicleTools(vehicle.id, company)).items);
    } catch (e) {
      setError(fleetError(e));
    } finally {
      setLoading(false);
    }
  }, [api, company, vehicle.id]);
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [open, load]);
  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? tools.filter((tool) => `${tool.name} ${tool.notes}`.toLowerCase().includes(term)) : tools;
  }, [search, tools]);
  /** One idempotency key per distinct request, so a retried click cannot record a tool twice. */
  function keyFor(body: unknown) {
    const text = JSON.stringify(body);
    if (!keys.current.has(text)) keys.current.set(text, `fleet-tool-${crypto.randomUUID()}`);
    return keys.current.get(text)!;
  }
  async function run(work: () => Promise<{ record: FleetTool }>, message: (tool: FleetTool) => string) {
    setBusy(true);
    setError("");
    try {
      const result = await work();
      changed.current = true;
      notify(message(result.record));
      await load();
      return true;
    } catch (e) {
      setError(fleetError(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function addTool() {
    if (!draft) return;
    const input: FleetToolInput = {
      company_id: company,
      name: draft.name,
      quantity: Number(draft.quantity),
      notes: draft.notes,
      recorded_on: today(),
      replaces_tool_id: draft.replaces?.id ?? null,
    };
    const parsed = fleetToolInputSchema.safeParse(input);
    if (!parsed.success) return setError(parsed.error.issues.map((issue) => issue.message).join(" "));
    const ok = await run(
      () => api.saveFleetVehicleTool(vehicle.id, null, parsed.data, csrfToken(), keyFor(parsed.data)),
      (tool) => (draft.replaces ? `Replacement ${tool.name} recorded.` : `${tool.name} added.`),
    );
    if (ok) setDraft(null);
  }
  function setCondition(tool: FleetTool, condition: FleetTool["condition"]) {
    const input: FleetToolInput = {
      company_id: company,
      name: tool.name,
      quantity: tool.quantity,
      condition,
      replaces_tool_id: tool.replaces_tool_id,
      recorded_on: today(),
      notes: tool.notes,
      expected_version: tool.version,
    };
    void run(
      () => api.saveFleetVehicleTool(vehicle.id, tool.id, input, csrfToken(), keyFor({ id: tool.id, input })),
      (saved) => `${saved.name} marked ${toolConditionLabels[saved.condition].toLowerCase()}.`,
    );
  }
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next && changed.current) {
          changed.current = false;
          onChanged();
        }
      }}
    >
      <SheetContent
        side="right"
        overlayClassName="z-[1300]!"
        className="z-[1301]! w-full! gap-0 overflow-y-auto border-border p-0 sm:max-w-[34rem]!"
      >
        <SheetHeader className="border-b border-border p-5">
          <SheetTitle>Tools · {vehicle.registration_no}</SheetTitle>
          <SheetDescription>Equipment kept in this vehicle. Replace damaged or destroyed items here.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 p-5">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-wrap items-end gap-2">
            <LabeledField label="Search tools" className="min-w-0 flex-1">
              <Input
                value={search}
                placeholder="Fire extinguisher, wrench…"
                onChange={(e) => setSearch(e.target.value)}
              />
            </LabeledField>
            {canWrite && !draft ? (
              <Button type="button" onClick={() => setDraft(emptyDraft)}>
                <Plus aria-hidden="true" />
                Add New Tool
              </Button>
            ) : null}
          </div>
          {draft ? (
            <section className="space-y-3 rounded-lg border border-border bg-muted/40 p-4" aria-label="New tool">
              <h3 className="m-0 text-sm font-semibold">
                {draft.replaces ? `Replace ${draft.replaces.name}` : "Add New Tool"}
              </h3>
              <div className="grid gap-3 sm:grid-cols-[1fr_6rem]">
                <LabeledField label="Tool name *">
                  <Input
                    maxLength={120}
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </LabeledField>
                <LabeledField label="Quantity *">
                  <Input
                    inputMode="numeric"
                    value={draft.quantity}
                    onChange={(e) => setDraft({ ...draft, quantity: e.target.value.replace(/\D/g, "") })}
                  />
                </LabeledField>
              </div>
              <LabeledField label="Notes">
                <Input
                  maxLength={1000}
                  value={draft.notes}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                />
              </LabeledField>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" disabled={busy} onClick={() => setDraft(null)}>
                  Cancel
                </Button>
                <Button type="button" disabled={busy} onClick={() => void addTool()}>
                  {busy ? "Saving…" : draft.replaces ? "Record replacement" : "Add tool"}
                </Button>
              </div>
            </section>
          ) : null}
          {loading ? (
            <p role="status" className="text-sm text-muted-foreground">
              Loading tools…
            </p>
          ) : !shown.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {search ? "No tools match this search." : "No tools recorded for this vehicle yet."}
            </p>
          ) : (
            <ul className="m-0 list-none divide-y divide-border rounded-lg border border-border p-0" aria-label="Tools">
              {shown.map((tool) => (
                <li key={tool.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="m-0 text-sm font-medium">
                      {tool.name} <span className="text-muted-foreground">× {tool.quantity}</span>
                    </p>
                    <p className="m-0 text-xs text-muted-foreground">
                      Recorded {tool.recorded_on}
                      {tool.replaces_tool_name ? ` · replaces a ${tool.replaces_tool_name.toLowerCase()}` : ""}
                      {tool.replaced_by_tool_id ? " · replaced" : ""}
                      {tool.notes ? ` · ${tool.notes}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={tool.condition === "good" ? "secondary" : "destructive"}>
                      {toolConditionLabels[tool.condition]}
                    </Badge>
                    {canWrite && !tool.replaced_by_tool_id ? (
                      tool.condition === "good" ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => setCondition(tool, "damaged")}
                          >
                            Damaged
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => setCondition(tool, "destroyed")}
                          >
                            Destroyed
                          </Button>
                        </>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy || !!draft}
                          onClick={() =>
                            setDraft({ name: tool.name, quantity: String(tool.quantity), notes: "", replaces: tool })
                          }
                        >
                          Replace
                        </Button>
                      )
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
