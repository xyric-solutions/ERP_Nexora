import type { RequestHandler } from "express";
import type { Logger } from "pino";

import type { Metrics } from "@nexora/observability";

import { currentRequestContext } from "./request-context.js";

export function requestLogging(logger: Logger, metrics: Metrics): RequestHandler {
  return (req, res, next) => {
    const context = currentRequestContext();
    res.on("finish", () => {
      const route = req.route?.path ? String(req.route.path) : req.path;
      const labels = { method: req.method, route, status: String(res.statusCode) };
      metrics.httpRequests.inc(labels);
      metrics.httpDuration.observe(labels, (performance.now() - context.startedAt) / 1000);
      logger.info({ ...labels, correlationId: context.correlationId }, "request completed");
    });
    next();
  };
}
