import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDisposableSourceDatabase } from "../security/disposable-source-database.js";
import { setupAssetFixture } from "./fixed-assets-fixture.js";
import { FixedAssetsService } from "../../server/api/src/modules/fixed-assets/service.js";
import { S3ObjectStorage } from "../../packages/domain/src/storage/s3-object-storage.js";

const run = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL ? describe : describe.skip;
run("Asset evidence in PostgreSQL and the existing private object storage", () => {
  let f: Awaited<ReturnType<typeof setupAssetFixture>>,
    service: FixedAssetsService,
    close: () => Promise<void>,
    assetId: string;
  const storage = new S3ObjectStorage({
    endpoint: process.env.TEST_S3_ENDPOINT ?? "http://127.0.0.1:59000",
    region: "us-east-1",
    bucket: "nexora-test",
    accessKeyId: "nexora-test",
    secretAccessKey: "nexora-test-secret",
    forcePathStyle: true,
  });
  beforeAll(async () => {
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
          "select object_key from fixed_asset_attachment where tenant_id=$1 and company_id=$2",
          [f.tenant, f.company],
        );
        for (const row of rows.rows) await storage.remove(row.object_key);
      }
    } finally {
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
});
