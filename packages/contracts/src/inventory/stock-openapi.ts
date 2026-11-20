export function stockPaths() {
  const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
  const company = { in: "query", name: "company_id", required: true, schema: { type: "string", maxLength: 128 } };
  const identity = { in: "path", name: "id", required: true, schema: { type: "string", maxLength: 128 } };
  const errors = Object.fromEntries(
    [400, 401, 403, 404, 409, 412, 503].map((code) => [
      String(code),
      {
        description: "Standard problem response",
        content: { "application/problem+json": { schema: ref("ProblemDetails") } },
      },
    ]),
  );
  const response = (name: string) => ({
    description: "Authorized persisted stock and accounting evidence",
    content: { "application/json": { schema: ref(name) } },
  });
  const read = (operationId: string, name: string, parameters: unknown[]) => ({
    operationId,
    security: [{ cookieAuth: [] }],
    parameters,
    responses: { "200": response(name), ...errors },
  });
  const write = (
    operationId: string,
    input: string,
    output: string,
    pathId = false,
    version = true,
    create = false,
  ) => ({
    operationId,
    security: [{ cookieAuth: [] }],
    parameters: [
      ...(pathId ? [identity] : []),
      { in: "header", name: "x-csrf-token", required: true, schema: { type: "string" } },
      { in: "header", name: "idempotency-key", required: true, schema: { type: "string", maxLength: 255 } },
      ...(version ? [{ in: "header", name: "if-match", required: true, schema: { type: "string" } }] : []),
    ],
    requestBody: { required: true, content: { "application/json": { schema: ref(input) } } },
    responses: { [create ? "201" : "200"]: response(output), ...errors },
  });
  const text = (name: string) => ({ in: "query", name, schema: { type: "string", maxLength: 160 } });
  const paging = [
    { in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: 100, default: 30 } },
    { in: "query", name: "offset", schema: { type: "integer", minimum: 0, maximum: 1000000, default: 0 } },
  ];
  return {
    "/inventory/stock/workspace": {
      get: read("getStockWorkspace", "StockWorkspace", [
        company,
        { in: "query", name: "as_of", required: true, schema: { type: "string", format: "date" } },
        text("product_id"),
        text("warehouse_id"),
        text("search"),
        ...paging,
      ]),
    },
    "/inventory/stock/lookups": {
      get: read("getStockLookups", "StockLookupDirectory", [
        company,
        {
          in: "query",
          name: "kind",
          required: true,
          schema: {
            type: "string",
            enum: [
              "product",
              "warehouse",
              "account",
              "receipt",
              "transfer",
              "manufacturing_order",
              "manufacturing_issue",
              "reversal",
            ],
          },
        },
        {
          in: "query",
          name: "account_type",
          schema: { type: "string", enum: ["asset", "liability", "equity", "expense"] },
        },
        text("search"),
        ...paging,
      ]),
    },
    "/inventory/stock/operations": {
      post: write("createStockMovement", "StockMovementInput", "StockOperation", false, false, true),
    },
    "/inventory/stock/operations/{id}": { get: read("getStockMovement", "StockOperation", [company, identity]) },
    "/inventory/stock/operations/{id}/actions": {
      post: write("actOnStockMovement", "StockAction", "StockOperation", true),
    },
    "/inventory/stock/policy": { post: write("configureStockPolicy", "StockPolicyInput", "StockPolicy") },
    "/inventory/stock/valuation": { post: write("configureStockValuation", "StockValuationInput", "StockValuation") },
  };
}
