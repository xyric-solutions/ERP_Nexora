import express from "express";
import request from "supertest";
import { describe, it, expect } from "vitest";
import { parseSingleFileMultipart } from "../../server/api/src/http/single-file-multipart.js";
import { HttpError } from "../../server/api/src/http/errors.js";
const app = express();
app.post("/file", async (req, res) => {
  try {
    const result = await parseSingleFileMultipart(req, {
      maxFileBytes: 64,
      allowedFields: new Set(["title"]),
      label: "test evidence",
    });
    res.json({ fields: result.fields, name: result.file.fileName, text: result.file.body.toString() });
  } catch (error) {
    if (error instanceof HttpError) res.status(error.status).json({ code: error.code });
    else res.status(500).end();
  }
});
describe("Shared bounded multipart evidence parser", () => {
  it("accepts the exact allowed field and file count", async () => {
    const response = await request(app)
      .post("/file")
      .field("title", "Invoice")
      .attach("file", Buffer.from("%PDF-1.7"), "invoice.pdf");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ fields: { title: "Invoice" }, name: "invoice.pdf", text: "%PDF-1.7" });
  });
  it("rejects unexpected fields", async () => {
    expect(
      (
        await request(app)
          .post("/file")
          .field("title", "Invoice")
          .field("extra", "forbidden")
          .attach("file", Buffer.from("pdf"), "invoice.pdf")
      ).status,
    ).toBe(400);
  });
  it("rejects additional files", async () => {
    expect(
      (
        await request(app)
          .post("/file")
          .attach("file", Buffer.from("one"), "one.pdf")
          .attach("file", Buffer.from("two"), "two.pdf")
      ).status,
    ).toBe(400);
  });
  it("rejects oversized file content", async () => {
    expect(
      (await request(app).post("/file").field("title", "Invoice").attach("file", Buffer.alloc(65), "invoice.pdf"))
        .status,
    ).toBe(413);
  });
});
