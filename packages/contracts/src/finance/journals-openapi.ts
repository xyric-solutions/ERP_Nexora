import { z } from "zod";
import {
  changeRecurringJournalStatusRequestSchema,
  createJournalRequestSchema,
  createRecurringJournalRequestSchema,
  decideJournalRequestSchema,
  deleteJournalRequestSchema,
  journalDeleteResultSchema,
  journalDetailSchema,
  journalDirectorySchema,
  journalMutationResultSchema,
  journalOptionsSchema,
  recurringJournalDirectorySchema,
  recurringJournalOccurrenceDirectorySchema,
  recurringJournalTemplateSchema,
  reverseJournalRequestSchema,
  submitJournalRequestSchema,
  updateJournalRequestSchema,
  updateRecurringJournalRequestSchema,
} from "./journals.js";

export function journalPaths() {
  const json = (value: z.ZodType) => z.toJSONSchema(value, { target: "openapi-3.0" });
  const errors = Object.fromEntries(
    [400, 401, 403, 404, 409, 412, 422, 428, 503].map((status) => [
      status,
      {
        description: "Standard problem response",
        content: { "application/problem+json": { schema: { $ref: "#/components/schemas/ProblemDetails" } } },
      },
    ]),
  );
  const response = (description: string, schema: z.ZodType, status = "200") => ({
    [status]: { description, content: { "application/json": { schema: json(schema) } } },
    ...errors,
  });
  const body = (schema: z.ZodType) => ({
    required: true,
    content: { "application/json": { schema: json(schema) } },
  });
  const csrf = { in: "header", name: "x-csrf-token", required: true, schema: { type: "string" } };
  const key = { in: "header", name: "idempotency-key", required: true, schema: { type: "string", maxLength: 255 } };
  const ifMatch = {
    in: "header",
    name: "if-match",
    required: true,
    schema: { type: "string", pattern: '^"[1-9][0-9]*"$' },
  };
  const company = { in: "query", name: "company_id", required: true, schema: { type: "string", maxLength: 128 } };
  const journalId = { in: "path", name: "journalId", required: true, schema: { type: "string", maxLength: 128 } };
  const templateId = { in: "path", name: "templateId", required: true, schema: { type: "string", maxLength: 128 } };
  const pagination = [
    { in: "query", name: "limit", required: false, schema: { type: "integer", minimum: 1, maximum: 100 } },
    { in: "query", name: "cursor", required: false, schema: { type: "string", maxLength: 512 } },
  ];
  return {
    "/finance/journals/options": {
      get: {
        operationId: "getJournalOptions",
        security: [{ cookieAuth: [] }],
        parameters: [{ ...company, required: false }],
        responses: response("Journal company, currency and nominal options", journalOptionsSchema),
      },
    },
    "/finance/journals": {
      get: {
        operationId: "listJournals",
        security: [{ cookieAuth: [] }],
        parameters: [company, ...pagination],
        responses: response("Unified Journal register", journalDirectorySchema),
      },
      post: {
        operationId: "createJournal",
        security: [{ cookieAuth: [] }],
        parameters: [csrf, key],
        requestBody: body(createJournalRequestSchema),
        responses: response("Manual Journal draft created", journalMutationResultSchema, "201"),
      },
    },
    "/finance/journals/{journalId}": {
      get: {
        operationId: "getJournal",
        security: [{ cookieAuth: [] }],
        parameters: [journalId],
        responses: response("Journal detail and evidence", journalDetailSchema),
      },
      patch: {
        operationId: "updateJournal",
        security: [{ cookieAuth: [] }],
        parameters: [journalId, csrf, key, ifMatch],
        requestBody: body(updateJournalRequestSchema),
        responses: response("Manual Journal draft updated", journalMutationResultSchema),
      },
      delete: {
        operationId: "deleteJournal",
        security: [{ cookieAuth: [] }],
        parameters: [journalId, csrf, key, ifMatch],
        requestBody: body(deleteJournalRequestSchema),
        responses: response("Manual Journal draft content permanently deleted", journalDeleteResultSchema),
      },
    },
    "/finance/journals/{journalId}/submit": {
      post: {
        operationId: "submitJournal",
        security: [{ cookieAuth: [] }],
        parameters: [journalId, csrf, key, ifMatch],
        requestBody: body(submitJournalRequestSchema),
        responses: response("Manual Journal submitted", journalMutationResultSchema),
      },
    },
    "/finance/journals/{journalId}/decision": {
      post: {
        operationId: "decideJournal",
        security: [{ cookieAuth: [] }],
        parameters: [journalId, csrf, key, ifMatch],
        requestBody: body(decideJournalRequestSchema),
        responses: response("Manual Journal rejected or confirmed and posted", journalMutationResultSchema),
      },
    },
    "/finance/journals/{journalId}/reversal": {
      post: {
        operationId: "reverseJournal",
        security: [{ cookieAuth: [] }],
        parameters: [journalId, csrf, key, ifMatch],
        requestBody: body(reverseJournalRequestSchema),
        responses: response("Manual Journal reversed by compensating entry", journalMutationResultSchema),
      },
    },
    "/finance/recurring-journals": {
      get: {
        operationId: "listRecurringJournals",
        security: [{ cookieAuth: [] }],
        parameters: [company, ...pagination],
        responses: response("Recurring Journal templates", recurringJournalDirectorySchema),
      },
      post: {
        operationId: "createRecurringJournal",
        security: [{ cookieAuth: [] }],
        parameters: [csrf, key],
        requestBody: body(createRecurringJournalRequestSchema),
        responses: response("Recurring Journal template created", recurringJournalTemplateSchema, "201"),
      },
    },
    "/finance/recurring-journals/{templateId}": {
      patch: {
        operationId: "updateRecurringJournal",
        security: [{ cookieAuth: [] }],
        parameters: [templateId, csrf, key, ifMatch],
        requestBody: body(updateRecurringJournalRequestSchema),
        responses: response("Recurring Journal template updated", recurringJournalTemplateSchema),
      },
    },
    "/finance/recurring-journals/{templateId}/status": {
      post: {
        operationId: "changeRecurringJournalStatus",
        security: [{ cookieAuth: [] }],
        parameters: [templateId, csrf, key, ifMatch],
        requestBody: body(changeRecurringJournalStatusRequestSchema),
        responses: response("Recurring Journal template status changed", recurringJournalTemplateSchema),
      },
    },
    "/finance/recurring-journals/{templateId}/occurrences": {
      get: {
        operationId: "listRecurringJournalOccurrences",
        security: [{ cookieAuth: [] }],
        parameters: [templateId, ...pagination],
        responses: response("Recurring Journal occurrence history", recurringJournalOccurrenceDirectorySchema),
      },
    },
  };
}
