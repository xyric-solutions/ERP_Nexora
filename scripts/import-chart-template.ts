import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  importChartTemplateRequestSchema,
  chartTemplateMutationSchema,
  chartTemplateSummarySchema,
} from "../packages/contracts/src/finance/chart-templates.js";

// Operational client: authenticates through the normal API; never connects to PostgreSQL.
if (process.argv.includes("--help")) {
  console.log(
    "Usage: npm run finance:import-chart-template -- <manifest.json>\nRequired process variables: NEXORA_API_BASE_URL, NEXORA_IMPORT_IDENTIFIER, NEXORA_IMPORT_PASSWORD.\nOptional: NEXORA_PUBLISH_CHART_TEMPLATE=true publishes reference definitions only. No company adoption.",
  );
  process.exit(0);
}
const base = process.env.NEXORA_API_BASE_URL,
  identifier = process.env.NEXORA_IMPORT_IDENTIFIER,
  password = process.env.NEXORA_IMPORT_PASSWORD,
  manifestPath = process.argv[2];
if (!base || !identifier || !password || !manifestPath)
  throw new Error("Explicit API base URL, import credentials and manifest path are required.");
const target = new URL(base);
if (
  target.protocol !== "https:" &&
  !(target.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(target.hostname))
)
  throw new Error("Use HTTPS or an explicit loopback development API.");
const input = importChartTemplateRequestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
const login = await fetch(new URL("/api/v1/auth/login", target), {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ identifier, password }),
});
if (!login.ok) throw new Error(`Authentication failed (${login.status}); no catalog import attempted.`);
const body: unknown = await login.json();
if (!body || typeof body !== "object" || !("csrf_token" in body) || typeof body.csrf_token !== "string")
  throw new Error("Complete interactive authentication before importing this catalog.");
const csrfToken = body.csrf_token;
const cookie = login.headers
  .getSetCookie()
  .map((value) => value.split(";")[0])
  .join("; ");
if (!cookie) throw new Error("No API session established.");
async function request(path: string, method = "GET", payload?: unknown, key?: string, version?: number) {
  const response = await fetch(new URL(path, target), {
    method,
    headers: {
      cookie,
      "content-type": "application/json",
      "x-csrf-token": csrfToken,
      ...(key ? { "idempotency-key": key } : {}),
      ...(version ? { "if-match": `"${version}"` } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  if (!response.ok) {
    const problem: unknown = await response.json().catch(() => null);
    const code =
      problem && typeof problem === "object" && "code" in problem && typeof problem.code === "string"
        ? problem.code
        : "REQUEST_FAILED";
    throw new Error(`Catalog API failed: ${response.status} ${code}. No credentials or response payload logged.`);
  }
  return response.json();
}
const digest = createHash("sha256").update(JSON.stringify(input)).digest("hex");
const imported = chartTemplateMutationSchema.parse(
  await request("/api/v1/finance/chart_templates", "POST", input, `chart-import-${digest}`),
);
let result = imported;
if (process.env.NEXORA_PUBLISH_CHART_TEMPLATE === "true")
  result = chartTemplateMutationSchema.parse(
    await request(
      `/api/v1/finance/chart_templates/${encodeURIComponent(imported.template.id)}/publish`,
      "POST",
      { expected_version: 1 },
      `chart-publish-${digest}`,
      1,
    ),
  );
const verified = chartTemplateSummarySchema.parse(
  await request(`/api/v1/finance/chart_templates/${encodeURIComponent(result.template.id)}`),
);
console.log(
  JSON.stringify({
    id: verified.id,
    state: verified.state,
    categories: verified.category_count,
    sections: verified.section_count,
    nominals: verified.nominal_count,
    import_replayed: imported.replayed,
    publish_replayed: result.replayed,
    company_adoption_requested: false,
  }),
);
