import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

export interface RequestContext {
  correlationId: string;
  startedAt: number;
}

const storage = new AsyncLocalStorage<RequestContext>();
const correlationPattern = /^[A-Za-z0-9._:-]{1,100}$/;

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const proposed = req.header("x-correlation-id");
  const correlationId = proposed && correlationPattern.test(proposed) ? proposed : randomUUID();
  res.setHeader("x-correlation-id", correlationId);
  storage.run({ correlationId, startedAt: performance.now() }, next);
}

export function currentRequestContext(): RequestContext {
  const context = storage.getStore();
  if (!context) throw new Error("Request context is unavailable");
  return context;
}
