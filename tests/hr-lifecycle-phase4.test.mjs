/**
 * HR Phase 4 — recruitment and employee lifecycle.
 *
 * These tests protect the controls the prototype must explain visually. They
 * intentionally test relationships and lifecycle gates rather than snapshots
 * of decorative copy.
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

test("recruitment preserves approved headcount, independent panel evidence and offer controls", async () => {
  const recruitment = await load("hr-recruitment-data.ts");

  assert.ok(recruitment.manpowerRequisitions.every(recruitment.salaryRangeWithinGradeBand));
  assert.ok(recruitment.jobOpenings.every(recruitment.openingIsAuthorised));
  for (const requisition of recruitment.manpowerRequisitions) {
    assert.equal(recruitment.requisitionHeadcountWithinLimit(requisition.id), true);
  }

  const candidateSource = await readFile(new URL("../app/hr-recruitment-data.ts", import.meta.url), "utf8");
  const candidateShape = candidateSource.slice(
    candidateSource.indexOf("export interface Candidate {"),
    candidateSource.indexOf("export const candidates"),
  );
  assert.doesNotMatch(candidateShape, /\bstage:/, "pipeline stage belongs to the application, not the person");

  const completedInterviews = recruitment.interviews.filter((row) => row.status === "Completed");
  assert.ok(completedInterviews.every((row) => recruitment.evaluationsFor(row.id).every((evaluation) => evaluation.interviewId === row.id)));
  assert.ok(recruitment.interviewEvaluations.every(recruitment.evaluationIsComplete));

  const outOfRange = recruitment.offers.find((row) => !recruitment.offerWithinRange(row));
  assert.ok(outOfRange, "fixtures need a visible salary-range exception");
  assert.equal(recruitment.canSendOffer(outOfRange), false);
  assert.match(recruitment.offerBlockers(outOfRange).join(" "), /outside the approved range/i);

  for (const offer of recruitment.offers.filter((row) => row.status === "Accepted")) {
    assert.equal(recruitment.canCreateEmployee(offer.id), offer.employeeId === null);
    const draft = recruitment.buildEmployeeDraft(offer.id);
    assert.ok(draft);
    assert.equal(draft.recruitment.offerId, offer.id);
    assert.ok(draft.fields.every((field) => field.source.length > 0));
  }
});

test("the recruitment funnel is cumulative and never grows at a later stage", async () => {
  const { recruitmentFunnel } = await load("hr-recruitment-data.ts");
  const funnel = recruitmentFunnel();
  assert.ok(funnel.length >= 6);
  for (let index = 1; index < funnel.length; index += 1) {
    assert.ok(funnel[index].count <= funnel[index - 1].count, `${funnel[index].stage} exceeds the prior stage`);
  }
});

test("employee lifecycle changes preserve effective-dated and financial separation", async () => {
  const lifecycle = await load("hr-lifecycle-data.ts");

  const effective = lifecycle.employeeMovements.find((row) => row.status === "Effective");
  assert.ok(effective);
  const application = lifecycle.applyMovement(effective);
  assert.ok(application);
  assert.equal(application.closedAssignment.effectiveTo < application.newAssignment.effectiveFrom, true);

  const payChangingDraft = lifecycle.employeeMovements.find((row) => row.salaryImpact === "Change" && row.salaryRevisionId === null);
  assert.ok(payChangingDraft);
  assert.equal(lifecycle.canMakeMovementEffective(payChangingDraft), false);
  assert.match(lifecycle.movementBlockers(payChangingDraft).join(" "), /salary revision/i);

  for (const settlement of lifecycle.finalSettlements.filter((row) => row.computed)) {
    assert.equal(lifecycle.settlementAgreesWithComputation(settlement), true);
  }
  const blockedSettlement = lifecycle.finalSettlements.find((row) => !lifecycle.clearanceIsComplete(row.clearanceId));
  assert.ok(blockedSettlement);
  assert.equal(lifecycle.canPaySettlement(blockedSettlement), false);
  assert.match(lifecycle.settlementBlockers(blockedSettlement).join(" "), /clearance/i);
});

test("HR Phase 4 pages are explicitly wired before the generic prototype fallback", async () => {
  const [navigation, content, screens] = await Promise.all([
    readFile(new URL("../app/prototype-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/prototype-content.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/hr-lifecycle-screens.tsx", import.meta.url), "utf8"),
  ]);

  for (const pageId of [
    "manpower-requisitions", "recruitment-pipeline", "offers",
    "onboarding", "probation-reviews", "employee-movements", "resignations", "clearance",
  ]) {
    assert.match(navigation, new RegExp(`p\\(\\"${pageId}\\"`));
    assert.match(screens, new RegExp(`\\"${pageId}\\"`));
  }
  assert.match(content, /isHrLifecyclePage/);
  assert.match(content, /<HrLifecycleScreen/);
  assert.match(screens, /Recruitment control centre/);
  assert.match(screens, /Employee lifecycle control/);
});
