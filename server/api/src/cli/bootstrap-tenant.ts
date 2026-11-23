import { createDatabasePool } from "@nexora/db";
import {
  bootstrapTenant,
  readTenantBootstrapConfig,
  TenantBootstrapError,
} from "../modules/administration/operator-tenant-bootstrap.js";

try {
  const checkOnly = process.argv.includes("--check");
  if (checkOnly && process.env.NEXORA_BOOTSTRAP_ENABLED !== "true") {
    console.log(JSON.stringify({ status: "disabled" }));
  } else {
    const config = readTenantBootstrapConfig();
    if (checkOnly) {
      console.log(
        JSON.stringify({
          status: "configured",
          tenantId: config.tenantId,
          credentialEmailConfigured: config.emailDelivery !== null,
        }),
      );
    } else {
      const pool = createDatabasePool(config.databaseUrl);
      try {
        console.log(JSON.stringify(await bootstrapTenant(pool, config)));
      } finally {
        await pool.end();
      }
    }
  }
} catch (error) {
  const code = (error as { code?: unknown }).code;
  console.error(
    error instanceof TenantBootstrapError
      ? error.message
      : `Tenant bootstrap failed${typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? ` (${code})` : ""}`,
  );
  process.exitCode = 1;
}
