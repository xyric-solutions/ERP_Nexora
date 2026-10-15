import { Redis } from "ioredis";

import { checkDatabase, createDatabasePool } from "@nexora/db";

const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL;
if (!databaseUrl || !redisUrl) throw new Error("DATABASE_URL and REDIS_URL are required");

const pool = createDatabasePool(databaseUrl);
const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
try {
  await Promise.all([checkDatabase(pool), redis.connect().then(async () => redis.ping())]);
  const schema = await pool.query<{ available: boolean }>(
    "select to_regclass('public.job_execution') is not null as available",
  );
  if (!schema.rows[0]?.available) throw new Error("job_execution is unavailable");
} finally {
  await Promise.allSettled([pool.end(), redis.quit()]);
}
