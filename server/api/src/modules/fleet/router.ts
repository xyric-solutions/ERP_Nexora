import { Router, type Request } from "express";
import { z } from "zod";
import {
  fleetDirectoryQuerySchema,
  fleetDriverInputSchema,
  fleetFuelEfficiencyQuerySchema,
  fleetFuelEntryInputSchema,
  fleetLookupQuerySchema,
  fleetMaintenanceInputSchema,
  fleetRecordQuerySchema,
  fleetToolInputSchema,
  fleetVehicleInputSchema,
  updateFleetDriverInputSchema,
  updateFleetToolInputSchema,
  updateFleetVehicleInputSchema,
} from "@nexora/contracts";
import { HttpError } from "../../http/errors.js";
import { currentRequestContext } from "../../http/request-context.js";
import { loadBankingSessionContext, type BankingSessionContextDependencies } from "../banking/session-context.js";
import { FleetError, type SourceFleetRepository } from "./source-repository.js";

export type FleetRepository = Pick<
  SourceFleetRepository,
  | "companies"
  | "lookups"
  | "vehicles"
  | "getVehicle"
  | "saveVehicle"
  | "tools"
  | "saveTool"
  | "drivers"
  | "getDriver"
  | "saveDriver"
  | "fuel"
  | "createFuel"
  | "maintenance"
  | "createMaintenance"
  | "fuelEfficiency"
>;
const identity = z.string().trim().min(1).max(128);

