import { evaluatePolicy } from "./evaluator.js";
import type { PolicyAuthorizationRequest, PolicyDecision, PolicyPrincipal, PolicySnapshotRepository } from "./types.js";

export class PolicyService {
  constructor(private readonly repository: PolicySnapshotRepository) {}

  async authorize(principal: PolicyPrincipal, request: PolicyAuthorizationRequest): Promise<PolicyDecision> {
    try {
      const snapshot = await this.repository.loadSnapshot(principal.userId, request.evaluatedAt);
      return evaluatePolicy(principal, snapshot, request);
    } catch {
      return { allowed: false, permissionKey: request.permissionKey, reason: "policy_unavailable" };
    }
  }
}
