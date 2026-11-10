import { z } from "zod";

export function supplierMailingAddress(supplier: {
  address: string;
  profile?: { billing_city: string; billing_province: string; billing_postal_code: string; billing_country: string };
}) {
  const profile = supplier.profile;
  return [
    supplier.address,
    [profile?.billing_city, profile?.billing_province, profile?.billing_postal_code].filter(Boolean).join(", "),
    profile?.billing_country,
  ]
    .filter(Boolean)
    .join("\n");
}

const text = (max: number) => z.string().trim().max(max).default("");
const currency = z
  .string()
  .regex(/^(?:[A-Z]{3})?$/, "Use a three-letter currency code")
  .default("");
const iban = z
  .string()
  .trim()
  .toUpperCase()
  .max(42)
  .overwrite((value) => value.replace(/\s/g, ""))
  .refine((value) => {
    if (!value) return true;
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(value)) return false;
    const digits = (value.slice(4) + value.slice(0, 4)).replace(/[A-Z]/g, (letter) =>
      String(letter.charCodeAt(0) - 55),
    );
    let remainder = 0;
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
    return remainder === 1;
  }, "Enter a valid IBAN including its check digits")
  .default("");

export const supplierBankAccountSchema = z
  .strictObject({
    id: z.string().min(1).max(128),
    bank_name: z.string().trim().min(1, "Enter the bank name").max(200),
    branch: text(200),
    branch_code: text(32),
    country: text(100),
    account_title: z.string().trim().min(1, "Enter the account title").max(200),
    account_number: text(64),
    iban,
    swift: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^(?:[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)?$/, "Enter an 8 or 11 character SWIFT/BIC")
      .default(""),
    currency,
    is_default: z.boolean().default(false),
  })
  .superRefine((account, context) => {
    if (!account.account_number && !account.iban)
      context.addIssue({ code: "custom", path: ["account_number"], message: "Enter an account number or IBAN" });
  });

export const supplierAddressSchema = z.strictObject({
  street: text(1000),
  city: text(100),
  province: text(100),
  postal_code: text(32),
  country: text(100),
});

export const supplierProfileSchema = z
  .strictObject({
    entity_type: z.enum(["company", "individual"]).default("company"),
    trading_name: text(200),
    category: text(100),
    registration_number: text(128),
    website: z.union([z.url({ protocol: /^https?$/ }).max(500), z.literal("")]).default(""),
    contact_title: text(32),
    contact_name: text(200),
    designation: text(100),
    mobile: text(64),
    billing_city: text(100),
    billing_province: text(100),
    billing_postal_code: text(32),
    billing_country: text(100),
    delivery_same_as_billing: z.boolean().default(true),
    delivery_address: supplierAddressSchema.prefault({}),
    tax_registration: text(128),
    tax_status: z.enum(["unregistered", "registered", "exempt"]).default("unregistered"),
    withholding_reference: text(128),
    payment_method: z.enum(["unspecified", "bank_transfer", "cheque", "cash", "other"]).default("unspecified"),
    credit_days: z.number().int().min(0).max(365).default(0),
    currency,
    payment_reference: text(128),
    bank_accounts: z.array(supplierBankAccountSchema).max(10).default([]),
    notes: text(4000),
  })
  .superRefine((profile, context) => {
    const accounts = profile.bank_accounts;
    if (accounts.length && accounts.filter((account) => account.is_default).length !== 1)
      context.addIssue({ code: "custom", path: ["bank_accounts"], message: "Choose exactly one default bank account" });
    if (new Set(accounts.map((account) => account.id)).size !== accounts.length)
      context.addIssue({
        code: "custom",
        path: ["bank_accounts"],
        message: "Each bank account must have a unique identity",
      });
    const seen = new Set<string>();
    accounts.forEach((account, index) => {
      const identities = [
        ...(account.iban ? [`iban:${account.iban}`] : []),
        ...(account.account_number
          ? [`account:${account.bank_name.toLowerCase()}:${account.account_number.replace(/\s/g, "").toLowerCase()}`]
          : []),
      ];
      if (identities.some((identity) => seen.has(identity)))
        context.addIssue({
          code: "custom",
          path: ["bank_accounts", index, "account_number"],
          message: "This bank account is already listed",
        });
      identities.forEach((identity) => seen.add(identity));
    });
  });

export type SupplierProfile = z.infer<typeof supplierProfileSchema>;
export type SupplierBankAccount = z.infer<typeof supplierBankAccountSchema>;
