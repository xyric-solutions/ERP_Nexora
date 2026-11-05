/** Offer lifecycle states shown in offer filters (Offer Management and Create Employee from Offer). */
export const offerStates = [
  "draft",
  "submitted",
  "approved",
  "generated",
  "sent",
  "accepted",
  "declined",
  "rejected",
  "expired",
  "withdrawn",
] as const;

/** Formats an API decimal string as "CUR 1,234.50". */
export const offerMoney = (value: string, currency: string) => {
  const [whole, fraction = ""] = value.split(".");
  return currency + " " + whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + fraction.padEnd(2, "0");
};
