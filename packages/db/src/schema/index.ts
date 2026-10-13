import { bigint, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export * from "./security.js";

export const jobExecutions = pgTable(
  "job_execution",
  {
    id: uuid("id").primaryKey(),
    queue: text("queue").notNull(),
    jobKey: text("job_key").notNull(),
    status: text("status").notNull(),
    attempts: bigint("attempts", { mode: "number" }).notNull().default(0),
    correlationId: text("correlation_id").notNull(),
    payload: jsonb("payload").notNull(),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("job_execution_queue_key_uq").on(table.queue, table.jobKey),
    index("job_execution_status_idx").on(table.status),
  ],
);

export const fileObjects = pgTable(
  "file_object",
  {
    id: uuid("id").primaryKey(),
    objectKey: text("object_key").notNull(),
    checksumSha256: text("checksum_sha256").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("file_object_key_uq").on(table.objectKey)],
);
