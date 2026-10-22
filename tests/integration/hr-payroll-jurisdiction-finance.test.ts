import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { createProductionJournalFixture } from "./hr-payroll-production-journal-fixture.js";
import { grantJurisdictionFixtureAuthority } from "./hr-payroll-jurisdiction-fixture.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
import { publishApprovedStatutoryPack } from "../../server/api/src/modules/hr/payroll-statutory-publisher.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
(url ? describe : describe.skip)("Scoped employee Payroll through the existing Finance posting boundary", () => {
  let pool: DatabasePool;
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
  });
  afterAll(async () => {
    await pool?.end();
  });
  it("posts the selected regional deduction and net payable from immutable scoped evidence without using Banking", async () => {
    const f = await createProductionJournalFixture(pool, async (f) => {
      await grantJurisdictionFixtureAuthority(pool, f.companyId);
      const region = "finance-override-" + randomUUID();
      await pool.query(
        "insert into jurisdiction(id,country_code,parent_id,code,name,level,kind,status,valid_from,source_version)values($1,'PK','pk-national',$1,'Artificial Finance override region','subnational','other','active',$2,'arithmetic specification only')",
        [region, f.month],
      );
      const b = structuredClone(f.bundle);
      b.key = "finance_override_" + randomUUID().replaceAll("-", "");
      b.classification = "production";
      b.jurisdiction_id = region;
      for (const r of b.rules) {
        r.configuration.constants.RATE = "0.2";
        for (const v of r.vectors)
          v.expected.amount = v.kind === "positive" ? "20" : v.kind === "boundary" ? "0.01" : "0";
      }
      const published = await publishApprovedStatutoryPack(pool, await f.proposal(b)),
        profile = (
          await pool.query(
            "select id from company_legal_profile where tenant_id=$1 and company_id=$2 and state in('approved','active')",
            [tenant, f.companyId],
          )
        ).rows[0].id;
      await f.approve({
        kind: "activation",
        legal_profile_id: profile,
        jurisdiction_id: region,
        pack_version_id: published.pack_version_id,
        effective_from: f.month,
        effective_to: null,
      });
      await f.approve({
        kind: "jurisdiction_override",
        employee_id: f.person.employeeId,
        employee_assignment_id: f.person.assignmentId,
        rule_scope: "fixture",
        country_code: "PK",
        jurisdiction_id: region,
        effective_from: f.month,
        effective_to: null,
        legal_basis: "Artificial independently reviewed scope-to-ledger acceptance specification",
        evidence_reference: "urn:test:scope-finance-boundary",
      });
    });
    try {
      let w = await f.journalRead();
      expect(w.blocked).toEqual([]);
      expect(w.totals.net).toBe("24800.0000");
      await f.journalAction("prepare");
      await f.journalAction("accept", "r06.checker");
      await f.journalAction("post", "r06.target");
      w = await f.journalRead();
      expect(w.period?.state).toBe("posted");
      const s = (
        await pool.query(
          "select resolver_version,override_evidence_json from hr_payroll_statutory_snapshot where tenant_id=$1 and company_id=$2",
          [tenant, f.companyId],
        )
      ).rows[0];
      expect(s.resolver_version).toBe("scoped_jurisdiction_v1");
      expect(s.override_evidence_json).toHaveLength(1);
      const sums = (
        await pool.query(
          "select sum(debit)::text as debit,sum(credit)::text as credit from journal_line where tenant_id=$1 and journal_id=$2",
          [tenant, w.proposal!.external_journal_id],
        )
      ).rows[0];
      expect(sums.debit).toBe("31000.00000000");
      expect(sums.credit).toBe(sums.debit);
    } finally {
      await f.dispose();
    }
  });
});
