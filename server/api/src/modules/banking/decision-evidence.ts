import { z } from "zod";

const reason = z.string().trim().min(3).max(500);

/** No user justification is invented: automatic approval text is explicitly identified. */
export function bankDecisionEvidence(
  input: { action: "approve" | "reject"; reason?: string | undefined },
  label: string,
) {
  if (input.action === "reject" || input.reason !== undefined)
    return { reason: reason.parse(input.reason), source: "user_entered" as const };
  return {
    reason: `${label} approval confirmed by the authorized approver. No business reason was requested.`,
    source: "system_confirmation" as const,
  };
}
