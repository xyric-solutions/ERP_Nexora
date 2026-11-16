import { randomUUID, createHash } from "node:crypto";
import { Readable } from "node:stream";
import type { PoolClient } from "pg";
import type { ObjectStorage } from "@nexora/domain";
import {
  assetAttachmentInputSchema,
  assetStagedDocumentSchema,
  type AssetCategory,
  type FixedAsset,
} from "@nexora/contracts";
import type { BankingActorContext } from "../banking/source-repository.js";
import { SourceAssetRepository, reject } from "./source-repository.js";
import { assetFileMediaType, assetFileMaxBytes } from "./attachments.js";

export class AssetStagedDocuments {
  constructor(
    readonly repository: SourceAssetRepository,
    readonly storage?: ObjectStorage,
  ) {}
  async upload(context: BankingActorContext, raw: unknown, file: { fileName: string; body: Buffer }, key: string) {
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
      return await this.repository.transaction(context, input.company_id, "create", true, (client) =>
        this.repository.idempotent(
          client,
          context,
          input.company_id,
          key,
          { input, checksum, fileName },
          assetStagedDocumentSchema,
          async () => {
            const count = (
              await client.query<{ count: number }>(
                "select count(*)::int as count from fixed_asset_staged_document where tenant_id=$1 and company_id=$2 and created_by=$3 and document_id is null and claimed_at is null and created_at>clock_timestamp()-interval '30 days'",
                [context.tenantId, input.company_id, context.actor.userId],
              )
            ).rows[0]!.count;
            // One maximum bill: 100 units, each with up to 40 category document fields.
            if (count >= 4000)
              reject(
                "Complete registration or wait for unused uploads to expire before uploading more.",
                "ASSET_STAGED_DOCUMENT_LIMIT",
              );
            const id = randomUUID();
            objectKey = `assets/staged/${encodeURIComponent(context.tenantId)}/${encodeURIComponent(input.company_id)}/${id}`;
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
            await client.query(
              "insert into fixed_asset_staged_document(tenant_id,company_id,id,title,file_name,content_type,size_bytes,checksum_sha256,object_key,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
              [
                context.tenantId,
                input.company_id,
                id,
                input.title,
                fileName,
                contentType,
                file.body.length,
                checksum,
                objectKey,
                context.actor.userId,
              ],
            );
            const result = {
              id,
              title: input.title,
              file_name: fileName,
              content_type: contentType,
              size_bytes: file.body.length,
            };
            await this.repository.audit(
              client,
              context,
              input.company_id,
              id,
              "document_staged",
              input.title,
              null,
              result,
            );
            return result;
          },
        ),
      );
    } catch (error) {
      if (objectKey) {
        try {
          await storage.remove(objectKey);
        } catch (cleanup) {
          throw new AggregateError([error, cleanup], "Staged document rollback could not clean its private object.");
        }
      }
      throw error;
    }
  }
}

export async function attachStagedDocuments(
  client: PoolClient,
  context: BankingActorContext,
  company: string,
  asset: string,
  category: AssetCategory,
  details: FixedAsset["details"],
  purchaseDocument?: string,
) {
  for (const field of category.field_definitions ?? []) {
    if (field.type !== "document") continue;
    const reference = details.custom_fields?.[field.key];
    if (!reference) continue;
    if (typeof reference !== "string" || !reference.startsWith("staged:"))
      reject("Upload the category's private document before registration.");
    const row = (
      await client.query<{ id: string }>(
        `select id from fixed_asset_staged_document where tenant_id=$1 and company_id=$2 and id=$3
      and ((document_id is null and created_by=$4 and created_at>clock_timestamp()-interval '30 days') or document_id=$5) for share`,
        [context.tenantId, company, reference.slice(7), context.actor.userId, purchaseDocument ?? null],
      )
    ).rows[0];
    if (!row)
      reject(
        "A staged document is unavailable, expired or belongs to another purchase/company.",
        "ASSET_STAGED_DOCUMENT_INVALID",
      );
    await client.query(
      `insert into fixed_asset_attachment(tenant_id,company_id,id,asset_id,title,file_name,content_type,size_bytes,checksum_sha256,object_key,created_by,staged_document_id)
      select tenant_id,company_id,$4,$5,title,file_name,content_type,size_bytes,checksum_sha256,object_key,$6,id from fixed_asset_staged_document where tenant_id=$1 and company_id=$2 and id=$3`,
      [context.tenantId, company, row.id, randomUUID(), asset, context.actor.userId],
    );
    await client.query(
      "update fixed_asset_staged_document set claimed_at=coalesce(claimed_at,clock_timestamp()) where tenant_id=$1 and company_id=$2 and id=$3",
      [context.tenantId, company, row.id],
    );
  }
}

export async function bindPurchaseDocuments(
  client: PoolClient,
  tenant: string,
  company: string,
  document: string,
  actor: string,
  references: string[],
) {
  for (const reference of new Set(references)) {
    if (!reference.startsWith("staged:")) reject("Category documents must be uploaded privately.");
    const bound = await client.query(
      `update fixed_asset_staged_document set document_id=$4 where tenant_id=$1 and company_id=$2 and id=$3
      and ((document_id is null and created_by=$5 and created_at>clock_timestamp()-interval '30 days') or document_id=$4) returning id`,
      [tenant, company, reference.slice(7), document, actor],
    );
    if (!bound.rowCount)
      reject(
        "A private category document is unavailable or already belongs to another purchase.",
        "ASSET_STAGED_DOCUMENT_INVALID",
      );
  }
}
