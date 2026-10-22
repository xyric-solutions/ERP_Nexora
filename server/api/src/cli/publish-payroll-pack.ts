import { createDatabasePool } from "@nexora/db";
import { publishApprovedStatutoryPack } from "../modules/hr/payroll-statutory-publisher.js";
async function main() {
  const args = process.argv.slice(2),
    allowed = new Set(["--tenant", "--company", "--request", "--artifact-hash", "--allow-synthetic"]);
  const values = new Map<string, string>();
  let allowSynthetic = false;
  for (let i = 0; i < args.length; i++) {
    const key = args[i]!;
    if (!allowed.has(key)) throw Error("Unknown publisher argument.");
    if (key === "--allow-synthetic") {
      allowSynthetic = true;
      continue;
    }
    const value = args[++i];
    if (!value || value.startsWith("--") || values.has(key))
      throw Error("Each required publisher argument must be supplied once.");
    values.set(key, value);
  }
  const tenant = values.get("--tenant"),
    company = values.get("--company"),
    requestId = values.get("--request"),
    artifactHash = values.get("--artifact-hash");
  if (
    !tenant ||
    !company ||
    !requestId ||
    !artifactHash ||
    ![tenant, company, requestId].every((v) => v.length <= 128) ||
    !/^[a-f0-9]{64}$/.test(artifactHash)
  )
    throw Error(
      "Usage: publish-payroll-pack --tenant ID --company ID --request ID --artifact-hash SHA256 [--allow-synthetic]",
    );
  if (!process.env.DATABASE_PUBLISHER_URL)
    throw Error(
      "Set DATABASE_PUBLISHER_URL for a registered localization publisher. No API database fallback is used.",
    );
  const pool = createDatabasePool(process.env.DATABASE_PUBLISHER_URL);
  try {
    const result = await publishApprovedStatutoryPack(pool, {
      tenant,
      company,
      requestId,
      artifactHash,
      allowSynthetic,
    });
    process.stdout.write(JSON.stringify(result) + "\n");
  } finally {
    await pool.end();
  }
}
main().catch((error) => {
  process.stderr.write((error instanceof Error ? error.message : "Statutory publication failed.") + "\n");
  process.exitCode = 1;
});
