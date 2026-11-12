/**
 * Offer status filters. Offer Management works on offers still being prepared
 * (Draft, Submitted); Create Employee from Offer works on decided offers
 * (Approved, Rejected, Withdrawn). "All" on each page means all of that page's
 * statuses; earlier generated/sent/accepted/declined/expired records appear
 * under "All" on the Create Employee page.
 */
export type OfferStage = "preparation" | "decided";
export type PreparationOfferFilter = "all" | "draft" | "submitted";
export type DecidedOfferFilter = "all" | "approved" | "rejected" | "withdrawn";
export const preparationOfferFilterOptions: readonly { value: PreparationOfferFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
];
export const decidedOfferFilterOptions: readonly { value: DecidedOfferFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
];

/** Formats an API decimal string as "CUR 1,234.50". */
export const offerMoney = (value: string, currency: string) => {
  const [whole, fraction = ""] = value.split(".");
  return currency + " " + whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + fraction.padEnd(2, "0");
};
