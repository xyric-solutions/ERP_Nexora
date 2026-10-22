import { describe, it, expect } from "vitest";
import {
  selectScopedStatutoryRules as select,
  jurisdictionChain,
} from "../../server/api/src/modules/hr/payroll-jurisdiction.js";
const rows = [
  { id: "national", parent_id: null },
  { id: "region-a", parent_id: "national" },
  { id: "region-b", parent_id: "national" },
];
const packs = [
  { pack_version_id: "national-pack", target_jurisdiction_id: "national" },
  { pack_version_id: "a-pack", target_jurisdiction_id: "region-a" },
  { pack_version_id: "b-pack", target_jurisdiction_id: "region-b" },
];
const rules = [
  { id: "national", pack_version_id: "national-pack", rule_scope: "tax" },
  { id: "tax-a", pack_version_id: "a-pack", rule_scope: "tax" },
  { id: "other-a", pack_version_id: "a-pack", rule_scope: "other" },
  { id: "tax-b", pack_version_id: "b-pack", rule_scope: "tax" },
  { id: "other-b", pack_version_id: "b-pack", rule_scope: "other" },
];
const override = (scope = "tax", jurisdiction = "region-b") => ({
  id: "override-" + scope,
  rule_scope: scope,
  jurisdiction_id: jurisdiction,
});
describe("Explicit published category jurisdiction selection", () => {
  it("retains the existing comparable legal/work chain without an override", () => {
    expect(select(packs, rules, [], rows, "national", "region-a", {}).rules.map((r) => r.id)).toEqual([
      "national",
      "tax-a",
      "other-a",
    ]);
  });
  it("changes only the approved category and retains national additive rules once", () => {
    const s = select(packs, rules, [override()], rows, "region-a", "region-a", {});
    expect(s.rules.map((r) => r.id)).toEqual(["national", "other-a", "tax-b"]);
    expect(s.resolutions.find((r) => r.rule_scope === "other")?.override_id).toBeNull();
  });
  it("does not infer region precedence from incomparable branches", () => {
    expect(() => select(packs, rules, [], rows, "region-a", "region-b", {})).toThrow("every published rule category");
  });
  it("requires explicit authority for every category across branches", () => {
    expect(() => select(packs, rules, [override()], rows, "region-a", "region-b", {})).toThrow("other");
  });
  it("resolves all explicitly approved categories across branches", () => {
    expect(
      select(packs, rules, [override(), override("other")], rows, "region-a", "region-b", {}).rules.map((r) => r.id),
    ).toEqual(["national", "tax-b", "other-b"]);
  });
  it("rejects an override that would otherwise be silently ignored", () => {
    expect(() => select(packs, rules, [override("missing")], rows, "region-a", "region-a", {})).toThrow(
      "no activated published rule category",
    );
  });
  it("rejects ambiguous duplicate category overrides", () => {
    expect(() => select(packs, rules, [override(), override()], rows, "region-a", "region-a", {})).toThrow("ambiguous");
  });
  it("requires matching activated rules in the selected chain", () => {
    expect(() =>
      select(
        packs,
        rules.filter((r) => r.id !== "tax-b" && r.id !== "national"),
        [override()],
        rows,
        "region-a",
        "region-a",
        {},
      ),
    ).toThrow("selected jurisdiction chain");
  });
  it("rejects incomplete parent authority", () => {
    expect(() => jurisdictionChain([{ id: "region", parent_id: "missing" }], "region")).toThrow("Incomplete");
  });
  it("rejects cyclic hierarchy authority", () => {
    expect(() =>
      jurisdictionChain(
        [
          { id: "a", parent_id: "b" },
          { id: "b", parent_id: "a" },
        ],
        "a",
      ),
    ).toThrow("Cyclic");
  });
});
