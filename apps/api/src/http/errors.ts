import type { ErrorRequestHandler, RequestHandler } from "express";

import type { ProblemDetails } from "@nexora/contracts";
import type { Logger } from "pino";
import { ZodError } from "zod";

import { currentRequestContext } from "./request-context.js";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound: RequestHandler = (req, res) => {
  const problem: ProblemDetails = {
    type: "https://nexora.example/problems/not-found",
    title: "Not found",
    status: 404,
    detail: "The requested resource does not exist.",
    instance: req.originalUrl,
    correlationId: currentRequestContext().correlationId,
    code: "NOT_FOUND",
  };
  res.status(404).type("application/problem+json").json(problem);
};

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, req, res, _next) => {
    void _next;
    const context = currentRequestContext();
    const known = error instanceof HttpError;
    const validation = error instanceof ZodError;
    const safeMessage = error instanceof Error ? error.message : "Request failed";
    const status = known ? error.status : validation ? 400 : 500;
    const code = known ? error.code : validation ? "INVALID_REQUEST" : "INTERNAL_ERROR";
    logger[status >= 500 ? "error" : "warn"](
      { error, correlationId: context.correlationId, path: req.path },
      "request failed",
    );
    const problem: ProblemDetails = {
      type: `https://nexora.example/problems/${code.toLowerCase().replaceAll("_", "-")}`,
      title: status === 500 ? "Internal server error" : validation ? "Invalid request" : safeMessage,
      status,
      detail:
        status === 500
          ? "The request could not be completed."
          : validation
            ? "The request did not match the API contract."
            : safeMessage,
      instance: req.originalUrl,
      correlationId: context.correlationId,
      code,
    };
    res.status(status).type("application/problem+json").json(problem);
  };
}
