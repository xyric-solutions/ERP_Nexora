import { describe, it, expect } from "vitest";
import { buildOpenApiDocument } from "../../packages/contracts/src/openapi-c4.js";
import {
  salesDocumentInputSchema,
  subledgerRecognitionSchema,
  stockMovementInputSchema,
} from "../../packages/contracts/src/index.js";

describe("Persistent commercial Sales contract", () => {
  it("documents authenticated reads and versioned, CSRF-protected source actions", () => {
    const document = buildOpenApiDocument();
    for (const path of [
      "/sales/documents/{id}/actions",
      "/sales/documents/{id}/derive",
      "/sales/documents/{id}/accounting",
      "/sales/documents/{id}/stock",
    ]) {
      const route = Reflect.get(document.paths, path);
      expect(route.post.security).toEqual([{ cookieAuth: [] }]);
      expect(route.post.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ in: "header", name: "x-csrf-token", required: true }),
          expect.objectContaining({ in: "header", name: "idempotency-key", required: true }),
          expect.objectContaining({ in: "header", name: "if-match", required: true }),
        ]),
      );
    }
    expect(Reflect.get(document.paths, "/sales/documents").get.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "company_id", required: true }),
        expect.objectContaining({ name: "kind", required: true }),
      ]),
    );
  });
  it("reserves amounts, source identity and physical source versions for the server workflow", () => {
    expect(
      salesDocumentInputSchema.safeParse({
        company_id: "company",
        kind: "invoice",
        customer_id: "customer",
        document_date: "2026-11-20",
        currency: "USD",
        project_id: "project",
        location_id: "location",
        lines: [
          { product_id: "product", description: "Actual line", quantity: "1", unit_price: "10", net_amount: "1" },
        ],
      }).success,
    ).toBe(false);
    expect(subledgerRecognitionSchema.shape.sales_document_id).toBeDefined();
    expect(subledgerRecognitionSchema.shape.source_document_id).toBeDefined();
    expect(
      stockMovementInputSchema.safeParse({
        company_id: "company",
        kind: "delivery",
        source_id: "sale",
        date: "2026-11-20",
        warehouse_id: "warehouse",
        reason: "Actual delivery without version",
      }).success,
    ).toBe(false);
  });
});
