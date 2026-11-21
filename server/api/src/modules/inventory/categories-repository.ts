import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import {
  productCategoryInputSchema,
  productCategoryQuerySchema,
  productCategorySchema,
  productCategoryMutationSchema,
  type ProductCategoryInput,
  type ProductCategoryQuery,
} from "@nexora/contracts";
import type { UnitTransaction } from "./units-repository.js";
import type { InventoryContext } from "./source-repository.js";
import { InventoryError } from "./errors.js";
import { operationalDigest } from "../shared/operational-transaction.js";
type Audit = (
  client: PoolClient,
  context: InventoryContext,
  id: string,
  company: string,
  before: unknown,
  after: unknown,
  correlation: string,
) => Promise<string>;
const projection = "id,company_id,code,name,status,row_version version";
const fail = (message: string, code = "CATEGORY_INVALID", status = 409): never => {
  throw new InventoryError(status, code, message);
};
export class SourceCategoryRepository {
  constructor(
    private readonly transaction: UnitTransaction,
    private readonly audit: Audit,
  ) {}
  list(context: InventoryContext, raw: ProductCategoryQuery) {
    const input = productCategoryQuerySchema.parse(raw);
    return this.transaction(context, input.company_id, false, async (c) => {
      const rows = (
        await c.query(
          `select ${projection} from inventory_product_category where tenant_id=$1 and company_id=$2 and($3::text is null or status=$3) and(name ilike $4 escape '\\' or code ilike $4 escape '\\') and($5::text is null or id>$5) order by id limit $6`,
          [
            context.tenantId,
            input.company_id,
            input.status ?? null,
            `%${input.search.replace(/[\\%_]/g, "\\$&")}%`,
            input.after ?? null,
            input.limit + 1,
          ],
        )
      ).rows;
      return {
        items: rows.slice(0, input.limit).map((row) => productCategorySchema.parse(row)),
        next_cursor: rows.length > input.limit ? String(rows[input.limit - 1]!.id) : null,
      };
    });
  }
  save(context: InventoryContext, id: string | null, raw: ProductCategoryInput, key: string, correlation: string) {
    const input = productCategoryInputSchema.parse(raw);
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/.test(key) || Boolean(id) !== Boolean(input.expected_version))
      fail("Use a request identity and the current category version.");
    return this.transaction(
      context,
      input.company_id,
      true,
      async (c) => {
        const tenant = context.tenantId,
          company = input.company_id,
          digest = operationalDigest({ id, input });
        const previous = (
          await c.query(
            "select request_sha256,result from inventory_product_category_change where tenant_id=$1 and actor_id=$2 and idempotency_key=$3",
            [tenant, context.actor.userId, key],
          )
        ).rows[0];
        if (previous) {
          if (previous.request_sha256 !== digest)
            fail("This request identity was already used.", "CATEGORY_IDEMPOTENCY_CONFLICT");
          return productCategoryMutationSchema.parse(previous.result);
        }
        const before = id
          ? (
              await c.query(
                `select ${projection} from inventory_product_category where tenant_id=$1 and company_id=$2 and id=$3 for update`,
                [tenant, company, id],
              )
            ).rows[0]
          : null;
        if (id && !before) fail("Category not found in this company.", "CATEGORY_NOT_FOUND", 404);
        if (before && before.version !== input.expected_version)
          fail("Category changed. Reload before saving.", "CATEGORY_VERSION_CONFLICT");
        const category = id ?? `category-${randomUUID()}`;
        if (before)
          await c.query(
            "update inventory_product_category set name=$4,status=$5,row_version=row_version+1,updated_by=$6,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3",
            [tenant, company, category, input.name, input.status, context.actor.userId],
          );
        else {
          const next = (
            await c.query(
              "select coalesce(max(substring(code from '^CAT-([0-9]+)$')::bigint),0)+1 n from inventory_product_category where tenant_id=$1 and company_id=$2",
              [tenant, company],
            )
          ).rows[0].n;
          await c.query(
            "insert into inventory_product_category(tenant_id,company_id,id,code,name,status,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$7,$7)",
            [
              tenant,
              company,
              category,
              `CAT-${String(next).padStart(3, "0")}`,
              input.name,
              input.status,
              context.actor.userId,
            ],
          );
        }
        const record = productCategorySchema.parse(
          (
            await c.query(
              `select ${projection} from inventory_product_category where tenant_id=$1 and company_id=$2 and id=$3`,
              [tenant, company, category],
            )
          ).rows[0],
        );
        const audit_event_id = await this.audit(c, context, category, company, before, record, correlation),
          result = { record, audit_event_id };
        await c.query(
          "insert into inventory_product_category_change(tenant_id,company_id,id,category_id,record_version,actor_id,reason,audit_event_id,idempotency_key,request_sha256,snapshot,result) select $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,to_jsonb(p),$11::jsonb from inventory_product_category p where(p.tenant_id,p.company_id,p.id)=($1,$2,$4)",
          [
            tenant,
            company,
            randomUUID(),
            category,
            record.version,
            context.actor.userId,
            input.reason,
            audit_event_id,
            key,
            digest,
            JSON.stringify(result),
          ],
        );
        return result;
      },
      "inventory.category.manage",
    );
  }
}
