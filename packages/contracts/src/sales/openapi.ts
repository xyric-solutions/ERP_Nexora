export function salesPaths() {
  const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
  const identity = { in: "path", name: "id", required: true, schema: { type: "string", maxLength: 128 } };
  const company = { in: "query", name: "company_id", required: true, schema: { type: "string", maxLength: 128 } };
  const errors = Object.fromEntries(
    [400, 401, 403, 404, 409, 412, 503].map((code) => [
      code,
      {
        description: "Standard problem response",
        content: { "application/problem+json": { schema: ref("ProblemDetails") } },
      },
    ]),
  );
  const response = (name: string) => ({
    description: "Authorized persistent commercial and accounting evidence",
    content: { "application/json": { schema: ref(name) } },
  });
  const read = (operationId: string, name: string, parameters: unknown[]) => ({
    operationId,
    security: [{ cookieAuth: [] }],
    parameters,
    responses: { 200: response(name), ...errors },
  });
  const write = (operationId: string, input: string, output: string, path = true, version = true, create = false) => ({
    operationId,
    security: [{ cookieAuth: [] }],
    parameters: [
      ...(path ? [identity] : []),
      ...["x-csrf-token", "idempotency-key"].map((name) => ({
        in: "header",
        name,
        required: true,
        schema: { type: "string" },
      })),
      ...(version ? [{ in: "header", name: "if-match", required: true, schema: { type: "string" } }] : []),
    ],
    requestBody: { required: true, content: { "application/json": { schema: ref(input) } } },
    responses: { [create ? 201 : 200]: response(output), ...errors },
  });
  const text = (name: string) => ({ in: "query", name, schema: { type: "string", maxLength: 160 } });
  const kinds = ["quotation", "order", "delivery", "invoice", "return", "credit", "recurring"];
  const paging = [
    { in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
    { in: "query", name: "offset", schema: { type: "integer", minimum: 0, maximum: 1000000, default: 0 } },
  ];
  return {
    "/sales/overview": {
      get: read("getSalesOverview", "SalesOverview", [
        company,
        { in: "query", name: "as_of", schema: { type: "string", format: "date" } },
      ]),
    },
    "/sales/products/{id}/units": { get: read("getSalesProductUnits", "ProductUnits", [company, identity]) },
    "/sales/documents": {
      get: read("getSalesDocuments", "SalesDirectory", [
        company,
        { in: "query", name: "kind", required: true, schema: { type: "string", enum: kinds } },
        text("search"),
        {
          in: "query",
          name: "state",
          schema: { type: "string", enum: ["draft", "submitted", "approved", "rejected", "cancelled"] },
        },
        text("customer_id"),
        ...paging,
      ]),
      post: write("createSalesDocument", "SalesDocumentInput", "SalesDetail", false, false, true),
    },
    "/sales/lookups": {
      get: read("getSalesLookups", "SalesLookupDirectory", [
        company,
        {
          in: "query",
          name: "kind",
          required: true,
          schema: {
            type: "string",
            enum: [
              "customer",
              "product",
              "warehouse",
              "unit",
              "project",
              "location",
              "approver",
              "currency",
              "tax",
              "source",
            ],
          },
        },
        { in: "query", name: "source_kind", schema: { type: "string", enum: kinds } },
        text("customer_id"),
        text("warehouse_id"),
        text("search"),
        text("currency"),
        { in: "query", name: "as_of", schema: { type: "string", format: "date" } },
        ...paging,
      ]),
    },
    "/sales/documents/{id}": {
      get: read("getSalesDocument", "SalesDetail", [company, identity]),
      put: write("updateSalesDocument", "SalesDocumentUpdate", "SalesDetail"),
    },
    "/sales/documents/{id}/actions": { post: write("actOnSalesDocument", "SalesAction", "SalesDetail") },
    "/sales/documents/{id}/derive": {
      post: write("deriveSalesDocument", "SalesDerivedDraftInput", "SalesDocumentInput"),
    },
    "/sales/documents/{id}/accounting": {
      post: write("prepareSalesAccounting", "SalesSourcePrepare", "SubledgerOperation"),
    },
    "/sales/documents/{id}/stock": { post: write("prepareSalesStock", "SalesStockPrepare", "StockOperation") },
  };
}
