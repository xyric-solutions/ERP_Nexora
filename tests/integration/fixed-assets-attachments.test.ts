import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { S3Client, CreateBucketCommand, DeleteBucketCommand } from "@aws-sdk/client-s3";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDisposableSourceDatabase } from "../security/disposable-source-database.js";
import { setupAssetFixture } from "./fixed-assets-fixture.js";
import { FixedAssetsService } from "../../server/api/src/modules/fixed-assets/service.js";
import { S3ObjectStorage } from "../../packages/domain/src/storage/s3-object-storage.js";
import { assetCategoryInputSchema } from "../../packages/contracts/src/index.js";
import { AssetStagedDocumentCleanup } from "../../server/api/src/modules/fixed-assets/staged-document-cleanup.js";

const run = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL ? describe : describe.skip;
run("Asset evidence in PostgreSQL and the existing private object storage", () => {
  let f: Awaited<ReturnType<typeof setupAssetFixture>>,
    service: FixedAssetsService,
    close: () => Promise<void>,
    assetId: string;
  const bucket = `nexora-asset-files-${randomUUID()}`,
    s3 = new S3Client({
      endpoint: process.env.TEST_S3_ENDPOINT ?? "http://127.0.0.1:59000",
      region: "us-east-1",
      forcePathStyle: true,
      credentials: { accessKeyId: "nexora-test", secretAccessKey: "nexora-test-secret" },
    });
  const storage = new S3ObjectStorage({
    endpoint: process.env.TEST_S3_ENDPOINT ?? "http://127.0.0.1:59000",
    region: "us-east-1",
    bucket,
    accessKeyId: "nexora-test",
    secretAccessKey: "nexora-test-secret",
    forcePathStyle: true,
  });
  beforeAll(async () => {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    const db = await createDisposableSourceDatabase(process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL!);
    close = db.close;
    f = await setupAssetFixture(db.pool);
    service = new FixedAssetsService(f.pool, storage);
    assetId = (await f.register((await f.bankAcquisition()).line)).id;
  }, 60000);
  afterAll(async () => {
    try {
      if (f) {
        const rows = await f.pool.query<{ object_key: string }>(
          "select object_key from fixed_asset_attachment where tenant_id=$1 and company_id=$2 union select object_key from fixed_asset_staged_document where tenant_id=$1 and company_id=$2",
          [f.tenant, f.company],
        );
        for (const row of rows.rows) await storage.remove(row.object_key);
      }
    } finally {
      for (const object of (await storage.list("assets/", { limit: 1000 })).objects)
        await storage.remove(object.objectKey);
      await s3.send(new DeleteBucketCommand({ Bucket: bucket }));
      s3.destroy();
      storage.close();
      await close?.();
    }
  });
  it("uploads and reloads actual PDF bytes with immutable checksums and a safe filename", async () => {
    const file = {
        fileName: "../supplier-invoice.pdf",
        body: Buffer.from("%PDF-1.7\ncontrolled asset evidence\n%%EOF"),
      },
      input = { company_id: f.company, title: "Supplier invoice" },
      key = randomUUID();
    const first = await service.attachments.upload(f.maker, assetId, input, file, key);
    expect(first.file_name).toBe(".._supplier-invoice.pdf");
    expect(await service.attachments.upload(f.maker, assetId, input, file, key)).toEqual(first);
    const content = await service.attachments.content(f.maker, f.company, assetId, first.id),
      chunks: Buffer[] = [];
    for await (const chunk of content.body) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks)).toEqual(file.body);
    const detail = await service.detail(f.maker, f.company, assetId);
    expect(detail.attachments).toHaveLength(1);
    expect(detail.history.some((event) => event.action === "file_attached")).toBe(true);
    await expect(
      f.pool.query("delete from fixed_asset_attachment where tenant_id=$1 and company_id=$2 and id=$3", [
        f.tenant,
        f.company,
        first.id,
      ]),
    ).rejects.toMatchObject({ code: "23514" });
  });
  it("rejects invalid content, absent permissions, impersonation and another company before storage writes", async () => {
    const file = { fileName: "image.png", body: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) },
      input = { company_id: f.company, title: "Asset image" };
    await expect(
      service.attachments.upload(
        { ...f.maker, actor: { ...f.maker.actor, permissions: [] } },
        assetId,
        input,
        file,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    await expect(
      service.attachments.upload({ ...f.maker, realActorId: "r06.target" }, assetId, input, file, randomUUID()),
    ).rejects.toMatchObject({ code: "IMPERSONATION_RESTRICTED" });
    await expect(
      service.attachments.upload(f.maker, assetId, { ...input, company_id: "unavailable-company" }, file, randomUUID()),
    ).rejects.toMatchObject({ code: "COMPANY_ACCESS_DENIED" });
    await expect(
      service.attachments.upload(
        f.maker,
        assetId,
        input,
        { fileName: "invoice.pdf", body: Buffer.from("<script>") },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "ASSET_FILE_TYPE_INVALID" });
  });
  it("binds private vehicle fields to the purchase and atomically attaches the staged file on posting", async () => {
    const file = {
        fileName: "vehicle-registration.pdf",
        body: Buffer.from("%PDF-1.7\nprivate vehicle registration\n%%EOF"),
      },
      input = { company_id: f.company, title: "Vehicle registration" },
      key = randomUUID();
    const document = await service.stagedDocuments.upload(f.maker, input, file, key);
    expect(await service.stagedDocuments.upload(f.maker, input, file, key)).toEqual(document);
    const terms = assetCategoryInputSchema.strip().parse({ ...f.category, expected_version: 0 });
    const category = await service.repository.saveCategory(
      f.maker,
      null,
      assetCategoryInputSchema.parse({
        ...terms,
        expected_version: 0,
        name: "Vehicle evidence",
        field_template: "vehicle",
        field_definitions: [
          { key: "vin", label: "VIN", type: "text", required: true },
          { key: "registration", label: "Registration", type: "document", required: true },
        ],
      }),
      randomUUID(),
    );
    const purchase = await f.purchase("100000", "1", true, "0", true, undefined, {
      groups: [
        {
          category,
          amount: "100000",
          quantity: "1",
          custom_fields: { vin: "TEST-VEHICLE-2026", registration: `staged:${document.id}` },
        },
      ],
    });
    const asset = (
      await f.pool.query("select asset_id from fixed_asset_purchase_origin where tenant_id=$1 and document_id=$2", [
        f.tenant,
        purchase.source.id,
      ])
    ).rows[0]!.asset_id;
    const detail = await service.detail(f.maker, f.company, asset);
    expect(detail.asset.details.custom_fields?.vin).toBe("TEST-VEHICLE-2026");
    expect(detail.attachments).toHaveLength(1);
    const response = await service.attachments.content(f.checker, f.company, asset, detail.attachments[0]!.id),
      chunks: Buffer[] = [];
    for await (const chunk of response.body) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks)).toEqual(file.body);
    await expect(
      service.attachments.content(f.checker, "another-company", asset, detail.attachments[0]!.id),
    ).rejects.toMatchObject({ code: "COMPANY_ACCESS_DENIED" });
    await expect(
      f.purchase("100000", "1", true, "0", true, undefined, {
        groups: [
          {
            category,
            amount: "100000",
            quantity: "1",
            custom_fields: { vin: "FORGED-REUSE", registration: `staged:${document.id}` },
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "ASSET_STAGED_DOCUMENT_INVALID" });
  });
  it("cleans expired unbound documents and abandoned writes while retaining bound private evidence", async () => {
    const file = { fileName: "unused.pdf", body: Buffer.from("%PDF-1.7\nunused temporary evidence\n%%EOF") };
    const staged = await service.stagedDocuments.upload(
      f.maker,
      { company_id: f.company, title: "Unused temporary file" },
      file,
      randomUUID(),
    );
    const orphan = `assets/staged/${encodeURIComponent(f.tenant)}/${encodeURIComponent(f.company)}/${randomUUID()}`;
    await storage.writeBounded(
      { objectKey: orphan, contentType: "application/pdf", sizeBytes: file.body.length, maxBytes: 10485760 },
      Readable.from(file.body),
    );
    const protectedRows = (
      await f.pool.query<{ object_key: string }>(
        "select object_key from fixed_asset_staged_document where tenant_id=$1 and company_id=$2 and document_id is not null",
        [f.tenant, f.company],
      )
    ).rows;
    const expiredKey = (
      await f.pool.query<{ object_key: string }>(
        "select object_key from fixed_asset_staged_document where tenant_id=$1 and company_id=$2 and id=$3",
        [f.tenant, f.company, staged.id],
      )
    ).rows[0]!.object_key;
    const result = await new AssetStagedDocumentCleanup(f.pool, storage).cleanupTenant(
      f.tenant,
      new Date(Date.now() + 31 * 86400000),
    );
    expect(result.deleted).toBe(2);
    expect(await storage.exists(orphan)).toBe(false);
    expect(await storage.exists(expiredKey)).toBe(false);
    for (const row of protectedRows) expect(await storage.exists(row.object_key)).toBe(true);
    expect(
      (
        await f.pool.query(
          "select id from fixed_asset_staged_document where tenant_id=$1 and company_id=$2 and id=$3",
          [f.tenant, f.company, staged.id],
        )
      ).rows,
    ).toHaveLength(0);
  });
});
