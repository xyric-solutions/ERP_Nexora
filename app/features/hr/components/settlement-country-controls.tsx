"use client";
import {
  hrSettlementCountryScopeSchema,
  type HrSettlementCountryScope,
  type HrSettlementCountryEvidence,
} from "@nexora/contracts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, selectClass } from "./hr-workspace-controls";

type Options = {
  legal_countries: Array<{ code: string; name: string }>;
  legal_jurisdictions: Array<{
    id: string;
    name: string;
    country_code: string;
    parent_id: string | null;
    level: string;
  }>;
};
export function settlementCountryTerms(data: FormData): { legal_scope?: HrSettlementCountryScope } {
  const country = String(data.get("legal_country") ?? "");
  return country
    ? {
        legal_scope: hrSettlementCountryScopeSchema.parse({
          country_code: country,
          jurisdiction_id: String(data.get("legal_jurisdiction") ?? "") || null,
          basis: String(data.get("legal_basis") ?? ""),
          authority_reference: String(data.get("legal_authority") ?? ""),
        }),
      }
    : {};
}
export function SettlementCountryFields({
  country,
  onCountry,
  options,
  busy,
  loading = false,
  error = "",
}: {
  country: string;
  onCountry: (value: string) => void;
  options: Options;
  busy: boolean;
  loading?: boolean;
  error?: string;
}) {
  return (
    <fieldset className="min-w-0 space-y-3 rounded-lg border border-border p-3">
      <legend className="px-1 text-sm font-semibold">Country applicability</legend>
      <p className="text-sm text-muted-foreground">
        Country and regional rules use the approved employer or work-location profile at the exit date. A matching
        regional rule takes priority over the national rule, followed by the company default.
      </p>
      {country && loading && (
        <p role="status" className="text-xs text-muted-foreground">
          Loading country jurisdictions…
        </p>
      )}
      {country && error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <Field title="Rule country">
          <select
            name="legal_country"
            className={selectClass}
            value={country}
            disabled={busy}
            onChange={(e) => onCountry(e.target.value)}
          >
            <option value="">Company default</option>
            {options.legal_countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
        </Field>
        {country && (
          <>
            <Field title="Jurisdiction basis">
              <select
                key={country + "basis"}
                name="legal_basis"
                className={selectClass}
                defaultValue=""
                required
                disabled={busy}
              >
                <option value="">Choose approved profile basis</option>
                <option value="legal_employer">Legal employer</option>
                <option value="work_location">Employee work location</option>
              </select>
            </Field>
            <Field title="Country or regional coverage">
              <select
                key={country + "jurisdiction"}
                name="legal_jurisdiction"
                className={selectClass}
                defaultValue=""
                disabled={busy || loading}
              >
                <option value="">Whole country</option>
                {options.legal_jurisdictions
                  .filter((j) => j.country_code === country)
                  .map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.name} · {j.level}
                    </option>
                  ))}
              </select>
            </Field>
          </>
        )}
      </div>
      {country && (
        <Field title="Country rule authority reference">
          <Textarea
            key={country + "reference"}
            name="legal_authority"
            required
            minLength={10}
            maxLength={1000}
            disabled={busy}
            placeholder="Reviewed law/document reference and company interpretation"
          />
        </Field>
      )}
      <p className="text-xs text-muted-foreground">
        Rates, service limits, dates and evidence require independent policy approval. Maintain approved legal and
        work-location profiles in Payroll localization setup.
      </p>
    </fieldset>
  );
}
export function SettlementCountryRule({ scope, options }: { scope?: HrSettlementCountryScope; options: Options }) {
  return scope ? (
    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
      <p className="font-medium">
        {options.legal_countries.find((c) => c.code === scope.country_code)?.name ?? scope.country_code} ·{" "}
        {scope.jurisdiction_id
          ? (options.legal_jurisdictions.find((j) => j.id === scope.jurisdiction_id)?.name ?? scope.jurisdiction_id)
          : "Whole country"}{" "}
        · {scope.basis === "legal_employer" ? "Legal employer" : "Work location"}
      </p>
      <p className="whitespace-pre-wrap break-words">{scope.authority_reference}</p>
    </div>
  ) : (
    <p className="mt-2 text-xs text-muted-foreground">
      Company default; matching country and regional policies take priority.
    </p>
  );
}
export function SettlementCountryEvidence({
  evidence,
  onRule,
  disabled,
}: {
  evidence: HrSettlementCountryEvidence;
  onRule?: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <section
      aria-label="Country applicability evidence"
      className="min-w-0 space-y-2 rounded-lg border border-border bg-muted/30 p-3 text-sm"
    >
      <h4 className="font-semibold">Country applicability</h4>
      <p className="text-xs text-muted-foreground">Captured for exit date {evidence.as_of}</p>
      <p>
        {evidence.country_name ?? "Country profile needs review"}
        {evidence.country_code ? " (" + evidence.country_code + ")" : ""} ·{" "}
        {evidence.basis === "legal_employer" ? "Legal employer" : "Employee work location"}
      </p>
      <p className="break-words">
        Jurisdiction:{" "}
        {evidence.jurisdictions
          .map((j) => j.name)
          .reverse()
          .join(" / ") || "Profile unavailable"}
      </p>
      <p className="break-words">Applicable rule: {evidence.matched_rule_name ?? "No matching rule"}</p>
      {onRule && evidence.matched_rule_id && evidence.matched_rule_id !== evidence.selected_rule_id && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => onRule(evidence.matched_rule_id!)}
        >
          Use applicable rule
        </Button>
      )}
      {evidence.authority_reference && (
        <p className="whitespace-pre-wrap break-words">Authority: {evidence.authority_reference}</p>
      )}
      {evidence.profile_id && (
        <p className="break-all text-xs text-muted-foreground">Approved profile {evidence.profile_id}</p>
      )}
    </section>
  );
}
