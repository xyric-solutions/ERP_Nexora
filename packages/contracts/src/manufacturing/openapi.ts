export function manufacturingPaths() {
  const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
  const response = (name: string) => ({
    description: "Company-authorized Manufacturing data",
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
  const company = {
    in: "query",
    name: "company_id",
    required: true,
    schema: { type: "string", minLength: 1, maxLength: 128 },
  };
  const id = { in: "path", name: "id", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } };
  const filter = (name: string, maxLength = 160) => ({ in: "query", name, schema: { type: "string", maxLength } });
  const limit = { in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: 100, default: 30 } };
  const surface = (values = ["boms", "plans", "orders"], required = true) => ({
    in: "query",
    name: "surface",
    required,
    schema: { type: "string", enum: values },
  });
  const state = {
    in: "query",
    name: "state",
    schema: { type: "string", enum: ["draft", "converted", "submitted", "returned", "approved"] },
  };
  const read = (operationId: string, name: string, parameters: unknown[] = []) => ({
    operationId,
    security: [{ cookieAuth: [] }],
    parameters,
    responses: { "200": response(name), ...errors },
  });
  const write = (operationId: string, input: string, output: string, create = false, versioned = !create) => ({
    operationId,
    security: [{ cookieAuth: [] }],
    parameters: [
      ...(create ? [] : [id]),
      ...(versioned ? [{ in: "header", name: "if-match", required: true, schema: { type: "string" } }] : []),
      { in: "header", name: "x-csrf-token", required: true, schema: { type: "string" } },
      { in: "header", name: "idempotency-key", required: true, schema: { type: "string", maxLength: 255 } },
    ],
    requestBody: { required: true, content: { "application/json": { schema: ref(input) } } },
    responses: { [create ? "201" : "200"]: response(output), ...errors },
  });
  const directory = [company, filter("search"), state, filter("cursor", 1024), limit];
  return {
    "/manufacturing/material-balance": {
      get: read("getManufacturingMaterialBalance", "MaterialBalance", [
        company,
        surface(),
        { in: "query", name: "product_id", required: true, schema: { type: "string", maxLength: 128 } },
        { in: "query", name: "warehouse_id", schema: { type: "string", maxLength: 128 } },
        { in: "query", name: "as_of", schema: { type: "string", format: "date" } },
      ]),
    },
    "/manufacturing/requirements": {
      get: read("getManufacturingRequirements", "RequirementsPreview", [
        company,
        surface(),
        ...["product_id", "quantity"].map((name) => ({
          in: "query",
          name,
          required: true,
          schema: { type: "string", maxLength: 128 },
        })),
        { in: "query", name: "bom_version", schema: { type: "integer", minimum: 1 } },
        { in: "query", name: "warehouse_id", schema: { type: "string", maxLength: 128 } },
        { in: "query", name: "as_of", schema: { type: "string", format: "date" } },
      ]),
    },
    "/manufacturing/products/{id}/units": {
      get: read("getManufacturingProductUnits", "ProductUnits", [company, id, surface()]),
    },
    "/manufacturing/companies": { get: read("listManufacturingCompanies", "ManufacturingCompanies", [surface()]) },
    "/manufacturing/lookups": {
      get: read("listManufacturingLookups", "ManufacturingLookupDirectory", [
        company,
        surface(),
        {
          in: "query",
          name: "kind",
          required: true,
          schema: {
            type: "string",
            enum: [
              "finished_product",
              "component",
              "non_stock",
              "warehouse",
              "expense",
              "currency",
              "project",
              "location",
            ],
          },
        },
        filter("search"),
        filter("cursor", 1024),
        limit,
      ]),
    },
    "/manufacturing/boms": {
      get: read("listBoms", "BomDirectory", directory),
      post: write("createBom", "BomInput", "BomMutation", true),
    },
    "/manufacturing/boms/{id}": {
      get: read("getBom", "Bom", [id, company]),
      patch: write("updateBom", "UpdateBomInput", "BomMutation"),
    },
    "/manufacturing/boms/by-product/{productId}": {
      get: read("getBomByProduct", "Bom", [
        { in: "path", name: "productId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
        company,
        surface(),
      ]),
    },
    "/manufacturing/plans": {
      get: read("listProductionPlans", "ProductionPlanDirectory", directory),
      post: write("createProductionPlan", "ProductionPlanInput", "ProductionPlanMutation", true),
    },
    "/manufacturing/plans/{id}": {
      get: read("getProductionPlan", "ProductionPlan", [id, company]),
      patch: write("updateProductionPlan", "UpdateProductionPlanInput", "ProductionPlanMutation"),
    },
    "/manufacturing/plans/{id}/convert": {
      post: write("convertProductionPlan", "ConvertProductionPlanInput", "ConvertProductionPlanResult", false, true),
    },
    "/manufacturing/orders": {
      get: read("listManufacturingOrders", "ManufacturingOrderDirectory", directory),
      post: write("createManufacturingOrder", "ManufacturingOrderInput", "ManufacturingOrderMutation", true),
    },
    "/manufacturing/orders/{id}": {
      get: read("getManufacturingOrder", "ManufacturingOrder", [id, company]),
      patch: write("updateManufacturingOrder", "UpdateManufacturingOrderInput", "ManufacturingOrderMutation"),
    },
    "/manufacturing/orders/{id}/actions": {
      post: write("actOnManufacturingOrder", "ManufacturingOrderAction", "ManufacturingOrderMutation", false, true),
    },
  };
}
