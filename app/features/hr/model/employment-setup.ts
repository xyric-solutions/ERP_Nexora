import type { HrPayCycle, HrPaymentRoute } from "@nexora/contracts";

/** Shared labels for the Employment Setup master (HR134): one record = payment route + pay cycle. */
export const paymentRouteOptions = [
  { value: "payroll", label: "Payroll" },
  { value: "stipend", label: "Stipend" },
  { value: "accounts_payable", label: "Accounts payable" },
] as const satisfies readonly { value: HrPaymentRoute; label: string }[];

export const payCycleOptions = [
  { value: "monthly", label: "Monthly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "weekly", label: "Weekly" },
  { value: "stipend", label: "Stipend" },
] as const satisfies readonly { value: HrPayCycle; label: string }[];

export function paymentRouteLabel(value: string | null | undefined): string {
  if (!value) return "Not configured";
  return paymentRouteOptions.find((option) => option.value === value)?.label ?? value;
}

export function payCycleLabel(value: string | null | undefined): string {
  if (!value) return "Not configured";
  return payCycleOptions.find((option) => option.value === value)?.label ?? value;
}

export function isPaymentRoute(value: string): value is HrPaymentRoute {
  return paymentRouteOptions.some((option) => option.value === value);
}

export function isPayCycle(value: string): value is HrPayCycle {
  return payCycleOptions.some((option) => option.value === value);
}

/** Picker label, e.g. "ES-001 · Permanent staff · Payroll / Monthly". */
export function employmentSetupOptionLabel(record: {
  code: string;
  name: string;
  payment_route: string | null;
  pay_cycle: string | null;
}): string {
  return `${record.code} · ${record.name} · ${paymentRouteLabel(record.payment_route)} / ${payCycleLabel(record.pay_cycle)}`;
}
