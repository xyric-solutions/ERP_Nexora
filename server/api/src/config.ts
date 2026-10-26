import { z } from "zod";

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_HOST: z.string().default("127.0.0.1"),
    API_PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    API_ALLOWED_ORIGINS: z
      .string()
      .default("http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001"),
    API_TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
    DATABASE_URL: z.string().url(),
    DATABASE_AUTO_MIGRATE: z.enum(["true", "false"]).default("false"),
    REDIS_URL: z.string().url(),
    S3_ENDPOINT: z.string().url().default("http://127.0.0.1:9000"),
    S3_REGION: z.string().trim().min(1).max(128).default("us-east-1"),
    S3_BUCKET: z.string().trim().min(3).max(63),
    S3_ACCESS_KEY_ID: z.string().trim().min(1).max(512),
    S3_SECRET_ACCESS_KEY: z.string().min(1).max(512),
    S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("true"),
    AUTH_THROTTLE_SECRET: z.string().min(32).max(512),
    AUTH_LOGIN_DIRECTORY_SECRET: z.string().min(32).max(512),
    AUTH_SESSION_SECRET: z.string().min(32).max(512),
    BANKING_DATA_ENCRYPTION_KEY: z.string().min(1).max(512),
    BANKING_DATA_ENCRYPTION_KEY_VERSION: z.string().trim().min(1).max(64).default("v1"),
    AUTH_SESSION_IDLE_MINUTES: z.coerce.number().int().min(1).max(1_440).default(30),
    AUTH_SESSION_ABSOLUTE_HOURS: z.coerce.number().int().min(1).max(720).default(8),
    METRICS_BEARER_TOKEN: z.string().min(32).max(512).optional(),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  })
  .superRefine((value, context) => {
    if (value.AUTH_SESSION_SECRET === value.AUTH_THROTTLE_SECRET) {
      context.addIssue({
        code: "custom",
        path: ["AUTH_SESSION_SECRET"],
        message: "Session and throttle secrets must be independent.",
      });
    }
    if (
      value.AUTH_LOGIN_DIRECTORY_SECRET === value.AUTH_THROTTLE_SECRET ||
      value.AUTH_LOGIN_DIRECTORY_SECRET === value.AUTH_SESSION_SECRET
    ) {
      context.addIssue({
        code: "custom",
        path: ["AUTH_LOGIN_DIRECTORY_SECRET"],
        message: "Login directory, session, and throttle secrets must be independent.",
      });
    }
  });

export interface ApiConfig {
  nodeEnv: "development" | "test" | "production";
  host: string;
  port: number;
  allowedOrigins: ReadonlySet<string>;
  trustProxyHops: number;
  databaseUrl: string;
  databaseAutoMigrate: boolean;
  redisUrl: string;
  s3Endpoint: string;
  s3Region: string;
  s3Bucket: string;
  s3AccessKeyId: string;
  s3SecretAccessKey: string;
  s3ForcePathStyle: boolean;
  authThrottleSecret: string;
  authLoginDirectorySecret: string;
  authSessionSecret: string;
  bankingDataEncryptionKey: string;
  bankingDataEncryptionKeyVersion: string;
  authSessionIdleMs: number;
  authSessionAbsoluteMs: number;
  metricsBearerToken: string | null;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  const value = environmentSchema.parse(environment);
  return {
    nodeEnv: value.NODE_ENV,
    host: value.API_HOST,
    port: value.API_PORT,
    allowedOrigins: new Set(
      value.API_ALLOWED_ORIGINS.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
    trustProxyHops: value.API_TRUST_PROXY_HOPS,
    databaseUrl: value.DATABASE_URL,
    databaseAutoMigrate: value.DATABASE_AUTO_MIGRATE === "true",
    redisUrl: value.REDIS_URL,
    s3Endpoint: value.S3_ENDPOINT,
    s3Region: value.S3_REGION,
    s3Bucket: value.S3_BUCKET,
    s3AccessKeyId: value.S3_ACCESS_KEY_ID,
    s3SecretAccessKey: value.S3_SECRET_ACCESS_KEY,
    s3ForcePathStyle: value.S3_FORCE_PATH_STYLE === "true",
    authThrottleSecret: value.AUTH_THROTTLE_SECRET,
    authLoginDirectorySecret: value.AUTH_LOGIN_DIRECTORY_SECRET,
    authSessionSecret: value.AUTH_SESSION_SECRET,
    bankingDataEncryptionKey: value.BANKING_DATA_ENCRYPTION_KEY,
    bankingDataEncryptionKeyVersion: value.BANKING_DATA_ENCRYPTION_KEY_VERSION,
    authSessionIdleMs: value.AUTH_SESSION_IDLE_MINUTES * 60 * 1000,
    authSessionAbsoluteMs: value.AUTH_SESSION_ABSOLUTE_HOURS * 60 * 60 * 1000,
    metricsBearerToken: value.METRICS_BEARER_TOKEN ?? null,
  };
}
