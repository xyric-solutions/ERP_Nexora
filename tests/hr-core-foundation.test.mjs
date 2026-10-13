/**
 * Core HR foundation (Phase 1).
 *
 * An HR prototype is only useful if it shows a system that could actually be
 * built. These tests hold it to the architecture rather than to its
 * appearance: history that cannot be overwritten, a status lifecycle instead
 * of a boolean, masters that are deactivated rather than deleted, and
 * sensitive values that are masked wherever they are shown.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const stamp = `${process.pid}-${Date.now()}`;

async function load(name) {
  const url = new URL(`../app/${name}`, import.meta.url);
  url.searchParams.set("test", stamp);
  return import(url.href);
}

test("an employee carries no organizational fields at all", async () => {
  const source = await readFile(new URL("../app/hr-core-data.ts", import.meta.url), "utf8");
  const start = source.indexOf("export interface Employee {");
  const body = source.slice(start, source.indexOf("}", start));

  // This is the whole design. If a department lands on the employee, the
  // "never overwrite history" rule becomes a discipline instead of a fact,
  // because there is suddenly a current value to overwrite.
  for (const forbidden of [
    "departmentId",
    "branchId",
    "companyId",
    "designationId",
    "jobGradeId",
    "costCentreId",
    "workLocationId",
    "employmentTypeId",
    "employeeCategoryId",
    "reportingManagerId",
  ]) {
    assert.ok(
      !body.includes(forbidden),
      `Employee declares ${forbidden}; organizational facts belong on the effective-dated assignment`,
    );
  }
});

test("the assignment in force is resolved by date, not stored", async () => {
  const { assignmentOn, masterRecord, employeeName } = await load("hr-core-data.ts");

  // Mariam Ali was an Accountant on Grade 5 before her 2023 promotion and a
  // Finance Manager on Grade 3 after it. The same employee, read on two dates,
  // must give two different answers.
  const before = assignmentOn("EMP-2", "2022-01-01");
  const after = assignmentOn("EMP-2", "2026-09-18");
  assert.equal(masterRecord("designation", before.designationId).name, "Accountant");
  assert.equal(masterRecord("job-grade", before.jobGradeId).code, "G5");
  assert.equal(masterRecord("designation", after.designationId).name, "Finance Manager");
  assert.equal(masterRecord("job-grade", after.jobGradeId).code, "G3");
  assert.equal(employeeName(after.reportingManagerId), "Omar Siddiqui");

  // Before the employee existed there is no assignment, rather than a guess.
  assert.equal(assignmentOn("EMP-2", "2019-01-01"), undefined);
});

test("assignment history has no overlaps and no gaps", async () => {
  const { employees, assignmentsFor, employedStatuses, HR_TODAY } = await load("hr-core-data.ts");

  for (const person of employees) {
    const rows = [...assignmentsFor(person.id)].sort((a, b) =>
      a.effectiveFrom.localeCompare(b.effectiveFrom),
    );
    assert.ok(rows.length > 0, `${person.employeeNumber} has no assignment at all`);

    // Exactly one assignment may be in force at a time - that is what makes
    // an employment primary. Someone who has left has none in force, and
    // someone whose appointment starts later has none yet; both are correct,
    // and neither may have two.
    const inForce = rows.filter(
      (row) => row.effectiveFrom <= HR_TODAY && (row.effectiveTo === null || row.effectiveTo >= HR_TODAY),
    );
    assert.ok(
      inForce.length <= 1,
      `${person.employeeNumber} has ${inForce.length} assignments in force at once`,
    );
    if (employedStatuses.includes(person.status)) {
      assert.equal(
        inForce.length,
        1,
        `${person.employeeNumber} is ${person.status} but has no assignment in force`,
      );
    } else if (["Resigned", "Terminated", "Inactive"].includes(person.status)) {
      assert.equal(
        inForce.length,
        0,
        `${person.employeeNumber} has left but still holds a live assignment`,
      );
    }

    for (let index = 0; index < rows.length - 1; index += 1) {
      const current = rows[index];
      const next = rows[index + 1];
      assert.ok(
        current.effectiveTo !== null,
        `${person.employeeNumber} has an open assignment followed by another`,
      );
      assert.ok(
        current.effectiveTo < next.effectiveFrom,
        `${person.employeeNumber} assignments overlap: ${current.id} ends ${current.effectiveTo}, ${next.id} starts ${next.effectiveFrom}`,
      );
    }

    // The first assignment cannot start before the person joined.
    assert.ok(
      rows[0].effectiveFrom >= person.joinedOn,
      `${person.employeeNumber} is assigned from ${rows[0].effectiveFrom} but joined ${person.joinedOn}`,
    );
  }
});

test("status is a lifecycle, and every recorded move is a legal one", async () => {
  const { employees, statusEventsFor, canTransition, employeeStatuses, employeeStatusTransitions } =
    await load("hr-core-data.ts");

  assert.deepEqual(
    [...employeeStatuses],
    [
      "Draft",
      "Pending approval",
      "Active",
      "Probation",
      "Confirmed",
      "Suspended",
      "Resigned",
      "Terminated",
      "Inactive",
    ],
  );

  // Inactive is terminal; everything else can still move somewhere.
  assert.deepEqual(employeeStatusTransitions.Inactive, []);
  for (const status of employeeStatuses) {
    if (status === "Inactive") continue;
    assert.ok(
      employeeStatusTransitions[status].length > 0,
      `${status} is a dead end but is not the terminal status`,
    );
  }

  for (const person of employees) {
    const events = [...statusEventsFor(person.id)].sort((a, b) =>
      a.effectiveFrom.localeCompare(b.effectiveFrom),
    );
    assert.ok(events.length > 0, `${person.employeeNumber} has no status history`);
    assert.equal(events[0].fromStatus, null, `${person.employeeNumber} starts mid-lifecycle`);

    for (let index = 1; index < events.length; index += 1) {
      const previous = events[index - 1];
      const event = events[index];
      assert.equal(
        event.fromStatus,
        previous.toStatus,
        `${person.employeeNumber}: ${event.id} claims to start from ${event.fromStatus} but the record was ${previous.toStatus}`,
      );
      assert.ok(
        canTransition(event.fromStatus, event.toStatus),
        `${person.employeeNumber}: ${event.fromStatus} -> ${event.toStatus} is not a legal transition`,
      );
      assert.ok(
        previous.effectiveFrom <= event.effectiveFrom,
        `${person.employeeNumber}: status history is out of order`,
      );
    }

    // The status shown on the record is the end of its own history, not a
    // separate field that can drift away from it.
    assert.equal(
      person.status,
      events.at(-1).toStatus,
      `${person.employeeNumber} shows ${person.status} but its history ends at ${events.at(-1).toStatus}`,
    );
  }
});

test("every assignment points at master data that exists", async () => {
  const { employeeAssignments, orgUnit, masterRecord, employee } = await load("hr-core-data.ts");

  const links = [
    ["designation", "designationId"],
    ["job-grade", "jobGradeId"],
    ["cost-centre", "costCentreId"],
    ["work-location", "workLocationId"],
    ["employment-type", "employmentTypeId"],
    ["employee-category", "employeeCategoryId"],
  ];

  for (const row of employeeAssignments) {
    for (const field of ["companyId", "branchId", "departmentId"]) {
      assert.ok(orgUnit(row[field]), `${row.id} points at unknown org unit ${row[field]}`);
    }
    assert.equal(orgUnit(row.branchId).parentId, row.companyId, `${row.id}: branch is not in its company`);
    assert.equal(orgUnit(row.departmentId).parentId, row.branchId, `${row.id}: department is not in its branch`);

    for (const [masterId, field] of links) {
      assert.ok(masterRecord(masterId, row[field]), `${row.id} points at unknown ${masterId} ${row[field]}`);
    }

    if (row.reportingManagerId !== null) {
      assert.ok(employee(row.reportingManagerId), `${row.id} reports to unknown employee ${row.reportingManagerId}`);
      assert.notEqual(row.reportingManagerId, row.employeeId, `${row.id}: an employee cannot report to themselves`);
    }
  }
});

test("the reporting chain cannot loop", async () => {
  const { employees, assignmentOn } = await load("hr-core-data.ts");

  for (const person of employees) {
    const seen = new Set([person.id]);
    let current = assignmentOn(person.id)?.reportingManagerId ?? null;
    while (current) {
      assert.ok(!seen.has(current), `${person.employeeNumber} is in a management cycle through ${current}`);
      seen.add(current);
      current = assignmentOn(current)?.reportingManagerId ?? null;
    }
  }
});

test("inactive master data is kept for history but never used by a live employee", async () => {
  const { employees, employedStatuses, assignmentOn, masterRecord, orgUnit, hrMasters, selectableRecords } =
    await load("hr-core-data.ts");

  // Inactive records must still exist - deleting them would rewrite the
  // historical assignments that reference them.
  const inactive = hrMasters.flatMap((master) =>
    master.records.filter((record) => record.status === "Inactive").map((record) => [master.id, record]),
  );
  assert.ok(inactive.length > 0, "the fixtures need an inactive master to make this meaningful");

  // ...but nothing inactive is offered for a new assignment.
  for (const master of hrMasters) {
    for (const record of selectableRecords(master.id)) {
      assert.equal(record.status, "Active", `${record.name} is offered but is ${record.status}`);
    }
  }

  // ...and no employed person's current assignment depends on one.
  for (const person of employees) {
    if (!employedStatuses.includes(person.status)) continue;
    const row = assignmentOn(person.id);
    for (const [masterId, field] of [
      ["designation", "designationId"],
      ["job-grade", "jobGradeId"],
      ["cost-centre", "costCentreId"],
      ["work-location", "workLocationId"],
      ["employment-type", "employmentTypeId"],
      ["employee-category", "employeeCategoryId"],
    ]) {
      assert.equal(
        masterRecord(masterId, row[field]).status,
        "Active",
        `${person.employeeNumber} is currently assigned to the inactive ${masterId} ${row[field]}`,
      );
    }
    for (const field of ["branchId", "departmentId"]) {
      assert.equal(
        orgUnit(row[field]).status,
        "Active",
        `${person.employeeNumber} is currently assigned to the closed unit ${row[field]}`,
      );
    }
  }
});

test("a master that history references cannot be deleted", async () => {
  const { masterIsInUse, masterUsageCount } = await load("hr-core-data.ts");
  const screens = await readFile(new URL("../app/hr-master-screens.tsx", import.meta.url), "utf8");

  // The Karachi cost centre is closed, and its only use is a closed
  // assignment - which is exactly the case that must still block deletion.
  assert.equal(masterIsInUse("cost-centre", "CCT-006"), true);
  assert.ok(masterUsageCount("cost-centre", "CCT-006") > 0);

  // Delete is absent rather than disabled: a disabled button still claims a
  // delete path exists.
  assert.match(screens, /\{inUse \? null : \(/);
  assert.match(screens, /cannot be deleted/);
  assert.match(screens, /Deactivate/);
});

test("employee numbers are unique and follow the configured format", async () => {
  const { employees } = await load("hr-core-data.ts");
  const numbers = employees.map((person) => person.employeeNumber);
  assert.deepEqual([...new Set(numbers)], numbers, "employee numbers must be unique");
  for (const number of numbers) {
    assert.match(number, /^EMP-\d{6}$/, `${number} does not follow the employee number format`);
  }
});

test("sensitive values are masked to their last four characters", async () => {
  const { maskValue } = await load("hr-core-data.ts");
  assert.equal(maskValue("00114471889201"), "**********9201");
  assert.equal(maskValue("PK36FMER0000114471889201"), "********************9201");
  // Four characters or fewer reveal nothing at all.
  assert.equal(maskValue("1234"), "****");
  assert.equal(maskValue("12"), "**");
});

test("headcount counts employed people through their current assignment", async () => {
  const { activeHeadcount, headcountByDepartment, employees, employedStatuses } =
    await load("hr-core-data.ts");

  const employed = employees.filter((person) => employedStatuses.includes(person.status));
  assert.equal(activeHeadcount(), employed.length);

  // A resigned person and one still pending approval are not headcount.
  assert.ok(employees.some((person) => person.status === "Resigned"));
  assert.ok(employees.some((person) => person.status === "Pending approval"));
  assert.ok(activeHeadcount() < employees.length);

  const byDepartment = headcountByDepartment();
  assert.equal(
    byDepartment.reduce((total, row) => total + row.count, 0),
    activeHeadcount(),
    "department headcount must add up to the total",
  );
});

test("the HR foundation screens are reachable and share one master screen", async () => {
  const [catalogue, content, screens] = await Promise.all([
    readFile(new URL("../app/prototype-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/prototype-content.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/hr-master-screens.tsx", import.meta.url), "utf8"),
  ]);

  for (const pageId of [
    "org-structure",
    "designations",
    "job-grades",
    "cost-centres",
    "work-locations",
    "employment-types",
    "employee-categories",
  ]) {
    assert.match(catalogue, new RegExp(`p\\("${pageId}"`), `the HR menu is missing ${pageId}`);
  }

  assert.match(content, /hrMasterForPage\(context\.pageId\)/);
  assert.match(content, /<HrOrgStructure/);
  assert.match(content, /<HrMasterScreen/);

  // One screen for six masters, so they cannot drift apart.
  assert.equal((screens.match(/export function HrMasterScreen/g) ?? []).length, 1);
  assert.match(screens, /ModuleSearchableTable/, "the master screen does not use the shared searchable list");
  for (const capability of ["Details", "History", "Audit trail"]) {
    assert.ok(screens.includes(`"${capability}"`), `the master screen is missing the ${capability} tab`);
  }
});
