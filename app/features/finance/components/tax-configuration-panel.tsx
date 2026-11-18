"use client";

import { useRef, useState, type FormEvent } from "react";
import { ChevronDown, Plus, Settings2, X } from "lucide-react";
import { taxConfigurationInputSchema, type TaxConfiguration, type TaxConfigurationInput } from "@nexora/contracts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LabeledField } from "@/shared/ui/labeled-field";
import { workSelectClass } from "@/shared/ui/work-table";
import { useSession } from "@/lib/session/session-provider";

const pakistanRegions = [
  ["Azad Jammu & Kashmir", "AJK"],
  ["Balochistan", "BA"],
  ["Gilgit Baltistan", "GB"],
  ["Islamabad Capital Territory", "ICT"],
  ["Khyber Pakhtunkhwa", "KP"],
  ["Punjab", "PB"],
  ["Sindh", "SD"],
] as const;
const tableClass =
  "w-full border-collapse text-left text-sm [&_th]:bg-muted [&_th]:px-3 [&_th]:py-3 [&_th]:text-xs [&_th]:font-semibold [&_td]:p-3 [&_tr]:border-b [&_tr]:border-border";

export function TaxConfigurationPanel({
  configuration,
  canManage,
  onSaved,
}: {
  configuration: TaxConfiguration;
  canManage: boolean;
  onSaved: (value: TaxConfiguration) => void;
}) {
  const { api, csrfToken } = useSession();
  const initial = (): TaxConfigurationInput => ({
    company_id: configuration.company_id,
    expected_version: configuration.version,
    year_end_date: configuration.year_end_date,
    display: configuration.display,
    regions: configuration.regions,
    reason: "",
  });
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const retry = useRef({ fingerprint: "", key: "" });
  const dirty = JSON.stringify(form) !== JSON.stringify(initial());
  async function save(event: FormEvent) {
    event.preventDefault();
    const parsed = taxConfigurationInputSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => `${issue.path.join(" ")}: ${issue.message}`).join(" "));
      return;
    }
    const fingerprint = JSON.stringify(parsed.data);
    if (retry.current.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      onSaved(await api.saveTaxConfiguration(parsed.data, csrfToken(), retry.current.key));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Tax settings could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="min-w-0 rounded-xl border border-border bg-card" open>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-4 font-semibold focus-visible:outline-2 focus-visible:outline-ring">
        <Settings2 className="size-4 text-primary" /> Tax display settings and regions
        <ChevronDown className="ml-auto size-4" />
      </summary>
      <form onSubmit={save} className="border-t border-border">
        <fieldset disabled={!canManage || busy} className="m-0 grid min-w-0 gap-5 border-0 p-4 sm:p-5">
          <legend className="sr-only">Company tax configuration</legend>
          <div className="flex flex-wrap items-start gap-4">
            <LabeledField label="Tax reporting year end" className="grid gap-1.5 text-sm">
              <Input
                type="date"
                value={form.year_end_date ?? ""}
                onChange={(event) => setForm({ ...form, year_end_date: event.target.value || null })}
              />
            </LabeledField>
            <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
              These settings apply to this company across the ERP. Supplier and customer switches control available tax
              choices on new documents; they do not change saved tax evidence. Reporting year end does not close fiscal
              periods.
            </p>
          </div>
          <section className="min-w-0" aria-label="Tax display settings">
            <h2 className="mb-3 text-sm font-semibold">Tax Display Settings</h2>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className={`${tableClass} min-w-[540px]`}>
                <thead>
                  <tr>
                    <th scope="col">Description</th>
                    <th scope="col">Label</th>
                    <th scope="col">Supplier</th>
                    <th scope="col">Customer</th>
                  </tr>
                </thead>
                <tbody>
                  {form.display.map((row, index) => (
                    <tr key={row.tax_type}>
                      <th scope="row" className="font-medium">
                        {row.tax_type === "WHT" ? "WHT (Withholding Income Tax)" : row.tax_type}
                      </th>
                      <td>
                        <Input
                          aria-label={`${row.tax_type} display label`}
                          value={row.label}
                          required
                          maxLength={60}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              display: form.display.map((item, i) =>
                                i === index ? { ...item, label: event.target.value } : item,
                              ),
                            })
                          }
                        />
                      </td>
                      {(["supplier", "customer"] as const).map((party) => (
                        <td key={party}>
                          <Checkbox
                            aria-label={`${row.tax_type} ${party}`}
                            checked={row[party]}
                            onCheckedChange={(checked) =>
                              setForm({
                                ...form,
                                display: form.display.map((item, i) =>
                                  i === index ? { ...item, [party]: checked } : item,
                                ),
                              })
                            }
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section aria-label="Tax regions" className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Tax Regions</h2>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={form.regions.length >= 100}
                onClick={() =>
                  setForm({ ...form, regions: [...form.regions, { name: "", short_code: "", status: "active" }] })
                }
              >
                <Plus /> Add region
              </Button>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Select these regions when configuring GST, ADT, FED or other rates. Saved region identities are retained
              for history.
            </p>
            {form.regions.length ? (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className={`${tableClass} min-w-[640px]`}>
                  <thead>
                    <tr>
                      {["Record code", "Region name", "Region code", "Status", "Actions"].map((label) => (
                        <th key={label} scope="col">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {form.regions.map((region, index) => (
                      <tr key={region.code ?? `new-${index}`}>
                        <td className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                          {region.code ?? "Assigned on save"}
                        </td>
                        <td>
                          <Input
                            aria-label={`Region ${index + 1} name`}
                            required
                            maxLength={100}
                            value={region.name}
                            onChange={(event) =>
                              setForm({
                                ...form,
                                regions: form.regions.map((item, i) =>
                                  i === index ? { ...item, name: event.target.value } : item,
                                ),
                              })
                            }
                          />
                        </td>
                        <td>
                          <Input
                            aria-label={`Region ${index + 1} code`}
                            required
                            maxLength={10}
                            readOnly={!!region.code}
                            value={region.short_code}
                            onChange={(event) =>
                              setForm({
                                ...form,
                                regions: form.regions.map((item, i) =>
                                  i === index ? { ...item, short_code: event.target.value.toUpperCase() } : item,
                                ),
                              })
                            }
                          />
                        </td>
                        <td>
                          <select
                            aria-label={`Region ${index + 1} status`}
                            className={workSelectClass}
                            value={region.status}
                            onChange={(event) =>
                              setForm({
                                ...form,
                                regions: form.regions.map((item, i) =>
                                  i === index
                                    ? { ...item, status: event.target.value === "active" ? "active" : "inactive" }
                                    : item,
                                ),
                              })
                            }
                          >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        </td>
                        <td>
                          {!region.code && (
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              aria-label={`Remove new region ${index + 1}`}
                              onClick={() => setForm({ ...form, regions: form.regions.filter((_, i) => i !== index) })}
                            >
                              <X />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                <p>No company tax regions configured.</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setForm({
                      ...form,
                      regions: pakistanRegions.map(([name, short_code]) => ({ name, short_code, status: "active" })),
                    })
                  }
                >
                  Add Pakistan regions
                </Button>
              </div>
            )}
          </section>
          <LabeledField label="Settings change reason" className="grid gap-1.5 text-sm">
            <Textarea
              required
              minLength={3}
              maxLength={500}
              rows={2}
              value={form.reason}
              onChange={(event) => setForm({ ...form, reason: event.target.value })}
            />
          </LabeledField>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
            <span className="mr-auto text-xs text-muted-foreground">
              {canManage ? `Settings revision ${configuration.version}` : "Read-only company configuration"}
            </span>
            <Button
              type="button"
              variant="outline"
              disabled={!dirty}
              onClick={() => {
                setForm(initial());
                setError("");
              }}
            >
              Cancel changes
            </Button>
            <Button type="submit" disabled={!dirty || form.reason.trim().length < 3}>
              {busy ? "Saving…" : "Save tax settings"}
            </Button>
          </div>
        </fieldset>
      </form>
    </details>
  );
}
