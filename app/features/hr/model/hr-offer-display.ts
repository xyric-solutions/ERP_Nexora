/**
 * Offer statuses shown in filters (Offer Management and Create Employee from Offer):
 * Draft -> Submitted -> Approved or Rejected, or Withdrawn. Earlier generated/sent/accepted/
 * declined/expired records keep their stored state and appear under "All".
 */
export const offerStates = ["draft", "submitted", "approved", "rejected", "withdrawn"] as const;
export type OfferFilter = "all" | (typeof offerStates)[number];
export const offerFilterOptions: readonly { value: OfferFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
];

/** Formats an API decimal string as "CUR 1,234.50". */
export const offerMoney = (value: string, currency: string) => {
  const [whole, fraction = ""] = value.split(".");
  return currency + " " + whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + fraction.padEnd(2, "0");
};
