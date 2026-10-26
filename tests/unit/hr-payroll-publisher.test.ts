import { describe, it, expect } from "vitest";
import {
  verifyStatutoryBundle,
  statutoryBundleIdentity,
} from "../../server/api/src/modules/hr/payroll-statutory-bundle.js";
import { syntheticStatutoryBundle } from "../integration/hr-payroll-publisher-fixture.js";
describe("Statutory publication artifact validation", () => {
  it("reproduces all reviewed arithmetic vectors and produces deterministic tenant-scoped identities", () => {
    const b = syntheticStatutoryBundle();
    expect(verifyStatutoryBundle(b)).toEqual(b);
    expect(statutoryBundleIdentity("one", b)).toEqual(statutoryBundleIdentity("one", structuredClone(b)));
    expect(statutoryBundleIdentity("one", b).pack_id).not.toBe(statutoryBundleIdentity("two", b).pack_id);
  });
  it("changes the artifact fingerprint when reviewed content changes", () => {
    const b = syntheticStatutoryBundle(),
      c = structuredClone(b);
    c.sources[0]!.document_hash = "b".repeat(64);
    expect(statutoryBundleIdentity("one", b).artifact_hash).not.toBe(statutoryBundleIdentity("one", c).artifact_hash);
  });
  it("rejects duplicate source, rule and scenario keys", () => {
    const b = syntheticStatutoryBundle();
    b.sources.push(structuredClone(b.sources[0]!));
    expect(() => verifyStatutoryBundle(b)).toThrow(/unique/);
    const c = syntheticStatutoryBundle();
    c.rules.push(structuredClone(c.rules[0]!));
    expect(() => verifyStatutoryBundle(c)).toThrow(/unique/);
    const d = syntheticStatutoryBundle();
    d.rules[0]!.vectors[1]!.key = d.rules[0]!.vectors[0]!.key;
    expect(() => verifyStatutoryBundle(d)).toThrow(/unique/);
  });
  it("requires every scenario to cite an included source document", () => {
    const b = syntheticStatutoryBundle();
    b.rules[0]!.vectors[0]!.source_id = "missing";
    expect(() => verifyStatutoryBundle(b)).toThrow(/source reference/);
  });
  it("rejects non-reproducing reviewed amounts and rounding", () => {
    const b = syntheticStatutoryBundle();
    b.rules[0]!.vectors[0]!.expected.amount = "999";
    expect(() => verifyStatutoryBundle(b)).toThrow(/does not reproduce/);
    const c = syntheticStatutoryBundle();
    c.rules[0]!.vectors[1]!.rounding.rounding_mode = "half_even";
    expect(() => verifyStatutoryBundle(c)).toThrow(/does not reproduce/);
  });
  it("requires the complete positive, boundary and non-applicable review set", () => {
    const b = syntheticStatutoryBundle();
    b.rules[0]!.vectors[2]!.kind = "boundary";
    expect(() => verifyStatutoryBundle(b)).toThrow(/complete/);
  });
  it("rejects reversed effective dates and unsupported engine definitions", () => {
    const b = syntheticStatutoryBundle();
    b.effective_to = "2000-01-01";
    expect(() => verifyStatutoryBundle(b)).toThrow(/range/);
    expect(() => verifyStatutoryBundle({ ...syntheticStatutoryBundle(), execution_contract: "eval_js" })).toThrow();
  });
  it("rejects unbounded constants and employee vector input maps", () => {
    const b = syntheticStatutoryBundle();
    for (let i = 0; i < 51; i++) b.rules[0]!.configuration.constants["TEST_" + i] = "1";
    expect(() => verifyStatutoryBundle(b)).toThrow(/bounded/);
    const c = syntheticStatutoryBundle();
    for (let i = 0; i < 41; i++) c.rules[0]!.vectors[0]!.inputs["INPUT_" + i] = "1";
    expect(() => verifyStatutoryBundle(c)).toThrow(/bounded/);
  });
  it("requires consistent currency precision across the released rule set", () => {
    const b = syntheticStatutoryBundle(),
      second = structuredClone(b.rules[0]!);
    second.key = "second";
    second.configuration.currency_code = "USD";
    b.rules.push(second);
    expect(() => verifyStatutoryBundle(b)).toThrow(/same explicit currency/);
  });
  it("rejects arbitrary code and runtime-input replacement", () => {
    const b = syntheticStatutoryBundle();
    b.rules[0]!.configuration.formula = "process.exit()";
    expect(() => verifyStatutoryBundle(b)).toThrow();
    const c = syntheticStatutoryBundle();
    c.rules[0]!.configuration.constants.GROSS = "1";
    expect(() => verifyStatutoryBundle(c)).toThrow(/cannot replace/);
  });
  it("requires explicit document fingerprints and forbids unknown approval fields in an artifact", () => {
    const b = syntheticStatutoryBundle();
    b.sources[0]!.document_hash = "";
    expect(() => verifyStatutoryBundle(b)).toThrow();
    expect(() => verifyStatutoryBundle({ ...syntheticStatutoryBundle(), approved_by: "someone" })).toThrow();
  });
});
