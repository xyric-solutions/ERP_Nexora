export function inventoryPaths() {
  const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
  const response = (name: string) => ({
    description: "Company-authorized persisted product data",
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
  const read = (operationId: string, name: string, parameters: unknown[] = []) => ({
    operationId,
    security: [{ cookieAuth: [] }],
    parameters,
    responses: { "200": response(name), ...errors },
  });
  const write = (operationId: string, input: string, create = false, output = "ProductMutation") => ({
    operationId,
    security: [{ cookieAuth: [] }],
    parameters: [
      ...(create ? [] : [id, { in: "header", name: "if-match", required: true, schema: { type: "string" } }]),
      { in: "header", name: "x-csrf-token", required: true, schema: { type: "string" } },
      { in: "header", name: "idempotency-key", required: true, schema: { type: "string", maxLength: 255 } },
    ],
    requestBody: { required: true, content: { "application/json": { schema: ref(input) } } },
    responses: { [create ? "201" : "200"]: response(output), ...errors },
  });
  return {
    "/inventory/companies": {
      get: read("listInventoryCompanies", "InventoryCompanies", [
        {
          in: "query",
          name: "surface",
          schema: { type: "string", enum: ["products", "warehouses", "transfers"], default: "products" },
        },
      ]),
    },
    "/inventory/options": { get: read("getInventoryOptions", "InventoryOptions", [company]) },
    "/inventory/lookups": {
      get: read("listProductLookups", "ProductLookupDirectory", [
        company,
        {
          in: "query",
          name: "kind",
          required: true,
          schema: {
            type: "string",
            enum: [
              "supplier",
              "stock_account",
              "income_account",
              "expense_account",
              "location",
              "warehouse",
              "product",
            ],
          },
        },
        {
          in: "query",
          name: "surface",
          schema: { type: "string", enum: ["products", "warehouses", "transfers"], default: "products" },
        },
        filter("search"),
        filter("cursor", 1024),
        limit,
      ]),
    },
    "/inventory/products": {
      get: read("listProducts", "ProductDirectory", [
        company,
        filter("search"),
        { in: "query", name: "type", schema: { type: "string", enum: ["goods", "service"] } },
        { in: "query", name: "status", schema: { type: "string", enum: ["active", "inactive"] } },
        filter("category", 120),
        filter("cursor", 1024),
        limit,
      ]),
      post: write("createProduct", "ProductInput", true),
    },
    "/inventory/products/{id}": {
      get: read("getProduct", "Product", [id, company]),
      patch: write("updateProduct", "UpdateProductInput"),
    },
    "/inventory/warehouses": {
      get: read("listWarehouses", "WarehouseDirectory", [
        company,
        filter("search"),
        { in: "query", name: "status", schema: { type: "string", enum: ["active", "inactive"] } },
        filter("cursor", 1024),
        limit,
      ]),
      post: write("createWarehouse", "WarehouseInput", true, "WarehouseMutation"),
    },
    "/inventory/warehouses/{id}": {
      get: read("getWarehouse", "Warehouse", [id, company]),
      patch: write("updateWarehouse", "UpdateWarehouseInput", false, "WarehouseMutation"),
    },
    "/inventory/transfers": {
      get: read("listStockTransfers", "StockTransferDirectory", [
        company,
        filter("search"),
        filter("cursor", 1024),
        limit,
      ]),
      post: write("createStockTransfer", "StockTransferInput", true, "StockTransferMutation"),
    },
    "/inventory/transfers/{id}": {
      get: read("getStockTransfer", "StockTransfer", [id, company]),
      patch: write("updateStockTransfer", "UpdateStockTransferInput", false, "StockTransferMutation"),
    },
  };
}
