import type { DatabasePool } from "../../packages/db/src/index.js";
import { sourceTestTenantId as tenant, sourceTestCompanyId as company } from "./source-security-fixture.js";

/** Synthetic accounts only, in the caller's disposable Purchase test database. */
export async function purchasePaymentBankFixture(pool: DatabasePool) {
  for (const currency of ["USD", "PKR"])
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
        `r06-uat-bank-operating-${currency.toLowerCase()}`,
        currency,
        `PBA-${currency}`,
        `Purchase ${currency} account`,
        Buffer.alloc(24, 7),
        Buffer.alloc(12, 3),
        (currency === "USD" ? "a" : "b").repeat(64),
      ],
    );
}
