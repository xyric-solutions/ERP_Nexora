// Starts the established synthetic Banking API fixture with the additional
// feature permissions selected by the parent harness. The parent owns the
// validated random database and object-storage namespace lifecycle.
if (process.env.NEXORA_BANK_REVALUATION_E2E !== "true") process.env.NEXORA_BANK_RECONCILIATION_E2E = "true";
await import("./run-bank-context-e2e-api.js");
