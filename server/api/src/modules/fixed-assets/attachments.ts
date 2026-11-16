import { randomUUID, createHash } from "node:crypto";
import { Readable } from "node:stream";
import type { ObjectStorage } from "@nexora/domain";
import { assetAttachmentInputSchema, assetAttachmentSchema, type AssetAttachmentInput } from "@nexora/contracts";
import type { PoolClient } from "pg";
import type { BankingActorContext } from "../banking/source-repository.js";
import { SourceAssetRepository, reject, AssetError } from "./source-repository.js";

export const assetFileMaxBytes = 10 * 1024 * 1024;
export function assetFileMediaType(fileName: string, body: Buffer) {
  if (!body.length || body.length > assetFileMaxBytes)
    throw new AssetError(413, "ASSET_FILE_SIZE_INVALID", "Upload a non-empty file of at most 10 MB.");
  const ext = fileName.split(".").at(-1)?.toLowerCase();
  if (ext === "pdf" && body.subarray(0, 5).equals(Buffer.from("%PDF-"))) return "application/pdf" as const;
  if (ext === "png" && body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return "image/png" as const;
  if ((ext === "jpg" || ext === "jpeg") && body.subarray(0, 3).equals(Buffer.from([255, 216, 255])))
    return "image/jpeg" as const;
  throw new AssetError(415, "ASSET_FILE_TYPE_INVALID", "Upload a PDF, PNG or JPEG whose contents match its file type.");
}
const projection = "id,asset_id,title,file_name,content_type,size_bytes,checksum_sha256,created_by,created_at::text";
export class AssetAttachmentService {
  constructor(
    readonly repository: SourceAssetRepository,
    readonly storage?: ObjectStorage,
  ) {}
  async list(client: PoolClient, tenant: string, company: string, asset: string) {
    const rows = await client.query(
      `select ${projection} from fixed_asset_attachment where tenant_id=$1 and company_id=$2 and asset_id=$3 order by created_at,id limit 1000`,
      [tenant, company, asset],
    );
    return rows.rows.map((row) => assetAttachmentSchema.parse(row));
  }
  async upload(
    context: BankingActorContext,
    assetId: string,
    raw: AssetAttachmentInput,
    file: { fileName: string; body: Buffer },
    key: string,
  ) {
    const input = assetAttachmentInputSchema.parse(raw),
      storage = this.storage;
    if (!storage) reject("Asset file storage is not configured.", "ASSET_STORAGE_UNAVAILABLE", 503);
    const contentType = assetFileMediaType(file.fileName, file.body),
      checksum = createHash("sha256").update(file.body).digest("hex"),
      fileName = [...file.fileName]
        .map((character) =>
          /[\\/]/.test(character) || character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 ? "_" : character,
        )
        .join("")
        .slice(-255);
    let objectKey: string | null = null;
    try {
      return await this.repository.transaction(context, input.company_id, "edit", true, (client) =>
        this.repository.idempotent(
          client,
          context,
          input.company_id,
          key,
          { assetId, input, checksum, fileName },
          assetAttachmentSchema,
          async () => {
            await this.repository.asset(client, context.tenantId, input.company_id, assetId, true);
            if (
              (
                await client.query<{ count: number }>(
                  "select count(*)::int as count from fixed_asset_attachment where tenant_id=$1 and company_id=$2 and asset_id=$3",
                  [context.tenantId, input.company_id, assetId],
                )
              ).rows[0]!.count >= 1000
            )
              reject(
                "The supporting document limit of 1,000 files per asset has been reached.",
                "ASSET_ATTACHMENT_LIMIT",
              );
            const id = randomUUID();
            objectKey = `assets/attachments/${encodeURIComponent(context.tenantId)}/${encodeURIComponent(input.company_id)}/${id}`;
            await storage.writeBounded(
              {
                objectKey,
                contentType,
                sizeBytes: file.body.length,
                maxBytes: assetFileMaxBytes,
                checksumSha256: checksum,
                timeoutMs: 30000,
              },
              Readable.from(file.body),
            );
            const result = (
              await client.query(
                `insert into fixed_asset_attachment(tenant_id,company_id,id,asset_id,title,file_name,content_type,size_bytes,checksum_sha256,object_key,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning ${projection}`,
                [
                  context.tenantId,
                  input.company_id,
                  id,
                  assetId,
                  input.title,
                  fileName,
                  contentType,
                  file.body.length,
                  checksum,
                  objectKey,
                  context.actor.userId,
                ],
              )
            ).rows[0];
            const attachment = assetAttachmentSchema.parse(result);
            await this.repository.audit(
              client,
              context,
              input.company_id,
              assetId,
              "file_attached",
              input.title,
              null,
              attachment,
            );
            return attachment;
          },
        ),
      );
    } catch (error) {
      if (objectKey) {
        try {
          await storage.remove(objectKey);
        } catch (cleanup) {
          throw new AggregateError([error, cleanup], "Asset attachment rollback could not clean its object.");
        }
      }
      throw error;
    }
  }
  async content(context: BankingActorContext, company: string, asset: string, id: string) {
    const storage = this.storage;
    if (!storage) reject("Asset file storage is not configured.", "ASSET_STORAGE_UNAVAILABLE", 503);
    const row = await this.repository.transaction(context, company, "read", false, async (client) => {
      await this.repository.asset(client, context.tenantId, company, asset);
      const row = (
        await client.query<{
          object_key: string;
          file_name: string;
          content_type: string;
          size_bytes: number;
          checksum_sha256: string;
        }>(
          "select object_key,file_name,content_type,size_bytes,checksum_sha256 from fixed_asset_attachment where tenant_id=$1 and company_id=$2 and asset_id=$3 and id=$4",
          [context.tenantId, company, asset, id],
        )
      ).rows[0];
      if (!row) reject("The attachment was not found.", "ASSET_FILE_NOT_FOUND", 404);
      return row;
    });
    const object = await storage.readBounded({
      objectKey: row.object_key,
      maxBytes: assetFileMaxBytes,
      checksumSha256: row.checksum_sha256,
      timeoutMs: 30000,
    });
    return { ...row, body: object.body };
  }
}
