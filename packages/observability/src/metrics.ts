import { Counter, Histogram, Registry, collectDefaultMetrics } from "@prometheus-io/client";

export function createMetrics() {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: "nexora_" });
  const httpRequests = new Counter({
    name: "nexora_http_requests_total",
    help: "HTTP requests received",
    labelNames: ["method", "route", "status"] as const,
    registers: [registry],
  });
  const httpDuration = new Histogram({
    name: "nexora_http_request_duration_seconds",
    help: "HTTP request duration",
    labelNames: ["method", "route", "status"] as const,
    registers: [registry],
  });
  return { registry, httpRequests, httpDuration };
}

export type Metrics = ReturnType<typeof createMetrics>;
