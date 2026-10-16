import { z } from "zod";

const identifier = z.string().trim().min(1).max(128);
const reason = z.string().trim().min(1).max(512);

export const createSecurityAccessReviewCampaignSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1000).default(""),
    company_ids: z.array(identifier).max(100).default([]),
    reviewer_ids: z.array(identifier).min(1).max(100),
    review_starts_at: z.string().datetime({ offset: true }),
    review_ends_at: z.string().datetime({ offset: true }),
  })
  .refine((value) => value.review_ends_at > value.review_starts_at, {
    path: ["review_ends_at"],
    message: "review_ends_at must follow review_starts_at",
  });

export const securityAccessReviewCampaignActionSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.enum(["submit", "approve", "activate", "close"]),
    campaign_id: identifier,
    expected_version: z.number().int().positive(),
  }),
  z.strictObject({
    action: z.literal("reject"),
    campaign_id: identifier,
    expected_version: z.number().int().positive(),
    reason,
  }),
]);

export const securityAccessReviewDecisionSchema = z
  .strictObject({
    item_id: identifier,
    decision: z.enum(["retain", "revoke", "remediate"]),
    reason: reason.nullable().default(null),
    expected_version: z.number().int().positive(),
  })
  .refine((value) => value.decision === "retain" || value.reason !== null, {
    path: ["reason"],
    message: "A reason is required for revoke or remediate decisions",
  });

export const securityAccessReviewListQuerySchema = z.strictObject({
  lifecycle_state: z.enum(["draft", "submitted", "approved", "active", "rejected", "closed"]).optional(),
  reviewer_id: identifier.optional(),
  campaign_id: identifier.optional(),
  cursor: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type CreateSecurityAccessReviewCampaign = z.infer<typeof createSecurityAccessReviewCampaignSchema>;
export type SecurityAccessReviewCampaignAction = z.infer<typeof securityAccessReviewCampaignActionSchema>;
export type SecurityAccessReviewDecision = z.infer<typeof securityAccessReviewDecisionSchema>;
export type SecurityAccessReviewListQuery = z.infer<typeof securityAccessReviewListQuerySchema>;
