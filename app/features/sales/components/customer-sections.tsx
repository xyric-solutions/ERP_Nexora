"use client";

/**
 * Customer form sections shared by the New Customer page and the customer
 * side panel. Only Overview is mandatory; every other section is optional
 * and can be left empty when saving.
 */

import { useState, type ReactNode } from "react";
import { Eye, EyeOff, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { countryName, CURRENCIES } from "@/shared/constants/countries";
import { maskAccount, postalHint } from "@/shared/model/international-validation";
import { cn } from "cn";
import { AttachmentList, CountrySelect, InternationalPhoneField } from "./customer-fields";
import { ActivityList, Field, ReadField, selectClass, SubHead } from "./sales-ui";
import type { SalesNav } from "./sales-nav";
import {
  ADVANCE_OPTIONS,
  BANK_ACCOUNT_TYPES,
  CREDIT_STATUSES,
  CUSTOM_TERMS,
  CUSTOMER_TERMS,
  CUSTOMER_TYPES,
  IDENTIFICATION_TYPES,
  PRICE_LISTS,
  RECEIPT_METHODS,
  SALES_TERM_DAYS,
  SALESPEOPLE,
  TAX_REGISTRATIONS,
  TAX_TREATMENTS,
} from "../model/sales-constants";
import {
  emptyAddress,
  newBankAccount,
  newIdentification,
  sectionOfError,
  validateCustomer,
  type CustomerErrors,
  type CustomerSection,
} from "../model/customer-model";
import { moneyWhole } from "../model/sales-format";
import { commitSales, useSalesState } from "../model/sales-store";
import { exposure, findCustomer, invoicedBalance, saveCustomer } from "../model/sales-workflow";
import type { CustomerBankAccount, PostalAddress, SalesCustomer } from "../model/sales-types";

/* ----------------------------------------------------------------- editor */

export function useCustomerEditor(initial: SalesCustomer, nav: SalesNav, onSaved: (code: string) => void) {
  const [draft, setDraft] = useState<SalesCustomer>(() => structuredClone(initial));
  const [errors, setErrors] = useState<CustomerErrors>({});
  const [section, setSection] = useState<CustomerSection>("overview");
  const [dirty, setDirty] = useState(false);

  const update = (patch: Partial<SalesCustomer>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
    const touched = new Set(Object.keys(patch));
    setErrors((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => !touched.has(key.split(".")[0]))),
    );
  };

  /** Saves when valid and returns true; otherwise shows the errors, opens the first section with one, and returns false. */
  const save = (): boolean => {
    const found = validateCustomer(draft);
    if (Object.keys(found).length) {
      setErrors(found);
      const first = sectionOfError(Object.keys(found)[0]);
      if (first) setSection(first);
      return false;
    }
    try {
      const code = commitSales((sales) => saveCustomer(sales, draft, nav.actor));
      nav.notify(initial.id ? `${code} updated.` : `Customer ${code} saved.`);
      setDirty(false);
      onSaved(code);
      return true;
    } catch (error) {
      nav.notify(error instanceof Error ? error.message : "The customer could not be saved.");
      return false;
    }
  };

  const errorSections = [...new Set(Object.keys(errors).map(sectionOfError).filter(Boolean))] as CustomerSection[];
  return { draft, errors, section, setSection, update, save, errorSections, dirty };
}

/* --------------------------------------------------------------- helpers */

function OptionalNote({ children }: { children?: ReactNode }) {
  return (
    <p className="col-span-full m-0 rounded bg-muted px-3 py-2 text-xs text-muted-foreground">
      <strong className="font-semibold text-foreground">Optional section.</strong>{" "}
      {children ?? "You can save the customer without completing it."}
    </p>
  );
}

function Select({
  value,
  options,
  onChange,
  invalid,
  placeholder,
}: {
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  invalid?: boolean;
  placeholder?: string;
}) {
  return (
    <select
      className={selectClass}
      value={value}
      aria-invalid={invalid}
      onChange={(event) => onChange(event.target.value)}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((option) => (
        <option key={option}>{option}</option>
      ))}
    </select>
  );
}

function CheckField({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex min-h-10 items-center gap-2 self-end text-sm">
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      <label htmlFor={id}>{label}</label>
    </div>
  );
}

const numberValue = (value: string) => (value === "" ? 0 : Number(value));

