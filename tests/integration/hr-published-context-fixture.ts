import { randomUUID } from "node:crypto";
import type { DatabasePool } from "../../packages/db/src/index.js";
import { createPublisherFixture, publisherActor } from "./hr-payroll-publisher-fixture.js";
import { publishApprovedStatutoryPack } from "../../server/api/src/modules/hr/payroll-statutory-publisher.js";
import { ExactPayrollAmount as Money } from "../../server/api/src/modules/hr/payroll-calculation.js";
import type { HrPayrollRunAction } from "../../packages/contracts/src/hr/index.js";
/** Production executor, artificial published specifications, isolated database only. */
export async function createPublishedContextFixture(pool: DatabasePool) {
  const f = await createPublisherFixture(pool),
    profile = await f.prepareCompany(),
    split = f.month.slice(0, 8) + "15";
  for (const second of [false, true]) {
    const b = structuredClone(f.bundle);
    b.classification = "production";
    b.effective_from = second ? split : f.month;
    b.effective_to = second ? null : f.month.slice(0, 8) + "14";
    b.semantic_version = second ? "2.0.0" : "1.0.0";
    for (const r of b.rules) {
      r.configuration.context_basis = "calendar_weighted_monthly";
      r.configuration.constants.RATE = second ? "0.2" : "0.1";
      for (const v of r.vectors) {
        v.inputs = {
          GROSS: v.kind === "positive" ? "100" : v.kind === "boundary" ? "1" : "0",
          CONTEXT_DAYS: v.kind === "positive" ? "31" : "15",
          EARNED_PERIOD_DAYS: "31",
        };
        v.expected = {
          applicable: v.kind !== "non_applicable",
          amount: Money.parse(v.inputs.GROSS!)
            .multiply(Money.parse(r.configuration.constants.RATE))
            .multiply(Money.parse(v.inputs.CONTEXT_DAYS!))
            .divide(Money.parse("31"))
            .decimal(2),
        };
      }
    }
    const released = await publishApprovedStatutoryPack(pool, await f.proposal(b));
    await f.approve({
      kind: "activation",
      legal_profile_id: profile,
      jurisdiction_id: f.jurisdiction,
      pack_version_id: released.pack_version_id,
      effective_from: b.effective_from,
      effective_to: b.effective_to,
    });
  }
  const query = { company_id: f.companyId, month: f.month };
  const run = async (
    action: HrPayrollRunAction["action"],
    extra: Partial<HrPayrollRunAction> = {},
    who = "r06.maker",
  ) => {
    const w = await f.repo.getPayrollRunWorkspace(publisherActor(who), query);
    return f.repo.actOnPayrollRun(
      publisherActor(who),
      {
        ...query,
        action,
        reason: "Isolated reviewed statutory context execution",
        expected_version: w.period?.version ?? 0,
        source_hash: w.source_hash,
        confirm_override: false,
        ...extra,
      },
      randomUUID(),
      "statutory-context-published",
    );
  };
  await run("policy", {
    currency_code: "PKR",
    money_scale: 2,
    rounding_mode: "half_up",
    net_payable_account_id: f.liability,
  });
  await run("open", { policy_id: (await f.repo.getPayrollRunWorkspace(publisherActor(), query)).policies[0]!.id });
  return { ...f, query, run };
}
