export function procurementPaths() {
  const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
  const response = (name: string) => ({
    description: "Company-authorized persisted Purchase data",
    content: { "application/json": { schema: ref(name) } },
  });
  const company = {
    in: "query",
    name: "company_id",
    required: true,
    schema: { type: "string", minLength: 1, maxLength: 128 },
  };
  const id = { in: "path", name: "id", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } };
  const errors = Object.fromEntries(
    [400, 401, 403, 404, 409, 412, 503].map((code) => [
      String(code),
      {
        description: "Standard problem response",
        content: { "application/problem+json": { schema: ref("ProblemDetails") } },
      },
    ]),
  );
  const read = (operationId: string, name: string, parameters: unknown[] = []) => ({
    operationId,
    security: [{ cookieAuth: [] }],
    parameters,
    responses: { "200": response(name), ...errors },
  });
  const write = (operationId: string, input: string, output: string, create = false) => ({
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
  const filters = [
    company,
    ...["kind", "state", "search", "cursor"].map((name) => ({
      in: "query",
      name,
      schema: { type: "string", maxLength: name === "cursor" ? 512 : 160 },
    })),
    { in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
  ];
  return {
    "/procurement/companies": { get: read("listProcurementCompanies", "ProcurementCompanies") },
    "/procurement/options": { get: read("getProcurementOptions", "ProcurementOptions", [company]) },
    "/procurement/products": {
      get: read(
        "listPurchaseProducts",
        "PurchaseProductDirectory",
        filters.filter((filter) => !["kind", "state"].includes(filter.name)),
      ),
    },
    "/procurement/approvers": {
      get: read(
        "listPurchaseApprovers",
        "PurchaseApproverDirectory",
        filters.filter((filter) => !["kind", "state"].includes(filter.name)),
      ),
    },
    "/procurement/suppliers": {
      get: read("listPurchaseSuppliers", "SupplierDirectory", filters),
      post: write("createPurchaseSupplier", "SupplierInput", "SupplierMutation", true),
    },
    "/procurement/suppliers/{id}": {
      patch: write("updatePurchaseSupplier", "UpdateSupplierInput", "SupplierMutation"),
    },
    "/procurement/documents": {
      get: read("listPurchaseDocuments", "PurchaseDirectory", [
        ...filters,
        { in: "query", name: "supplier_id", schema: { type: "string", minLength: 1, maxLength: 128 } },
      ]),
      post: write("createPurchaseDocument", "SavePurchaseRequest", "PurchaseMutation", true),
    },
    "/procurement/documents/{id}": {
      get: read("getPurchaseDocument", "PurchaseDocument", [id, company]),
      patch: write("updatePurchaseDocument", "UpdatePurchaseRequest", "PurchaseMutation"),
    },
    "/procurement/documents/{id}/actions": {
      post: write("actOnPurchaseDocument", "PurchaseActionRequest", "PurchaseMutation"),
    },
    "/procurement/documents/{id}/flow": {
      get: read("getPurchaseFlow", "PurchaseFlow", [
        id,
        ...filters.filter((filter) => ["company_id", "cursor", "limit"].includes(filter.name)),
      ]),
    },
  };
}
