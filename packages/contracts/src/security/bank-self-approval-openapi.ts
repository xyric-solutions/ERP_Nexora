export function bankGovernancePaths() {
  const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
  const company = {
    in: "query",
    name: "company_id",
    required: true,
    schema: { type: "string", minLength: 1, maxLength: 128 },
  };
  const kind = {
    in: "query",
    name: "transaction_kind",
    required: true,
    schema: { type: "string", enum: ["payment", "receipt"] },
  };
  const paging = [
    { in: "query", name: "cursor", schema: { type: "string", maxLength: 512 } },
    { in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
  ];
  const headers = [
    { in: "header", name: "x-csrf-token", required: true, schema: { type: "string" } },
    { in: "header", name: "idempotency-key", required: true, schema: { type: "string", maxLength: 255 } },
    { in: "header", name: "if-match", required: true, schema: { type: "string", pattern: '^"[0-9]+"$' } },
  ];
  const response = (schema: string) => ({
    description: "Live-authorized persisted Bank governance data",
    content: { "application/json": { schema: ref(schema) } },
  });
  const errors = Object.fromEntries(
    [400, 401, 403, 404, 409, 412, 503].map((status) => [
      status,
      {
        description: "Standard problem response",
        content: { "application/problem+json": { schema: ref("ProblemDetails") } },
      },
    ]),
  );
  const read = (operationId: string, parameters: unknown[], result: string) => ({
    operationId,
    security: [{ cookieAuth: [] }],
    parameters,
    responses: { "200": response(result), ...errors },
  });
  const mutate = (operationId: string, schema: string, result: string, parameters: unknown[] = []) => ({
    operationId,
    security: [{ cookieAuth: [] }],
    parameters: [...parameters, ...headers],
    requestBody: { required: true, content: { "application/json": { schema: ref(schema) } } },
    responses: { "200": response(result), ...errors },
  });
  return {
    "/security/bank_self_approval_options": {
      get: read(
        "listBankSelfApprovalOptions",
        [
          { ...company, required: false },
          { ...kind, required: false },
          { in: "query", name: "search", schema: { type: "string", maxLength: 160 } },
          ...paging,
        ],
        "BankSelfApprovalOptions",
      ),
    },
    "/security/bank_self_approval_grants": {
      get: read(
        "listBankSelfApprovalGrants",
        [
          company,
          kind,
          { in: "query", name: "user_id", schema: { type: "string", maxLength: 128 } },
          { in: "query", name: "history", schema: { type: "string", enum: ["true", "false"], default: "false" } },
          ...paging,
        ],
        "BankSelfApprovalDirectory",
      ),
      post: mutate("changeBankSelfApprovalGrant", "ChangeBankSelfApprovalRequest", "BankSelfApprovalMutation"),
    },
    "/banking/payments/{paymentId}/approver": {
      post: mutate("reassignBankPaymentApprover", "ReassignBankApproverRequest", "BankPaymentMutationResult", [
        { in: "path", name: "paymentId", required: true, schema: { type: "string", maxLength: 128 } },
      ]),
    },
    "/banking/receipts/{receiptId}/approver": {
      post: mutate("reassignBankReceiptApprover", "ReassignBankApproverRequest", "BankReceiptMutationResult", [
        { in: "path", name: "receiptId", required: true, schema: { type: "string", maxLength: 128 } },
      ]),
    },
  };
}
