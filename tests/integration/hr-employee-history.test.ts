import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedAccount } from "../../packages/auth/src/index.js";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import {
  HrApiError,
  SourceHrRepository,
  type HrActorContext,
} from "../../server/api/src/modules/hr/source-repository.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId } from "./source-security-fixture.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;

function context(userId: string, tenantId = sourceTestTenantId, permitted = true): HrActorContext {
  const actor: AuthenticatedAccount = {
    tenantId,
    organizationName: "Nexora R06 Controlled UAT",
    userId,
    email: `${userId}@uat.nexora.invalid`,
    displayName: userId,
    roles: ["hr_reader"],
    permissions: permitted ? ["hr.employment_history.read"] : [],
    sessionVersion: 1,
  };
  return { tenantId, actor };
}

run("employee history read model", () => {
  let pool: DatabasePool;
  let repository: SourceHrRepository;

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl!);
    await ensureSourceAuthorizationFixture(pool);
    repository = new SourceHrRepository(pool);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("paginates non-sensitive profile versions with stable opaque cursors", async () => {
    const employeeId = "r06-uat-employee-target";
    for (const [index, preferredName] of ["History One", "History Two"].entries()) {
      const current = await pool.query<{
        id: string;
        revision: number;
        effective_from: string | Date;
      }>(
        `select id,revision,effective_from
           from hr_employee_profile_version
          where tenant_id=$1 and employee_id=$2 and effective_to is null
          order by revision desc limit 1`,
        [sourceTestTenantId, employeeId],
      );
      const previous = current.rows[0];
      if (!previous) throw new Error("The employee-history fixture requires an open profile version.");
      await pool.query(
        `update hr_employee_profile_version
            set effective_to=greatest(effective_from,current_date)
          where tenant_id=$1 and id=$2`,
        [sourceTestTenantId, previous.id],
      );
      await pool.query(
        `insert into hr_employee_profile_version (
           id,tenant_id,employee_id,effective_from,revision,supersedes_version_id,
           first_name,middle_name,last_name,preferred_name,work_email,date_of_birth,
           personal_email,phone,recorded_by,source_reference,recorded_at
         )
         select $1,employee.tenant_id,employee.id,current_date,$2,$3,
                employee.first_name,employee.middle_name,employee.last_name,$4,
                employee.work_email,employee.date_of_birth,employee.personal_email,
                employee.phone,'r06.maker',$5,clock_timestamp()+($6::text || ' milliseconds')::interval
           from employee
          where employee.tenant_id=$7 and employee.id=$8`,
        [
          `employee-history-${randomUUID()}`,
          previous.revision + 1,
          previous.id,
          preferredName,
          `platform-audit:employee-history-${index}`,
          index,
          sourceTestTenantId,
          employeeId,
        ],
      );
    }

    const firstPage = await repository.listEmployeeProfileHistory(context("r06.maker"), employeeId, { limit: 1 });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.items[0]).toMatchObject({
      preferred_name: "History Two",
      capture_origin: "recorded_change",
    });
    expect(firstPage.next_cursor).toEqual(expect.any(String));

    const secondPage = await repository.listEmployeeProfileHistory(context("r06.maker"), employeeId, {
      limit: 1,
      cursor: firstPage.next_cursor!,
    });
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0]?.id).not.toBe(firstPage.items[0]?.id);
    expect(JSON.stringify({ firstPage, secondPage })).not.toMatch(/date_of_birth|personal_email|phone|recorded_by/);
  });

  it("rejects invalid cursors, missing permission and cross-tenant history lookup", async () => {
    await expect(
      repository.listEmployeeProfileHistory(context("r06.maker"), "r06-uat-employee-target", {
        limit: 25,
        cursor: "not-a-valid-cursor",
      }),
    ).rejects.toMatchObject({ status: 400, code: "HR_HISTORY_CURSOR_INVALID" } satisfies Partial<HrApiError>);
    await expect(
      repository.listEmployeeProfileHistory(
        context("r06.maker", sourceTestTenantId, false),
        "r06-uat-employee-target",
        {
          limit: 25,
        },
      ),
    ).rejects.toMatchObject({ status: 403, code: "PERMISSION_DENIED" } satisfies Partial<HrApiError>);
    await expect(
      repository.listEmployeeProfileHistory(context("r06.maker", "other-tenant"), "r06-uat-employee-target", {
        limit: 25,
      }),
    ).rejects.toMatchObject({ status: 404, code: "HR_EMPLOYEE_NOT_FOUND" } satisfies Partial<HrApiError>);
  });
});
