export interface ApprovalOverrideReviewMetadata {
  self_decision_requires_override?: boolean;
  super_admin_override_allowed?: boolean;
}

export interface ApprovalOverrideReviewState {
  selfDecisionRequiresOverride: boolean;
  overrideAllowed: boolean;
  independentApproverRequired: boolean;
}

/**
 * Resolves explanatory UI state from server-derived policy metadata. Ownership
 * and session capability are only compatibility fallbacks; the API remains the
 * authority when it supplies either value.
 */
export function approvalOverrideReviewState(
  review: ApprovalOverrideReviewMetadata | null,
  fallbackSelfDecision: boolean,
  fallbackOverrideAllowed: boolean,
): ApprovalOverrideReviewState {
  const selfDecisionRequiresOverride = review?.self_decision_requires_override ?? fallbackSelfDecision;
  const overrideAllowed =
    selfDecisionRequiresOverride && (review?.super_admin_override_allowed ?? fallbackOverrideAllowed);
  return {
    selfDecisionRequiresOverride,
    overrideAllowed,
    independentApproverRequired: selfDecisionRequiresOverride && !overrideAllowed,
  };
}
