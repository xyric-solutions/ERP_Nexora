"use client";

import { useId, type ReactNode } from "react";
import type { SupplierInput, SupplierProfile, SupplierBankAccount } from "@nexora/contracts";
import { Building2, Landmark, MapPin, NotebookPen, ReceiptText, Wallet } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { purchaseSelectClass } from "../model/purchase-workflow";

export const supplierTabs = [
  { id: "overview", label: "Overview", icon: Building2 },
  { id: "contacts", label: "Contacts & Addresses", icon: MapPin },
  { id: "tax", label: "Tax Details", icon: ReceiptText },
  { id: "terms", label: "Payment Terms", icon: Wallet },
  { id: "bank", label: "Bank Accounts", icon: Landmark },
  { id: "notes", label: "Internal Notes", icon: NotebookPen },
] as const;
export type SupplierTab = (typeof supplierTabs)[number]["id"];
export type SupplierFormInput = SupplierInput & { profile: SupplierProfile };

export function supplierErrorTab(field: string): SupplierTab {
  if (field.startsWith("profile.bank_accounts")) return "bank";
  if (/^(tax_id|profile\.(tax_registration|tax_status|withholding_reference))/.test(field)) return "tax";
  if (/^profile\.(payment_method|credit_days|currency|payment_reference)/.test(field)) return "terms";
  if (field === "profile.notes") return "notes";
  if (/^(email|phone|address|profile\.(contact_|designation|mobile|billing_|delivery_))/.test(field)) return "contacts";
  return "overview";
}

