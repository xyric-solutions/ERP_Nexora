import type { Pool } from "pg";

type ReadinessDatabase = Pick<Pool, "query">;

export function createHrFoundationReadiness(database: ReadinessDatabase): () => Promise<void> {
  return async () => {
    const result = await database.query<{ available: boolean }>(
      `select to_regclass('public.employee') is not null
        and to_regclass('public.hr_master_record') is not null
        and to_regclass('public.hr_employee_draft_scope') is not null
        and to_regclass('public.hr_record_code_counter') is not null
        and exists(select 1 from nexora_schema_migration where module_name='hr' and version>=133) as available`,
    );
    if (!result.rows[0]?.available) throw new Error("The current HR foundation migration is required");
  };
}
