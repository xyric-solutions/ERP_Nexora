export function fleetPaths() {
  const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
  const response = (name: string) => ({
    description: "Company-authorized Fleet data",
    content: { "application/json": { schema: ref(name) } },
  });
  const errors = Object.fromEntries(
    [400, 401, 403, 404, 409, 412, 503].map((code) => [
      String(code),
      {
        description: "Standard problem response",
        content: { "application/problem+json": { schema: ref("ProblemDetails") } },
      },
    ]),
  );
  const pathId = (name: string) => ({
    in: "path",
    name,
    required: true,
    schema: { type: "string", minLength: 1, maxLength: 128 },
  });
  const id = pathId("id");
  const toolId = pathId("toolId");
  const company = {
    in: "query",
    name: "company_id",
    required: true,
    schema: { type: "string", minLength: 1, maxLength: 128 },
  };
  const filter = (name: string, maxLength = 160) => ({ in: "query", name, schema: { type: "string", maxLength } });
  const dateFilter = (name: string) => ({ in: "query", name, schema: { type: "string", format: "date" } });
  const limit = { in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: 100, default: 30 } };
  const read = (operationId: string, name: string, parameters: unknown[] = []) => ({
    operationId,
    security: [{ cookieAuth: [] }],
    parameters,
    responses: { "200": response(name), ...errors },
  });
  const write = (operationId: string, input: string, output: string, pathParams: unknown[], versioned: boolean) => ({
    operationId,
    security: [{ cookieAuth: [] }],
    parameters: [
      ...pathParams,
      ...(versioned ? [{ in: "header", name: "if-match", required: true, schema: { type: "string" } }] : []),
      { in: "header", name: "x-csrf-token", required: true, schema: { type: "string" } },
      { in: "header", name: "idempotency-key", required: true, schema: { type: "string", maxLength: 255 } },
    ],
    requestBody: { required: true, content: { "application/json": { schema: ref(input) } } },
    responses: { [versioned ? "200" : "201"]: response(output), ...errors },
  });
  const directory = [company, filter("search"), filter("vehicle_id", 128), filter("cursor", 1024), limit];
  return {
    "/fleet/companies": { get: read("listFleetCompanies", "FleetCompanies") },
    "/fleet/lookups": {
      get: read("listFleetLookups", "FleetLookupDirectory", [
        company,
        {
          in: "query",
          name: "kind",
          required: true,
          schema: { type: "string", enum: ["vehicle", "driver", "employee", "supplier"] },
        },
        filter("search"),
        limit,
      ]),
    },
    "/fleet/vehicles": {
      get: read("listFleetVehicles", "FleetVehicleDirectory", directory),
      post: write("createFleetVehicle", "FleetVehicleInput", "FleetVehicleMutation", [], false),
    },
    "/fleet/vehicles/{id}": {
      get: read("getFleetVehicle", "FleetVehicle", [id, company]),
      patch: write("updateFleetVehicle", "UpdateFleetVehicleInput", "FleetVehicleMutation", [id], true),
    },
    "/fleet/vehicles/{id}/tools": {
      get: read("listFleetVehicleTools", "FleetToolList", [id, company]),
      post: write("createFleetVehicleTool", "FleetToolInput", "FleetToolMutation", [id], false),
    },
    "/fleet/vehicles/{id}/tools/{toolId}": {
      patch: write("updateFleetVehicleTool", "UpdateFleetToolInput", "FleetToolMutation", [id, toolId], true),
    },
    "/fleet/drivers": {
      get: read("listFleetDrivers", "FleetDriverDirectory", directory),
      post: write("createFleetDriver", "FleetDriverInput", "FleetDriverMutation", [], false),
    },
    "/fleet/drivers/{id}": {
      get: read("getFleetDriver", "FleetDriver", [id, company]),
      patch: write("updateFleetDriver", "UpdateFleetDriverInput", "FleetDriverMutation", [id], true),
    },
    "/fleet/fuel": {
      get: read("listFleetFuelEntries", "FleetFuelDirectory", directory),
      post: write("createFleetFuelEntry", "FleetFuelEntryInput", "FleetFuelMutation", [], false),
    },
    "/fleet/maintenance": {
      get: read("listFleetMaintenanceEntries", "FleetMaintenanceDirectory", directory),
      post: write("createFleetMaintenanceEntry", "FleetMaintenanceInput", "FleetMaintenanceMutation", [], false),
    },
    "/fleet/reports/fuel-efficiency": {
      get: read("getFleetFuelEfficiency", "FleetFuelEfficiencyReport", [company, dateFilter("from"), dateFilter("to")]),
    },
  };
}
