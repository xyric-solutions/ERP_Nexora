import { z } from "zod";
import { bankingCompanyDirectorySchema } from "../banking/index.js";
import {
  createFiscalCalendarSchema,
  fiscalCalendarDetailSchema,
  fiscalCalendarDirectorySchema,
  generateFiscalPeriodsSchema,
  changeFiscalPeriodsSchema,
} from "./periods.js";
export function fiscalCalendarPaths() {
  const json = (s: z.ZodType) => z.toJSONSchema(s, { target: "openapi-3.0" });
  const company = {
    in: "query",
    name: "company_id",
    required: true,
    schema: { type: "string", minLength: 1, maxLength: 128 },
  };
  const id = {
    in: "path",
    name: "calendarId",
    required: true,
    schema: { type: "string", minLength: 1, maxLength: 128 },
  };
  const headers = [
    { in: "header", name: "x-csrf-token", required: true, schema: { type: "string" } },
    { in: "header", name: "idempotency-key", required: true, schema: { type: "string", maxLength: 255 } },
  ];
  const version = {
    in: "header",
    name: "if-match",
    required: true,
    description:
      "Quoted expected version; batch status changes use comma-separated expected versions sorted by period ID.",
    schema: { type: "string" },
  };
  const errors = Object.fromEntries(
    [400, 401, 403, 404, 409, 412].map((code) => [
      code,
      {
        description: "Standard problem response",
        content: { "application/problem+json": { schema: { $ref: "#/components/schemas/ProblemDetails" } } },
      },
    ]),
  );
  const read = (operationId: string, parameters: unknown[], schema: z.ZodType) => ({
    operationId,
    security: [{ cookieAuth: [] }],
    parameters,
    responses: {
      "200": {
        description: "Live company-scoped calendar data",
        content: { "application/json": { schema: json(schema) } },
      },
      ...errors,
    },
  });
  const mutate = (operationId: string, parameters: unknown[], schema: z.ZodType) => ({
    ...read(operationId, [...parameters, ...headers], fiscalCalendarDetailSchema),
    requestBody: { required: true, content: { "application/json": { schema: json(schema) } } },
  });
  return {
    "/master_data/fiscal_calendars/options": {
      get: read("listFiscalCalendarCompanies", [], bankingCompanyDirectorySchema),
    },
    "/master_data/fiscal_calendars": {
      get: read(
        "listFiscalCalendars",
        [
          company,
          { in: "query", name: "after", schema: { type: "string", maxLength: 128 } },
          { in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
        ],
        fiscalCalendarDirectorySchema,
      ),
      post: mutate("createFiscalCalendar", [], createFiscalCalendarSchema),
    },
    "/master_data/fiscal_calendars/{calendarId}": {
      get: read("getFiscalCalendar", [id, company], fiscalCalendarDetailSchema),
    },
    "/master_data/fiscal_calendars/{calendarId}/periods": {
      post: mutate("generateFiscalPeriods", [id, version], generateFiscalPeriodsSchema),
    },
    "/finance/fiscal_calendars/{calendarId}/period_status": {
      post: mutate("changeFiscalPeriods", [id, version], changeFiscalPeriodsSchema),
    },
  };
}