export function createFleetRouter(
  dependencies: BankingSessionContextDependencies & {
    repository: FleetRepository;
    allowedOrigins: ReadonlySet<string>;
  },
) {
  const router = Router();
  const { repository } = dependencies;
  router.use((_req, res, next) => {
    res.setHeader("cache-control", "no-store");
    next();
  });
  const handle = async <T>(work: () => Promise<T>) => {
    try {
      return await work();
    } catch (error) {
      if (error instanceof FleetError) throw new HttpError(error.status, error.code, error.message);
      throw error;
    }
  };
  function mutation(req: Request, version?: number) {
    const origin = req.get("origin"),
      key = req.get("idempotency-key");
    if (origin && !dependencies.allowedOrigins.has(origin))
      throw new HttpError(403, "ORIGIN_VALIDATION_FAILED", "Request origin validation failed.");
    if (!key) throw new HttpError(400, "IDEMPOTENCY_KEY_REQUIRED", "An idempotency key is required.");
    if (version !== undefined && req.get("if-match") !== `"${version}"`)
      throw new HttpError(412, "FLEET_PRECONDITION_FAILED", "Supply the quoted current version in If-Match.");
    return key;
  }
  const correlation = () => currentRequestContext().correlationId;
  const param = (req: Request, name: string) => identity.parse(req.params[name]);

  router.get("/companies", async (req, res) => {
    const ctx = await loadBankingSessionContext(req, dependencies);
    res.json(await handle(() => repository.companies(ctx)));
  });
  router.get("/lookups", async (req, res) => {
    const query = fleetLookupQuerySchema.parse(req.query),
      ctx = await loadBankingSessionContext(req, dependencies);
    res.json(await handle(() => repository.lookups(ctx, query)));
  });

  router.get("/vehicles", async (req, res) => {
    const query = fleetDirectoryQuerySchema.parse(req.query),
      ctx = await loadBankingSessionContext(req, dependencies);
    res.json(await handle(() => repository.vehicles(ctx, query)));
  });
  router.get("/vehicles/:id", async (req, res) => {
    const query = fleetRecordQuerySchema.parse(req.query),
      ctx = await loadBankingSessionContext(req, dependencies);
    const record = await handle(() => repository.getVehicle(ctx, query.company_id, param(req, "id")));
    res.setHeader("etag", `"${record.version}"`).json(record);
  });
  router.post("/vehicles", async (req, res) => {
    const input = fleetVehicleInputSchema.parse(req.body),
      key = mutation(req),
      ctx = await loadBankingSessionContext(req, dependencies, true);
    const result = await handle(() => repository.saveVehicle(ctx, null, input, key, correlation()));
    res.status(201).setHeader("etag", `"${result.record.version}"`).json(result);
  });
  router.patch("/vehicles/:id", async (req, res) => {
    const input = updateFleetVehicleInputSchema.parse(req.body),
      key = mutation(req, input.expected_version),
      ctx = await loadBankingSessionContext(req, dependencies, true);
    const result = await handle(() => repository.saveVehicle(ctx, param(req, "id"), input, key, correlation()));
    res.setHeader("etag", `"${result.record.version}"`).json(result);
  });

  router.get("/vehicles/:id/tools", async (req, res) => {
    const query = fleetRecordQuerySchema.parse(req.query),
      ctx = await loadBankingSessionContext(req, dependencies);
    res.json(await handle(() => repository.tools(ctx, query.company_id, param(req, "id"))));
  });
  router.post("/vehicles/:id/tools", async (req, res) => {
    const input = fleetToolInputSchema.parse(req.body),
      key = mutation(req),
      ctx = await loadBankingSessionContext(req, dependencies, true);
    const result = await handle(() => repository.saveTool(ctx, param(req, "id"), null, input, key, correlation()));
    res.status(201).setHeader("etag", `"${result.record.version}"`).json(result);
  });
  router.patch("/vehicles/:id/tools/:toolId", async (req, res) => {
    const input = updateFleetToolInputSchema.parse(req.body),
      key = mutation(req, input.expected_version),
      ctx = await loadBankingSessionContext(req, dependencies, true);
    const result = await handle(() =>
      repository.saveTool(ctx, param(req, "id"), param(req, "toolId"), input, key, correlation()),
    );
    res.setHeader("etag", `"${result.record.version}"`).json(result);
  });

  router.get("/drivers", async (req, res) => {
    const query = fleetDirectoryQuerySchema.parse(req.query),
      ctx = await loadBankingSessionContext(req, dependencies);
    res.json(await handle(() => repository.drivers(ctx, query)));
  });
  router.get("/drivers/:id", async (req, res) => {
    const query = fleetRecordQuerySchema.parse(req.query),
      ctx = await loadBankingSessionContext(req, dependencies);
    const record = await handle(() => repository.getDriver(ctx, query.company_id, param(req, "id")));
    res.setHeader("etag", `"${record.version}"`).json(record);
  });
  router.post("/drivers", async (req, res) => {
    const input = fleetDriverInputSchema.parse(req.body),
      key = mutation(req),
      ctx = await loadBankingSessionContext(req, dependencies, true);
    const result = await handle(() => repository.saveDriver(ctx, null, input, key, correlation()));
    res.status(201).setHeader("etag", `"${result.record.version}"`).json(result);
  });
  router.patch("/drivers/:id", async (req, res) => {
    const input = updateFleetDriverInputSchema.parse(req.body),
      key = mutation(req, input.expected_version),
      ctx = await loadBankingSessionContext(req, dependencies, true);
    const result = await handle(() => repository.saveDriver(ctx, param(req, "id"), input, key, correlation()));
    res.setHeader("etag", `"${result.record.version}"`).json(result);
  });

  router.get("/fuel", async (req, res) => {
    const query = fleetDirectoryQuerySchema.parse(req.query),
      ctx = await loadBankingSessionContext(req, dependencies);
    res.json(await handle(() => repository.fuel(ctx, query)));
  });
  router.post("/fuel", async (req, res) => {
    const input = fleetFuelEntryInputSchema.parse(req.body),
      key = mutation(req),
      ctx = await loadBankingSessionContext(req, dependencies, true);
    res.status(201).json(await handle(() => repository.createFuel(ctx, input, key, correlation())));
  });

  router.get("/maintenance", async (req, res) => {
    const query = fleetDirectoryQuerySchema.parse(req.query),
      ctx = await loadBankingSessionContext(req, dependencies);
    res.json(await handle(() => repository.maintenance(ctx, query)));
  });
  router.post("/maintenance", async (req, res) => {
    const input = fleetMaintenanceInputSchema.parse(req.body),
      key = mutation(req),
      ctx = await loadBankingSessionContext(req, dependencies, true);
    res.status(201).json(await handle(() => repository.createMaintenance(ctx, input, key, correlation())));
  });

  router.get("/reports/fuel-efficiency", async (req, res) => {
    const query = fleetFuelEfficiencyQuerySchema.parse(req.query),
      ctx = await loadBankingSessionContext(req, dependencies);
    res.json(await handle(() => repository.fuelEfficiency(ctx, query)));
  });
  return router;
}
