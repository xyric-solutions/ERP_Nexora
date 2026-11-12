import { ApiError } from "@/lib/api/generated";
export const purchaseError = (error: unknown) =>
  error instanceof ApiError ? error.message : "Could not complete the Purchase request. Please retry.";
