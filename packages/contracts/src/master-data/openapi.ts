// Shared reference endpoints use the same schemas as repository/router validation.
export function referenceMasterPaths() {
  const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
  const company = {
    in: "query",
    name: "company_id",
    required: true,
    schema: { type: "string", minLength: 1, maxLength: 128 },
  };
  const id = { in: "path", name: "id", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } };
  const csrf = { in: "header", name: "x-csrf-token", required: true, schema: { type: "string" } };
  const key = { in: "header", name: "idempotency-key", required: true, schema: { type: "string", maxLength: 255 } };
  const version = {
    in: "header",
    name: "if-match",
    required: true,
    schema: { type: "string", pattern: '^"[1-9][0-9]*"$' },
  };
  const response = (name: string) => ({
    description: "Company-authorized persisted reference data",
    content: { "application/json": { schema: ref(name) } },
  });
  const errors = Object.fromEntries(
    [400, 401, 403, 404, 409, 412, 503].map((status) => [
      String(status),
      {
        description: "Standard problem response",
        content: { "application/problem+json": { schema: ref("ProblemDetails") } },
      },
    ]),
  );
  const paths: Record<string, unknown> = {};
  for (const kind of ["projects", "locations"] as const) {
    const title = kind === "projects" ? "Project" : "Location",
      path = `/master_data/${kind}`;
    const mutation = (operationId: string, schema: string, create: boolean) => ({
      operationId,
      security: [{ cookieAuth: [] }],
      parameters: create ? [csrf, key] : [id, csrf, key, version],
      requestBody: { required: true, content: { "application/json": { schema: ref(schema) } } },
      responses: { [create ? "201" : "200"]: response("ReferenceMasterMutation"), ...errors },
    });
    paths[path] = {
      get: {
        operationId: `listReference${title}s`,
        security: [{ cookieAuth: [] }],
        parameters: [
          company,
          { in: "query", name: "search", schema: { type: "string", maxLength: 160 } },
          { in: "query", name: "status", schema: { type: "string", enum: ["active", "inactive"] } },
          { in: "query", name: "cursor", schema: { type: "string", maxLength: 512 } },
          { in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
        ],
        responses: { "200": response("ReferenceMasterDirectory"), ...errors },
      },
      post: mutation(`createReference${title}`, "CreateReferenceMasterRequest", true),
    };
    paths[`${path}/companies`] = {
      get: {
        operationId: `listReference${title}Companies`,
        security: [{ cookieAuth: [] }],
        responses: { "200": response("BankingCompanyDirectory"), ...errors },
      },
    };
    paths[`${path}/{id}`] = {
      get: {
        operationId: `getReference${title}`,
        security: [{ cookieAuth: [] }],
        parameters: [id, company],
        responses: { "200": response("ReferenceMaster"), ...errors },
      },
      patch: mutation(`updateReference${title}`, "UpdateReferenceMasterRequest", false),
    };
    paths[`${path}/{id}/status`] = {
      post: mutation(`changeReference${title}Status`, "ChangeReferenceMasterStatusRequest", false),
    };
  }
  return paths;
}
