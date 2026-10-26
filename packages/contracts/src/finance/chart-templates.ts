import { z } from "zod";

const key = z.string().trim().min(1).max(128);
const label = z.string().trim().min(1).max(160);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const accountType = z.enum(["asset", "liability", "equity", "revenue", "expense"]);
const nodeKey = z.string().trim().min(1).max(140);
const sourceRow = z.strictObject({ source: key, row: z.number().int().min(1).max(1_000_000) });
export const importChartTemplateRequestSchema = z
  .strictObject({
    catalog_key: key,
    name: label,
    revision: key,
    source_filename: key,
    source_sha256: digest,
    categories: z
      .array(z.strictObject({ key, name: label, type: accountType }))
      .min(1)
      .max(100),
    sections: z
      .array(z.strictObject({ code: key, name: label, category_key: key }))
      .min(1)
      .max(1_000),
    nominals: z
      .array(
        z.strictObject({
          code: key,
          name: label,
          section_code: key,
          source_rows: z.array(sourceRow).min(1).max(100),
          review_note: z.string().max(2_000).optional(),
        }),
      )
      .min(1)
      .max(10_000),
  })
  .superRefine((input, ctx) => {
    const seen = new Set<string>();
    for (const [index, category] of input.categories.entries()) {
      if (seen.has(category.key))
        ctx.addIssue({ code: "custom", path: ["categories", index, "key"], message: "Duplicate category key." });
      seen.add(category.key);
    }
    const sections = new Set<string>();
    const codes = new Set<string>();
    for (const [index, section] of input.sections.entries()) {
      if (!seen.has(section.category_key))
        ctx.addIssue({ code: "custom", path: ["sections", index, "category_key"], message: "Unknown category." });
      if (codes.has(section.code))
        ctx.addIssue({ code: "custom", path: ["sections", index, "code"], message: "Duplicate section code." });
      sections.add(section.code);
      codes.add(section.code);
    }
    for (const [index, nominal] of input.nominals.entries()) {
      if (!sections.has(nominal.section_code))
        ctx.addIssue({ code: "custom", path: ["nominals", index, "section_code"], message: "Unknown section." });
      if (codes.has(nominal.code))
        ctx.addIssue({ code: "custom", path: ["nominals", index, "code"], message: "Duplicate catalog code." });
      codes.add(nominal.code);
      const references = nominal.source_rows.map((row) => `${row.source}:${row.row}`);
      if (new Set(references).size !== references.length)
        ctx.addIssue({
          code: "custom",
          path: ["nominals", index, "source_rows"],
          message: "Duplicate source occurrence.",
        });
    }
  });
export const chartTemplateQuerySchema = z.strictObject({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z
    .string()
    .regex(/^\d{1,7}$/)
    .optional(),
});
export const chartTemplateNodeQuerySchema = chartTemplateQuerySchema.extend({
  kind: z.enum(["category", "section", "nominal"]).optional(),
  parent_key: nodeKey.optional(),
  category_key: nodeKey.optional(),
  search: z.string().trim().max(160).optional(),
});
export const chartTemplateSummarySchema = z.strictObject({
  id: key,
  catalog_key: key,
  name: label,
  revision: key,
  state: z.enum(["draft", "published"]),
  version: z.number().int().positive(),
  source_filename: key,
  source_sha256: digest,
  content_sha256: digest,
  category_count: z.number().int().nonnegative(),
  section_count: z.number().int().nonnegative(),
  nominal_count: z.number().int().nonnegative(),
  created_at: z.string().datetime(),
  published_at: z.string().datetime().nullable(),
});
export const chartTemplateDirectorySchema = z.strictObject({
  items: z.array(chartTemplateSummarySchema),
  next_cursor: z.string().nullable(),
});
export const chartTemplateNodeSchema = z.strictObject({
  key: nodeKey,
  kind: z.enum(["category", "section", "nominal"]),
  code: key.nullable(),
  name: label,
  parent_key: nodeKey.nullable(),
  type: accountType,
  source_rows: z.array(sourceRow),
  review_note: z.string().nullable(),
});
export const chartTemplateNodesSchema = z.strictObject({
  items: z.array(chartTemplateNodeSchema),
  next_cursor: z.string().nullable(),
});
export const chartTemplateMutationSchema = z.strictObject({
  template: chartTemplateSummarySchema,
  audit_event_id: key,
  replayed: z.boolean(),
});
export const publishChartTemplateRequestSchema = z.strictObject({
  expected_version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});
