const persistedBankPaymentIdPattern =
  /^bank-payment-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isPersistedBankPaymentId(value: string | undefined): value is string {
  return Boolean(value && persistedBankPaymentIdPattern.test(value));
}