function AddressFields({
  prefix,
  address,
  errors,
  onChange,
}: {
  prefix: "billing" | "shipping";
  address: PostalAddress;
  errors: CustomerErrors;
  onChange: (next: PostalAddress) => void;
}) {
  const set = (patch: Partial<PostalAddress>) => onChange({ ...address, ...patch });
  // Container queries keep the same layout readable on the full page and in the narrower side panel.
  return (
    <div className="@container col-span-full">
      <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 @md:grid-cols-2 @4xl:grid-cols-4">
        <Field label="Address line 1" className="@md:col-span-2">
          <Input
            value={address.line1}
            autoComplete={`${prefix} address-line1`}
            placeholder="Building, street"
            onChange={(event) => set({ line1: event.target.value })}
          />
        </Field>
        <Field label="Address line 2" className="@md:col-span-2">
          <Input
            value={address.line2}
            autoComplete={`${prefix} address-line2`}
            placeholder="Area, suite, floor (optional)"
            onChange={(event) => set({ line2: event.target.value })}
          />
        </Field>
        <Field label="City">
          <Input
            value={address.city}
            autoComplete={`${prefix} address-level2`}
            onChange={(event) => set({ city: event.target.value })}
          />
        </Field>
        <Field label="State / province / region">
          <Input
            value={address.region}
            autoComplete={`${prefix} address-level1`}
            onChange={(event) => set({ region: event.target.value })}
          />
        </Field>
        <Field label="Postal / ZIP code" error={errors[`${prefix}.postal`]} hint={postalHint(address.country)}>
          <Input
            value={address.postal}
            autoComplete={`${prefix} postal-code`}
            aria-invalid={Boolean(errors[`${prefix}.postal`])}
            onChange={(event) => set({ postal: event.target.value })}
          />
        </Field>
        <CountrySelect label="Country" value={address.country} onChange={(country) => set({ country })} />
      </div>
    </div>
  );
}

