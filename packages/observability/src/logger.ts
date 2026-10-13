import pino, { type DestinationStream, type Logger } from "pino";

const sensitiveKey =
  /(password|passphrase|secret|token|authorization|cookie|cnic|national.?id|bank|account.?number|iban|salary|compensation|recovery.?code)/i;

export function redactSensitive(value: unknown, seen = new WeakSet<object>()): unknown {
  if (Array.isArray(value)) return value.map((entry) => redactSensitive(entry, seen));
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      sensitiveKey.test(key) ? "[Redacted]" : redactSensitive(entry, seen),
    ]),
  );
}

export function createLogger(destination?: DestinationStream): Logger {
  return pino(
    {
      level: process.env.LOG_LEVEL ?? "info",
      base: { service: process.env.SERVICE_NAME ?? "nexora" },
      formatters: { log: (object) => redactSensitive(object) as Record<string, unknown> },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    destination,
  );
}
