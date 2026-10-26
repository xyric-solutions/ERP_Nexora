import { describe, expect, it } from "vitest";
import {
  importChartTemplateRequestSchema,
  chartTemplateNodeQuerySchema,
} from "../../packages/contracts/src/finance/chart-templates.js";
import { chartTemplateHash } from "../../server/api/src/modules/finance/templates/source-repository.js";
export const sampleTemplate = {
  catalog_key: "synthetic-coa",
  name: "Synthetic central chart",
  revision: "v1",
  source_filename: "synthetic.xlsx",
  source_sha256: "a".repeat(64),
  categories: [{ key: "expenses", name: "Expenses", type: "expense" as const }],
  sections: [{ code: "7101", name: "Wages & Salaries", category_key: "expenses" }],
  nominals: [
    {
      code: "710103",
      name: "Staff Salaries",
      section_code: "7101",
      source_rows: [{ source: "Synthetic screenshot", row: 1 }],
    },
  ],
};
describe("Central Chart template contracts", () => {
  it("accepts reference definitions without company, currency or money", () => {
    expect(importChartTemplateRequestSchema.parse(sampleTemplate)).toEqual(sampleTemplate);
    for (const field of ["company_id", "currency", "opening_balance"])
      expect(importChartTemplateRequestSchema.safeParse({ ...sampleTemplate, [field]: "USD" }).success).toBe(false);
  });
  it("rejects duplicate codes and category identities", () => {
    expect(
      importChartTemplateRequestSchema.safeParse({
        ...sampleTemplate,
        nominals: [...sampleTemplate.nominals, ...sampleTemplate.nominals],
      }).success,
    ).toBe(false);
    expect(
      importChartTemplateRequestSchema.safeParse({
        ...sampleTemplate,
        categories: [...sampleTemplate.categories, ...sampleTemplate.categories],
      }).success,
    ).toBe(false);
  });
  it("rejects orphan hierarchy and duplicated provenance", () => {
    expect(
      importChartTemplateRequestSchema.safeParse({
        ...sampleTemplate,
        sections: [{ ...sampleTemplate.sections[0], category_key: "outside" }],
      }).success,
    ).toBe(false);
    expect(
      importChartTemplateRequestSchema.safeParse({
        ...sampleTemplate,
        nominals: [
          {
            ...sampleTemplate.nominals[0],
            source_rows: [
              { source: "one", row: 1 },
              { source: "one", row: 1 },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });
  it("bounds list and source inputs", () => {
    expect(chartTemplateNodeQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(chartTemplateNodeQuerySchema.safeParse({ cursor: "-1" }).success).toBe(false);
    expect(importChartTemplateRequestSchema.safeParse({ ...sampleTemplate, source_sha256: "not-a-hash" }).success).toBe(
      false,
    );
  });
  it("hashes object keys consistently without ignoring data differences", () => {
    expect(chartTemplateHash({ b: 2, a: 1 })).toBe(chartTemplateHash({ a: 1, b: 2 }));
    expect(chartTemplateHash({ a: 1 })).not.toBe(chartTemplateHash({ a: 2 }));
  });
});