function BankAccountCard({
  bank,
  index,
  errors,
  onChange,
  onRemove,
}: {
  bank: CustomerBankAccount;
  index: number;
  errors: CustomerErrors;
  onChange: (next: CustomerBankAccount) => void;
  onRemove: () => void;
}) {
  const hasError = Object.keys(errors).some((key) => key.startsWith(`banks.${index}.`));
  const [open, setOpen] = useState(!bank.bankName);
  const [reveal, setReveal] = useState(false);
  const expanded = open || hasError;
  const err = (field: keyof CustomerBankAccount) => errors[`banks.${index}.${field}`];
  const set = (patch: Partial<CustomerBankAccount>) => onChange({ ...bank, ...patch });
  const identifier = bank.iban || bank.accountNumber;
  const text = (
    field: keyof CustomerBankAccount,
    label: string,
    options: { required?: boolean; placeholder?: string; wide?: boolean; mono?: boolean } = {},
  ) => (
    <Field
      label={label}
      required={options.required}
      error={err(field)}
      className={options.wide ? "sm:col-span-2" : undefined}
    >
      <Input
        value={String(bank[field])}
        placeholder={options.placeholder}
        autoComplete="off"
        spellCheck={false}
        className={options.mono ? "font-mono" : undefined}
        aria-invalid={Boolean(err(field))}
        onChange={(event) => set({ [field]: event.target.value } as Partial<CustomerBankAccount>)}
      />
    </Field>
  );

  return (
    <article
      className={cn("rounded border bg-card", hasError ? "border-destructive" : "border-border")}
      aria-label={`Bank account ${index + 1}`}
    >
      <header className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <div className="grid min-w-0 flex-1 gap-0.5">
          <strong className="truncate text-sm">{bank.bankName || "New bank account"}</strong>
          <span className="truncate text-xs text-muted-foreground">
            {identifier ? (
              <span className="font-mono">{reveal ? identifier : maskAccount(identifier)}</span>
            ) : (
              "No account number yet"
            )}
            {` · ${bank.currency} · ${bank.accountType}${bank.country ? ` · ${countryName(bank.country)}` : ""}`}
          </span>
        </div>
        {identifier ? (
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={reveal ? "Hide account number" : "Show account number"}
            aria-pressed={reveal}
            onClick={() => setReveal((value) => !value)}
          >
            {reveal ? <EyeOff /> : <Eye />}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-expanded={expanded}
          onClick={() => setOpen((value) => !value)}
          disabled={hasError}
        >
          {expanded ? "Hide details" : "Edit details"}
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={`Remove bank account ${index + 1}`}
          onClick={onRemove}
        >
          <X />
        </Button>
      </header>
      {expanded ? (
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 border-t border-border p-3 sm:grid-cols-2">
          {text("bankName", "Bank name", { required: true, placeholder: "e.g. Meezan Bank" })}
          {text("holder", "Account holder name")}
          {text("accountNumber", "Account number", { mono: true })}
          {text("iban", "IBAN", { mono: true, placeholder: "PK36 SCBL 0000 0011 2345 6702" })}
          {text("swift", "SWIFT / BIC code", { mono: true, placeholder: "MEZNPKKA" })}
          {text("branchName", "Branch name")}
          {text("branchCode", "Branch code")}
          <CountrySelect label="Bank country" value={bank.country} onChange={(country) => set({ country })} />
          <Field label="Account currency">
            <select
              className={selectClass}
              value={bank.currency}
              onChange={(event) => set({ currency: event.target.value })}
            >
              {CURRENCIES.map(([code, name]) => (
                <option key={code} value={code}>
                  {code} · {name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Account type">
            <Select
              value={bank.accountType}
              options={BANK_ACCOUNT_TYPES}
              onChange={(accountType) => set({ accountType })}
            />
          </Field>
          {text("address", "Bank address", { wide: true })}
        </div>
      ) : null}
    </article>
  );
}

/* --------------------------------------------------------------- sections */

export function CustomerSectionBody({
  section,
  customer,
  errors,
  update,
  nav,
  variant = "page",
  footer,
}: {
  section: CustomerSection;
  customer: SalesCustomer;
  errors: CustomerErrors;
  update: (patch: Partial<SalesCustomer>) => void;
  nav: SalesNav;
  /** The panel shows status and opening balance in its quick-update strip instead. */
  variant?: "page" | "panel";
  /** Extra content shown after the Overview fields (recent documents in the panel). */
  footer?: ReactNode;
}) {
  const state = useSalesState();
  const inPanel = variant === "panel";
  const text = (
    key: keyof SalesCustomer,
    label: string,
    options: {
      required?: boolean;
      placeholder?: string;
      type?: string;
      wide?: boolean;
      hint?: string;
      autoComplete?: string;
    } = {},
  ) => (
    <Field
      label={label}
      required={options.required}
      error={errors[key]}
      hint={options.hint}
      className={options.wide ? "md:col-span-2" : undefined}
    >
      <Input
        type={options.type}
        value={String(customer[key] ?? "")}
        placeholder={options.placeholder}
        autoComplete={options.autoComplete}
        aria-invalid={Boolean(errors[key])}
        aria-required={options.required}
        onChange={(event) => update({ [key]: event.target.value } as Partial<SalesCustomer>)}
      />
    </Field>
  );
  const textarea = (key: keyof SalesCustomer, label: string, hint?: string, placeholder?: string) => (
    <Field label={label} hint={hint} className="col-span-full">
      <Textarea
        rows={3}
        value={String(customer[key] ?? "")}
        placeholder={placeholder}
        onChange={(event) => update({ [key]: event.target.value } as Partial<SalesCustomer>)}
      />
    </Field>
  );
  const choice = (
    key: keyof SalesCustomer,
    label: string,
    options: readonly string[],
    required = false,
    placeholder?: string,
  ) => (
    <Field label={label} required={required} error={errors[key]}>
      <Select
        value={String(customer[key] ?? "")}
        options={options}
        invalid={Boolean(errors[key])}
        placeholder={placeholder}
        onChange={(value) => update({ [key]: value } as Partial<SalesCustomer>)}
      />
    </Field>
  );
  const amount = (
    key: "creditLimit" | "openingBalance" | "dueDays" | "advancePercent" | "earlyDiscountPercent" | "earlyDiscountDays",
    label: string,
    options: { hint?: string; step?: number; min?: number; max?: number; readOnly?: boolean } = {},
  ) => (
    <Field label={label} error={errors[key]} hint={options.hint}>
      <Input
        type="number"
        inputMode="decimal"
        min={options.min}
        max={options.max}
        step={options.step ?? 1}
        className="text-right tabular-nums"
        readOnly={options.readOnly}
        value={customer[key]}
        aria-invalid={Boolean(errors[key])}
        onChange={(event) => update({ [key]: numberValue(event.target.value) } as Partial<SalesCustomer>)}
      />
    </Field>
  );

  let body: ReactNode;
  if (section === "overview") {
    body = (
      <>
        <SubHead>Customer identity</SubHead>
        <ReadField label="Customer code">
          <span className="font-mono">{customer.code}</span>
          {!customer.id ? (
            <small className="block text-xs font-normal text-muted-foreground">Assigned when you save</small>
          ) : null}
        </ReadField>
        {text("name", "Legal name", {
          required: true,
          placeholder: "As on the NTN certificate or registration",
          wide: true,
          autoComplete: "organization",
        })}
        {text("display", "Display name", { placeholder: "Short name for lists", hint: "Defaults to the legal name." })}
        {choice("type", "Customer type", CUSTOMER_TYPES, true)}
        {choice("salesperson", "Salesperson", SALESPEOPLE, true, "Select salesperson")}
        {text("industry", "Industry", { placeholder: "Optional" })}
        {!inPanel ? choice("status", "Status", ["Active", "Inactive"]) : null}
        <p className="col-span-full m-0 text-xs text-muted-foreground">
          Fields marked <b className="text-[var(--nx-danger)]">*</b> are required. All other sections are optional and
          can be completed later.
        </p>
        {footer}
      </>
    );
  } else if (section === "contact") {
    body = (
      <>
        <OptionalNote />
        <SubHead>Primary contact</SubHead>
        {text("contactName", "Contact person name", { autoComplete: "name" })}
        {text("contactRole", "Designation / role", { autoComplete: "organization-title" })}
        {text("email", "Email address", { type: "email", placeholder: "name@company.com", autoComplete: "email" })}
        <InternationalPhoneField
          label="Phone number"
          country={customer.phoneCountry}
          number={customer.phone}
          error={errors.phone}
          onChange={(patch) =>
            update({
              ...(patch.country !== undefined ? { phoneCountry: patch.country } : {}),
              ...(patch.number !== undefined ? { phone: patch.number } : {}),
            })
          }
        />
        {text("mobile", "Mobile number", {
          type: "tel",
          placeholder: "+92 300 1234567",
          hint: "Enter any format, with or without a country code.",
          autoComplete: "tel",
        })}
        {text("website", "Website", { placeholder: "www.company.com", autoComplete: "url" })}
      </>
    );
  } else if (section === "address") {
    body = (
      <>
        <OptionalNote />
        <SubHead>Billing address</SubHead>
        <AddressFields
          prefix="billing"
          address={customer.billing}
          errors={errors}
          onChange={(billing) => update({ billing })}
        />
        <SubHead>Shipping address</SubHead>
        <div className="col-span-full flex flex-wrap items-center gap-x-4 gap-y-2">
          <CheckField
            id={`ship-same-${customer.code}`}
            label="Ship to the billing address"
            checked={customer.shipSame}
            onChange={(shipSame) =>
              update({
                shipSame,
                shipping: shipSame
                  ? customer.shipping
                  : customer.shipping.line1
                    ? customer.shipping
                    : emptyAddress(customer.billing.country),
              })
            }
          />
          {!customer.shipSame ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => update({ shipping: { ...customer.billing } })}
            >
              Copy billing address
            </Button>
          ) : null}
        </div>
        {!customer.shipSame ? (
          <AddressFields
            prefix="shipping"
            address={customer.shipping}
            errors={errors}
            onChange={(shipping) => update({ shipping })}
          />
        ) : null}
      </>
    );
  } else if (section === "tax") {
    const setId = (index: number, patch: Partial<SalesCustomer["identifications"][number]>) =>
      update({
        identifications: customer.identifications.map((item, i) => (i === index ? { ...item, ...patch } : item)),
      });
    body = (
      <>
        <OptionalNote />
        <SubHead>Tax registration</SubHead>
        {choice("taxRegistration", "Tax registration type", TAX_REGISTRATIONS)}
        {text("ntn", "NTN number", { placeholder: "1234567-8", hint: "Pakistan National Tax Number." })}
        {text("strn", "STRN number", {
          placeholder: "03-01-9876-543-21",
          hint: "Pakistan Sales Tax Registration Number.",
        })}
        {text("tin", "Tax identification number (TIN)", { hint: "For customers registered outside Pakistan." })}
        {text("vatNumber", "VAT / GST registration number", { placeholder: "e.g. 100123456700003" })}
        <CheckField
          id={`withholding-${customer.code}`}
          label="Withholding tax applies"
          checked={customer.withholding}
          onChange={(withholding) => update({ withholding })}
        />
        {textarea(
          "taxExemption",
          "Tax exemption details (if applicable)",
          undefined,
          "Exemption certificate number, scope and validity",
        )}

        <SubHead>Identification</SubHead>
        <div className="col-span-full grid gap-2">
          {customer.identifications.length ? (
            customer.identifications.map((item, index) => {
              const error = errors[`identifications.${index}.number`];
              return (
                <div
                  key={item.id}
                  className="grid grid-cols-1 items-start gap-2 rounded border border-border p-2.5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto]"
                >
                  <Field label="Identification type">
                    <Select
                      value={item.type}
                      options={IDENTIFICATION_TYPES}
                      onChange={(type) => setId(index, { type, country: type === "CNIC" ? "PK" : item.country })}
                    />
                  </Field>
                  <Field label="Number" error={error}>
                    <Input
                      value={item.number}
                      className="font-mono"
                      placeholder={item.type === "CNIC" ? "35202-1234567-1" : undefined}
                      aria-invalid={Boolean(error)}
                      onChange={(event) => setId(index, { number: event.target.value })}
                    />
                  </Field>
                  <CountrySelect
                    label="Issuing country"
                    value={item.country}
                    onChange={(country) => setId(index, { country })}
                  />
                  <Field
                    label="Expiry date"
                    hint={
                      item.expiry && item.expiry < new Date().toISOString().slice(0, 10) ? "Expired" : "If applicable"
                    }
                  >
                    <Input
                      type="date"
                      value={item.expiry}
                      onChange={(event) => setId(index, { expiry: event.target.value })}
                    />
                  </Field>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="self-center lg:mt-6"
                    aria-label={`Remove identification ${index + 1}`}
                    onClick={() => update({ identifications: customer.identifications.filter((_, i) => i !== index) })}
                  >
                    <X />
                  </Button>
                </div>
              );
            })
          ) : (
            <span className="text-xs text-muted-foreground">
              No identification added. Add a CNIC, passport, business registration or other government ID.
            </span>
          )}
          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => update({ identifications: [...customer.identifications, newIdentification()] })}
            >
              <Plus /> Add identification
            </Button>
          </div>
        </div>
        <AttachmentList
          title="Certificates, ID documents and digital signatures"
          categories={["Tax registration certificate", "Identification document", "Digital signature"]}
          attachments={customer.attachments}
          actor={nav.actor}
          onChange={(attachments) => update({ attachments })}
        />
      </>
    );
  } else if (section === "terms") {
    const custom = customer.terms === CUSTOM_TERMS;
    // Use the opening balance being edited, not the saved one.
    const saved = customer.id ? (findCustomer(state, customer.id)?.openingBalance ?? 0) : 0;
    const opening = Number(customer.openingBalance) || 0;
    const outstanding = opening + (customer.id ? invoicedBalance(state, customer.id) : 0);
    const used = opening + (customer.id ? exposure(state, customer.id) - saved : 0);
    body = (
      <>
        <OptionalNote>Defaults apply if you leave this section unchanged.</OptionalNote>
        <SubHead>Payment terms</SubHead>
        <Field label="Payment terms">
          <Select
            value={customer.terms}
            options={CUSTOMER_TERMS}
            onChange={(terms) =>
              update(terms === CUSTOM_TERMS ? { terms } : { terms, dueDays: SALES_TERM_DAYS[terms] ?? 30 })
            }
          />
        </Field>
        {custom ? text("customTerms", "Custom terms", { placeholder: "e.g. 50% on order, balance in 60 days" }) : null}
        {amount("dueDays", "Payment due (days)", {
          min: 0,
          max: 365,
          readOnly: !custom,
          hint: custom ? undefined : "Set by the payment terms.",
        })}
        {choice("paymentMethod", "Default payment method", RECEIPT_METHODS)}
        <Field label="Preferred currency">
          <select
            className={selectClass}
            value={customer.currency}
            onChange={(event) => update({ currency: event.target.value })}
          >
            {CURRENCIES.map(([code, name]) => (
              <option key={code} value={code}>
                {code} · {name}
              </option>
            ))}
          </select>
        </Field>
        {choice("priceList", "Price list", PRICE_LISTS)}
        {choice("taxTreatment", "Tax treatment", TAX_TREATMENTS)}

        <SubHead>Advance, late payment and early payment</SubHead>
        {choice("advance", "Advance payment requirement", ADVANCE_OPTIONS)}
        {customer.advance === "Partial advance"
          ? amount("advancePercent", "Advance required (%)", { min: 1, max: 99 })
          : null}
        {amount("earlyDiscountPercent", "Early payment discount (%)", { min: 0, max: 100, step: 0.5 })}
        {amount("earlyDiscountDays", "If paid within (days)", { min: 0, max: 365 })}
        {text("lateTerms", "Late payment terms", { wide: true, placeholder: "e.g. 2% per month on overdue balances" })}

        <SubHead>Credit and balances (PKR)</SubHead>
        {amount("creditLimit", "Credit limit", { min: 0, step: 1000, hint: "0 means no limit is set." })}
        {!inPanel
          ? amount("openingBalance", "Opening balance", {
              step: 0.01,
              hint: "Receivable before Nexora. Negative = customer credit.",
            })
          : null}
        {!inPanel ? text("openingBalanceDate", "Opening balance as of", { type: "date" }) : null}
        <ReadField label="Outstanding balance">
          <span className={cn("tabular-nums", outstanding < 0 && "text-[var(--nx-success-text)]")}>
            {moneyWhole(outstanding)}
          </span>
          <small className="block text-xs font-normal text-muted-foreground">Opening balance + unpaid invoices</small>
        </ReadField>
        <ReadField label="Available credit">
          {customer.creditLimit ? (
            <span className={cn("tabular-nums", customer.creditLimit - used < 0 && "text-[var(--nx-danger)]")}>
              {moneyWhole(customer.creditLimit - used)}
            </span>
          ) : (
            "No limit set"
          )}
          <small className="block text-xs font-normal text-muted-foreground">After open orders</small>
        </ReadField>
        {choice("creditStatus", "Credit status", CREDIT_STATUSES)}
        {text("creditReview", "Next credit review", { type: "date" })}
        {textarea("creditNote", "Credit note", "On hold or Blocked stops new orders and approvals for this customer.")}
      </>
    );
  } else if (section === "banks") {
    body = (
      <>
        <OptionalNote>Add one or more accounts the customer pays from or receives refunds into.</OptionalNote>
        <div className="col-span-full grid gap-2">
          {customer.banks.map((bank, index) => (
            <BankAccountCard
              key={bank.id}
              bank={bank}
              index={index}
              errors={errors}
              onChange={(next) => update({ banks: customer.banks.map((item, i) => (i === index ? next : item)) })}
              onRemove={() => update({ banks: customer.banks.filter((_, i) => i !== index) })}
            />
          ))}
          {!customer.banks.length ? <span className="text-xs text-muted-foreground">No bank accounts.</span> : null}
          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => update({ banks: [...customer.banks, newBankAccount(customer.name)] })}
            >
              <Plus /> Add bank account
            </Button>
          </div>
          <p className="m-0 text-xs text-muted-foreground">
            Account numbers and IBANs are masked in summaries. Select the eye icon to show them.
          </p>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <OptionalNote />
        {textarea("notes", "General notes")}
        {textarea(
          "internalComments",
          "Internal comments",
          "Visible to your team only; never printed on customer documents.",
        )}
        {textarea("instructions", "Customer instructions", undefined, "e.g. Deliveries before 2 pm only")}
        {textarea("requirements", "Special requirements", undefined, "e.g. PO number must appear on every invoice")}
        {textarea("importantInfo", "Important customer information")}
        <AttachmentList
          title="Attachments"
          categories={["Contract or agreement", "Other supporting document"]}
          attachments={customer.attachments}
          actor={nav.actor}
          onChange={(attachments) => update({ attachments })}
        />
        {customer.history.length ? (
          <div className="col-span-full grid gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Activity</span>
            <div className="rounded border border-border">
              <ActivityList entries={customer.history} />
            </div>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div
      className={cn("grid grid-cols-1 gap-x-4 gap-y-3.5", inPanel ? "sm:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-3")}
    >
      {body}
    </div>
  );
}
