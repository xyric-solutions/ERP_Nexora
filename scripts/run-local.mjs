// Start the existing local ERP services from this repository, regardless of caller cwd.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2];
if (!["api", "web", "worker"].includes(mode) || process.argv.slice(3).some((arg) => arg !== "--check")) {
  console.error("Usage: node scripts/run-local.mjs <api|web|worker> [--check]");
  process.exit(2);
}
process.chdir(root);
process.loadEnvFile(path.join(root, ".env"));
if (mode !== "web") {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be configured in the ERP environment.");
  let database;
  try {
    database = new URL(process.env.DATABASE_URL);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
  }
  // Preserve the local Docker port mappings previously used by run-nexora.cjs.
  database.hostname = "127.0.0.1";
  database.port = "55435";
  process.env.DATABASE_URL = database.toString();
  process.env.REDIS_URL = "redis://127.0.0.1:56380";
  process.env.S3_ENDPOINT = "http://127.0.0.1:59000";
  process.env.API_HOST = "127.0.0.1";
}
const args =
  mode === "web"
    ? ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3000"]
    : [mode === "api" ? "server/api/dist/server.js" : "server/worker/dist/worker.js"];
if (process.argv.includes("--check")) {
  console.log(JSON.stringify({ root, mode, entry: args[0], configurationLoaded: true }));
} else {
  const child = spawn(process.execPath, args, { cwd: root, env: process.env, stdio: "inherit" });
  child.on("error", (error) => {
    console.error("ERP service could not start:", error.code);
    process.exitCode = 1;
  });
  child.on("exit", (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
}