export type ImportChartTemplateRequest = z.infer<typeof importChartTemplateRequestSchema>;
export type ChartTemplateQuery = z.infer<typeof chartTemplateQuerySchema>;
export type ChartTemplateNodeQuery = z.infer<typeof chartTemplateNodeQuerySchema>;
export type ChartTemplateSummary = z.infer<typeof chartTemplateSummarySchema>;
export type ChartTemplateDirectory = z.infer<typeof chartTemplateDirectorySchema>;
export type ChartTemplateNodes = z.infer<typeof chartTemplateNodesSchema>;
export type ChartTemplateMutation = z.infer<typeof chartTemplateMutationSchema>;
export type PublishChartTemplateRequest = z.infer<typeof publishChartTemplateRequestSchema>;

export const chartCompanyPreviewQuerySchema = chartTemplateQuerySchema.extend({
  company_id: key,
  currency: z.string().regex(/^[A-Z]{3}$/),
});
export const chartCompanyPreviewSchema = z.strictObject({
  template_id: key,
  template_version: z.number().int().positive(),
  company: z.strictObject({ id: key, code: key, name: z.string().min(1).max(200) }),
  currency: z.string().regex(/^[A-Z]{3}$/),
  preview_sha256: digest,
  adoption_id: key.nullable().optional(),
  blocked: z.boolean(),
  blocking_issues: z.array(z.strictObject({ code: key, name: label, message: z.string().max(500) })).max(100),
  totals: z.strictObject({
    categories_to_create: z.number().int().nonnegative(),
    sections_to_create: z.number().int().nonnegative(),
    nominal_drafts_to_create: z.number().int().nonnegative(),
    exact_matches: z.number().int().nonnegative(),
    conflicts: z.number().int().nonnegative(),
    bank_references: z.number().int().nonnegative(),
  }),
  items: z
    .array(
      z.strictObject({
        key: nodeKey,
        kind: z.enum(["category", "section", "nominal"]),
        code: key,
        name: label,
        status: z.enum(["create", "match", "conflict", "bank_setup_required"]),
        existing_account_id: key.nullable(),
        message: z.string().max(500),
      }),
    )
    .max(100),
  next_cursor: z.string().nullable(),
});
export type ChartCompanyPreviewQuery = z.infer<typeof chartCompanyPreviewQuerySchema>;
export type ChartCompanyPreview = z.infer<typeof chartCompanyPreviewSchema>;

export const adoptCompanyChartRequestSchema = z.strictObject({
  company_id: key,
  currency: z.string().regex(/^[A-Z]{3}$/),
  expected_template_version: z.number().int().positive(),
  preview_sha256: digest,
});
export const adoptCompanyChartResultSchema = z.strictObject({
  adoption_id: key,
  company_id: key,
  template_id: key,
  created_categories: z.number().int().nonnegative(),
  created_sections: z.number().int().nonnegative(),
  created_nominals: z.number().int().nonnegative(),
  matched_accounts: z.number().int().nonnegative(),
  bank_references: z.number().int().nonnegative(),
  audit_event_id: key,
  replayed: z.boolean(),
});
export const classifyChartNominalRequestSchema = z.strictObject({
  expected_version: z.number().int().positive(),
  classification: z.enum(["ordinary", "module_controlled"]),
  reason: z.string().trim().min(3).max(500),
});
export const classifyChartNominalResultSchema = z.strictObject({
  nominal_id: key,
  company_id: key,
  classification: z.enum(["ordinary", "module_controlled"]),
  version: z.number().int().positive(),
  review_version: z.number().int().positive(),
  audit_event_id: key,
  replayed: z.boolean(),
});
export type AdoptCompanyChartRequest = z.infer<typeof adoptCompanyChartRequestSchema>;
export type AdoptCompanyChartResult = z.infer<typeof adoptCompanyChartResultSchema>;
export type ClassifyChartNominalRequest = z.infer<typeof classifyChartNominalRequestSchema>;
export type ClassifyChartNominalResult = z.infer<typeof classifyChartNominalResultSchema>;