function Field({
  label,
  field,
  error,
  children,
}: {
  label: string;
  field: string;
  error?: string;
  children: (id: string, description: string | undefined) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="grid min-w-0 content-start gap-1.5" data-invalid={!!error || undefined}>
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {children(id, error ? `${id}-error` : undefined)}
      {error ? (
        <p id={`${id}-error`} className="m-0 text-xs text-destructive" data-error-for={field}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function TextField({
  label,
  field,
  value,
  onChange,
  error,
  max = 200,
  type = "text",
}: {
  label: string;
  field: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  max?: number;
  type?: "text" | "email" | "url" | "tel";
}) {
  return (
    <Field label={label} field={field} error={error}>
      {(id, description) => (
        <Input
          id={id}
          data-supplier-field={field}
          aria-invalid={!!error}
          aria-describedby={description}
          type={type}
          required={label.endsWith("*")}
          maxLength={max}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
      <header>
        <h3 className="m-0 text-base font-semibold text-foreground">{title}</h3>
        <p className="mb-0 mt-1 text-sm text-muted-foreground">{description}</p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}

type ProfileTextKey =
  | "trading_name"
  | "category"
  | "registration_number"
  | "website"
  | "contact_title"
  | "contact_name"
  | "designation"
  | "mobile"
  | "billing_city"
  | "billing_province"
  | "billing_postal_code"
  | "billing_country"
  | "tax_registration"
  | "withholding_reference"
  | "payment_reference";
type BankTextKey = Exclude<keyof SupplierBankAccount, "is_default" | "id">;

export function SupplierProfileFields({
  input,
  onChange,
  tab,
  onTabChange,
  errors,
  currencies,
}: {
  input: SupplierFormInput;
  onChange: (patch: Partial<SupplierFormInput>) => void;
  tab: SupplierTab;
  onTabChange: (tab: SupplierTab) => void;
  errors: Record<string, string>;
  currencies: { code: string; name: string }[];
}) {
  const profile = input.profile;
  const patch = (value: Partial<SupplierProfile>) => onChange({ profile: { ...profile, ...value } });
  const text = (key: ProfileTextKey, label: string, max = 200, type: "text" | "url" | "tel" = "text") => (
    <TextField
      key={key}
      label={label}
      field={`profile.${key}`}
      value={profile[key]}
      max={max}
      type={type}
      error={errors[`profile.${key}`]}
      onChange={(value) => patch({ [key]: value })}
    />
  );
  const bankChange = (index: number, value: Partial<SupplierBankAccount>) =>
    patch({
      bank_accounts: profile.bank_accounts.map((account, position) =>
        position === index ? { ...account, ...value } : account,
      ),
    });
  const currencyOptions = (current: string) => (
    <>
      <option value="">Not specified</option>
      {current && !currencies.some((item) => item.code === current) ? (
        <option value={current}>{current} (saved)</option>
      ) : null}
      {currencies.map((item) => (
        <option key={item.code} value={item.code}>
          {item.code} · {item.name}
        </option>
      ))}
    </>
  );
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        const next = supplierTabs.find((item) => item.id === value);
        if (next) onTabChange(next.id);
      }}
      className="gap-4"
    >
      <div className="min-w-0 overflow-x-auto pb-1">
        <TabsList aria-label="Supplier details" variant="line" className="h-auto min-h-10 gap-3">
          {supplierTabs.map(({ id, label, icon: Icon }) => (
            <TabsTrigger key={id} value={id} className="min-h-10 px-2">
              <Icon aria-hidden="true" />
              {label}
              {id === "bank" && profile.bank_accounts.length ? (
                <Badge variant="secondary">{profile.bank_accounts.length}</Badge>
              ) : null}
              {Object.keys(errors).some((key) => supplierErrorTab(key) === id) ? (
                <span className="text-destructive" aria-label="Contains errors">
                  !
                </span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <TabsContent value="overview">
        <Section
          title="Supplier identity"
          description="Use the registered legal name for a company, or the full name for an individual."
        >
          <Field label="Supplier type" field="profile.entity_type">
            {(id) => (
              <select
                id={id}
                className={purchaseSelectClass}
                value={profile.entity_type}
                onChange={(event) =>
                  patch({ entity_type: event.target.value === "individual" ? "individual" : "company" })
                }
              >
                <option value="company">Company</option>
                <option value="individual">Individual</option>
              </select>
            )}
          </Field>
          <TextField
            label="Supplier name *"
            field="name"
            value={input.name}
            error={errors.name}
            onChange={(name) => onChange({ name })}
          />
          {text("trading_name", "Trading / display name")}
          {text("category", "Supplier category", 100)}
          {text("registration_number", "Business registration number", 128)}
          {text("website", "Website", 500, "url")}
          <Field label="Status" field="status">
            {(id) => (
              <select
                id={id}
                className={purchaseSelectClass}
                value={input.status}
                onChange={(event) => onChange({ status: event.target.value === "inactive" ? "inactive" : "active" })}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            )}
          </Field>
        </Section>
      </TabsContent>
      <TabsContent value="contacts" className="grid gap-4">
        <Section
          title="Primary contact"
          description="The person your purchasing team should contact for orders and queries."
        >
          {text("contact_title", "Title", 32)}
          {text("contact_name", "Contact full name")}
          {text("designation", "Designation", 100)}
          <TextField
            label="Email"
            field="email"
            type="email"
            max={254}
            value={input.email}
            error={errors.email}
            onChange={(email) => onChange({ email })}
          />
          <TextField
            label="Phone"
            field="phone"
            type="tel"
            max={64}
            value={input.phone}
            error={errors.phone}
            onChange={(phone) => onChange({ phone })}
          />
          {text("mobile", "Mobile", 64, "tel")}
        </Section>
        <Section title="Billing address" description="The supplier's registered or invoicing address.">
          <div className="sm:col-span-2 xl:col-span-3">
            <Field label="Billing street address" field="address" error={errors.address}>
              {(id, description) => (
                <Textarea
                  id={id}
                  data-supplier-field="address"
                  aria-invalid={!!errors.address}
                  aria-describedby={description}
                  rows={2}
                  maxLength={1000}
                  value={input.address}
                  onChange={(event) => onChange({ address: event.target.value })}
                />
              )}
            </Field>
          </div>
          {text("billing_city", "Billing city", 100)}
          {text("billing_province", "Billing province / state", 100)}
          {text("billing_postal_code", "Billing postal code", 32)}
          {text("billing_country", "Billing country", 100)}
        </Section>
        <div className="flex items-center gap-2">
          <Checkbox
            id="supplier-delivery-same"
            checked={profile.delivery_same_as_billing}
            onCheckedChange={(checked) => patch({ delivery_same_as_billing: checked === true })}
          />
          <label htmlFor="supplier-delivery-same" className="text-sm">
            Delivery address is the same as billing
          </label>
        </div>
        {!profile.delivery_same_as_billing ? (
          <Section title="Delivery address" description="An alternate supplier dispatch or delivery location.">
            {(
              [
                ["street", "Delivery street address", 1000],
                ["city", "Delivery city", 100],
                ["province", "Delivery province / state", 100],
                ["postal_code", "Delivery postal code", 32],
                ["country", "Delivery country", 100],
              ] as const
            ).map(([key, label, max]) => (
              <TextField
                key={key}
                label={label}
                field={`profile.delivery_address.${key}`}
                value={profile.delivery_address[key]}
                max={max}
                error={errors[`profile.delivery_address.${key}`]}
                onChange={(value) => patch({ delivery_address: { ...profile.delivery_address, [key]: value } })}
              />
            ))}
          </Section>
        ) : null}
      </TabsContent>
      <TabsContent value="tax">
        <Section
          title="Tax & registration"
          description="Record the supplier's declared tax information for purchasing reference."
        >
          <TextField
            label="NTN / Tax ID"
            field="tax_id"
            max={128}
            value={input.tax_id}
            error={errors.tax_id}
            onChange={(tax_id) => onChange({ tax_id })}
          />
          {text("tax_registration", "Sales tax / VAT registration", 128)}
          <Field label="Tax status" field="profile.tax_status">
            {(id) => (
              <select
                id={id}
                className={purchaseSelectClass}
                value={profile.tax_status}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "registered" || value === "unregistered" || value === "exempt")
                    patch({ tax_status: value });
                }}
              >
                <option value="unregistered">Unregistered</option>
                <option value="registered">Registered</option>
                <option value="exempt">Exempt</option>
              </select>
            )}
          </Field>
          {text("withholding_reference", "Withholding tax / exemption reference", 128)}
        </Section>
      </TabsContent>
      <TabsContent value="terms">
        <Section
          title="Commercial terms"
          description="Agreed supplier terms for reference. Purchase documents retain their own dates and currencies."
        >
          <Field label="Preferred payment method" field="profile.payment_method">
            {(id) => (
              <select
                id={id}
                className={purchaseSelectClass}
                value={profile.payment_method}
                onChange={(event) => {
                  const value = event.target.value;
                  if (
                    value === "unspecified" ||
                    value === "bank_transfer" ||
                    value === "cheque" ||
                    value === "cash" ||
                    value === "other"
                  )
                    patch({ payment_method: value });
                }}
              >
                <option value="unspecified">Not specified</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="cheque">Cheque</option>
                <option value="cash">Cash</option>
                <option value="other">Other</option>
              </select>
            )}
          </Field>
          <Field label="Credit days" field="profile.credit_days" error={errors["profile.credit_days"]}>
            {(id, description) => (
              <Input
                id={id}
                data-supplier-field="profile.credit_days"
                type="number"
                min={0}
                max={365}
                step={1}
                aria-invalid={!!errors["profile.credit_days"]}
                aria-describedby={description}
                value={Number.isNaN(profile.credit_days) ? "" : profile.credit_days}
                onChange={(event) =>
                  patch({ credit_days: event.target.value === "" ? Number.NaN : Number(event.target.value) })
                }
              />
            )}
          </Field>
          <Field label="Preferred currency" field="profile.currency" error={errors["profile.currency"]}>
            {(id, description) => (
              <select
                id={id}
                className={purchaseSelectClass}
                aria-invalid={!!errors["profile.currency"]}
                aria-describedby={description}
                value={profile.currency}
                onChange={(event) => patch({ currency: event.target.value })}
              >
                {currencyOptions(profile.currency)}
              </select>
            )}
          </Field>
          {text("payment_reference", "Supplier payment reference", 128)}
        </Section>
      </TabsContent>
      <TabsContent value="bank" className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="m-0 text-base font-semibold">Supplier bank accounts</h3>
            <p className="mb-0 mt-1 text-sm text-muted-foreground">
              Record up to 10 accounts. These details do not verify an account or initiate payments.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={profile.bank_accounts.length >= 10}
            onClick={() =>
              patch({
                bank_accounts: [
                  ...profile.bank_accounts,
                  {
                    id: crypto.randomUUID(),
                    bank_name: "",
                    branch: "",
                    branch_code: "",
                    country: "",
                    account_title: "",
                    account_number: "",
                    iban: "",
                    swift: "",
                    currency: profile.currency,
                    is_default: !profile.bank_accounts.length,
                  },
                ],
              })
            }
          >
            Add Bank Account
          </Button>
        </div>
        {errors["profile.bank_accounts"] ? (
          <p role="alert" className="m-0 text-sm text-destructive">
            {errors["profile.bank_accounts"]}
          </p>
        ) : null}
        {!profile.bank_accounts.length ? (
          <div className="grid justify-items-center gap-2 rounded-xl border border-dashed border-border bg-muted p-8 text-center">
            <Landmark aria-hidden="true" className="size-6 text-muted-foreground" />
            <p className="m-0 font-medium">No bank accounts added</p>
            <p className="m-0 text-sm text-muted-foreground">
              Add the supplier&apos;s beneficiary details when available.
            </p>
          </div>
        ) : null}
        {profile.bank_accounts.map((account, index) => (
          <section
            key={account.id}
            aria-label={`Bank account ${index + 1}`}
            className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:p-5"
          >
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h4 className="m-0 font-semibold">Account {index + 1}</h4>
                {account.is_default ? <Badge variant="secondary">Default</Badge> : null}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={account.is_default}
                  onClick={() =>
                    patch({
                      bank_accounts: profile.bank_accounts.map((item, position) => ({
                        ...item,
                        is_default: position === index,
                      })),
                    })
                  }
                >
                  Set as default
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  aria-label={`Remove bank account ${index + 1}`}
                  onClick={() => {
                    const remaining = profile.bank_accounts.filter((_, position) => position !== index);
                    if (account.is_default && remaining[0]) remaining[0] = { ...remaining[0], is_default: true };
                    patch({ bank_accounts: remaining });
                  }}
                >
                  Remove
                </Button>
              </div>
            </header>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {(
                [
                  ["bank_name", "Bank name *", 200],
                  ["account_title", "Account title *", 200],
                  ["account_number", "Account number", 64],
                  ["iban", "IBAN", 42],
                  ["swift", "SWIFT / BIC", 11],
                  ["branch", "Branch name / address", 200],
                  ["branch_code", "Branch / routing code", 32],
                  ["country", "Bank country", 100],
                ] satisfies [BankTextKey, string, number][]
              ).map(([key, label, max]) => (
                <TextField
                  key={key}
                  label={label}
                  field={`profile.bank_accounts.${index}.${key}`}
                  value={account[key]}
                  max={max}
                  error={errors[`profile.bank_accounts.${index}.${key}`]}
                  onChange={(value) => bankChange(index, { [key]: value })}
                />
              ))}
              <Field label="Account currency" field={`profile.bank_accounts.${index}.currency`}>
                {(id) => (
                  <select
                    id={id}
                    className={purchaseSelectClass}
                    value={account.currency}
                    onChange={(event) => bankChange(index, { currency: event.target.value })}
                  >
                    {currencyOptions(account.currency)}
                  </select>
                )}
              </Field>
            </div>
            <p className="m-0 text-xs text-muted-foreground">
              Enter an account number or a valid IBAN. Only the default designation is selected here; no bank
              verification is performed.
            </p>
          </section>
        ))}
      </TabsContent>
      <TabsContent value="notes">
        <Section title="Internal notes" description="Purchasing instructions and remarks for your team.">
          <div className="sm:col-span-2 xl:col-span-3">
            <Field label="Notes" field="profile.notes" error={errors["profile.notes"]}>
              {(id, description) => (
                <Textarea
                  id={id}
                  data-supplier-field="profile.notes"
                  rows={7}
                  maxLength={4000}
                  aria-invalid={!!errors["profile.notes"]}
                  aria-describedby={description}
                  value={profile.notes}
                  onChange={(event) => patch({ notes: event.target.value })}
                />
              )}
            </Field>
            <p className="mb-0 mt-1 text-xs text-muted-foreground">{profile.notes.length} / 4,000 characters</p>
          </div>
        </Section>
      </TabsContent>
    </Tabs>
  );
}
