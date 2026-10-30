import { open, readFile } from "node:fs/promises";
import { z } from "zod";
import { sessionResponseSchema } from "../packages/contracts/src/auth/index.js";
import { createDatabasePool } from "../packages/db/src/index.js";
import { migrateExcelBankHierarchy } from "../packages/db/src/maintenance/excel-bank-hierarchy.js";
import { isExplicitlyNamedLocalUatDatabase } from "./uat-database-safety.js";

if (process.argv.includes("--help")) {
  console.log(
    "Usage: npm run finance:migrate-bank-hierarchy -- <reviewed-request.json> [--apply]\nRequired process variables: DATABASE_URL (maintenance administrator), NEXORA_API_BASE_URL, NEXORA_IMPORT_IDENTIFIER, NEXORA_IMPORT_PASSWORD. Apply additionally requires NEXORA_MAINTENANCE_BACKUP (verified custom-format dump). Local development databases only. No nominal creation or financial posting.",
  );
  process.exit(0);
}
const requestSchema = z
  .object({
    tenantId: z.string().min(1),
    companyId: z.string().min(1),
    templateId: z.string().min(1),
    sectionId: z.string().min(1),
    expectedSectionCode: z.string().min(1),
    expectedPolicyVersion: z.number().int().positive(),
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
const inputPath = process.argv[2];
const databaseUrl = process.env.DATABASE_URL,
  apiBase = process.env.NEXORA_API_BASE_URL,
  identifier = process.env.NEXORA_IMPORT_IDENTIFIER,
  password = process.env.NEXORA_IMPORT_PASSWORD;
if (!inputPath || !databaseUrl || !apiBase || !identifier || !password)
  throw new Error("Explicit reviewed request, local database/API and operator credentials required.");
const dbTarget = new URL(databaseUrl),
  apiTarget = new URL(apiBase);
for (const target of [dbTarget, apiTarget])
  if (!["127.0.0.1", "localhost", "[::1]"].includes(target.hostname))
    throw new Error("This controlled maintenance command is local-development only.");
if (!["postgres:", "postgresql:"].includes(dbTarget.protocol) || !["http:", "https:"].includes(apiTarget.protocol))
  throw new Error("Invalid database/API protocol.");
if (!isExplicitlyNamedLocalUatDatabase(databaseUrl))
  throw new Error("Explicit local source or isolated chart-template database required.");
const input = requestSchema.parse(JSON.parse(await readFile(inputPath, "utf8")));
const login = await fetch(new URL("/api/v1/auth/login", apiTarget), {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ identifier, password }),
  signal: AbortSignal.timeout(15000),
  redirect: "error",
});
if (!login.ok) throw new Error(`Operator authentication failed (${login.status}).`);
const session = sessionResponseSchema.parse(await login.json());
if (
  session.tenant_id !== input.tenantId ||
  session.impersonation ||
  !session.user.permissions.includes("finance.chart_template.admin")
)
  throw new Error("A non-impersonated template administrator in the requested tenant is required.");
const cookie = login.headers
  .getSetCookie()
  .map((item) => item.split(";")[0])
  .join("; ");
if (!cookie) throw new Error("No authenticated operator session.");
const preview = await fetch(
  new URL(
    `/api/v1/finance/chart_templates/${encodeURIComponent(input.templateId)}/company_preview?${new URLSearchParams({ company_id: input.companyId, currency: "USD", limit: "1" })}`,
    apiTarget,
  ),
  { headers: { cookie }, signal: AbortSignal.timeout(15000), redirect: "error" },
);
if (!preview.ok) throw new Error(`Company preview denied (${preview.status}); no maintenance attempted.`);
const apply = process.argv.includes("--apply");
if (!apply) {
  console.log(
    JSON.stringify({ mode: "preflight-only", ...input, actorId: session.user.id, companyDataChanged: false }),
  );
  process.exit(0);
}
const backupPath = process.env.NEXORA_MAINTENANCE_BACKUP;
if (!backupPath) throw new Error("A verified pre-maintenance custom-format backup is required.");
const backup = await open(backupPath, "r");
try {
  const header = Buffer.alloc(5);
  await backup.read(header, 0, 5, 0);
  if (header.toString("ascii") !== "PGDMP" || (await backup.stat()).size < 1024)
    throw new Error("Backup is not a nonempty PostgreSQL custom-format dump.");
} finally {
  await backup.close();
}
const pool = createDatabasePool(databaseUrl);
try {
  const result = await migrateExcelBankHierarchy(pool, { ...input, actorId: session.user.id });
  console.log(
    JSON.stringify({
      ...result,
      companyId: input.companyId,
      sectionCode: "2309",
      companyNominalsCreated: 0,
      financialPostingRequested: false,
    }),
  );
} finally {
  await pool.end();
}
