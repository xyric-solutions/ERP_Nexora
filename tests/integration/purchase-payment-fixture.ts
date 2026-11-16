import type { DatabasePool } from "../../packages/db/src/index.js";
import {
  ensureCompanyCurrencyFixture,
  sourceTestTenantId as tenant,
  sourceTestCompanyId as company,
} from "./source-security-fixture.js";

/** Synthetic accounts only, in the caller's disposable Purchase test database. */
export async function purchasePaymentBankFixture(pool: DatabasePool) {
  await pool.query(
    `insert into currency(tenant_id,code,name,decimal_places,is_base,status,catalog_code,adopted_by,adopted_at)
    select $1,code,name,decimal_places,false,'active',code,'r06.maker',now() from currency_catalog where code='AED'
    on conflict(tenant_id,code) do nothing`,
    [tenant],
  );
  await ensureCompanyCurrencyFixture(pool, company, "USD", ["AED"]);
  await pool.query(
    `insert into account(id,tenant_id,company_id,code,name,type,is_header,status,manual_posting_allowed,reconciliation_required,created_at)
    values('purchase-bank-ledger-aed',$1,$2,'PUR-AED','Synthetic AED bank','asset',false,'active',true,true,now())`,
    [tenant, company],
  );
  for (const [currency, rate] of [
    ["PKR", "0.0035"],
    ["AED", "0.27"],
  ])
    await pool.query(
      `insert into currency_rate(id,tenant_id,company_id,source_currency,target_currency,rate,effective_date,status,row_version,created_by,reason,updated_at)
      values($1,$2,$3,$4,'USD',$5,'2026-01-01','active',1,'r06.maker','Synthetic Purchase FX',now())`,
      [`purchase-rate-${currency}`, tenant, company, currency, rate],
    );
  for (const currency of ["USD", "PKR", "AED"])
    await pool.query(
      `insert into bank_account
      (id,tenant_id,company_id,account_id,bank_name,currency,status,created_at,reference,account_name,
       account_type,branch,account_number_masked,account_number_ciphertext,account_number_nonce,
       account_number_hash,encryption_key_version,overdraft_limit,row_version,created_by,
       submitted_by,submitted_at,submission_reason,approved_by,approved_at,decision_reason,updated_at)
     values ($1,$2,$3,$4,'Synthetic Purchase Bank',$5,'active',now(),$6,$7,'current','Test Branch',
       '•••• 1234',$8,$9,$10,'test-v1',0,1,'r06.maker','r06.maker',now(),'Synthetic fixture',
       'r06.checker',now(),'Synthetic fixture',now())`,
      [
        `purchase-bank-${currency}`,
        tenant,
        company,
        currency === "AED" ? "purchase-bank-ledger-aed" : `r06-uat-bank-operating-${currency.toLowerCase()}`,
        currency,
        `PBA-${currency}`,
        `Purchase ${currency} account`,
        Buffer.alloc(24, 7),
        Buffer.alloc(12, 3),
        (currency === "USD" ? "a" : currency === "AED" ? "c" : "b").repeat(64),
      ],
    );
}
