/**
 * Environment Configuration
 *
 * Loads and validates environment variables.
 */

import { z } from 'zod';

// Database schema
const DatabaseSchema = z.object({
  url: z.string().url(),
  poolSize: z.number().int().min(1).default(10),
  idleTimeoutMs: z.number().int().min(1000).default(30000),
});

// API schema
const APISchema = z.object({
  host: z.string().default('0.0.0.0'),
  port: z.number().int().min(1).max(65535).default(3000),
});

// Worker schema
const WorkerSchema = z.object({
  concurrency: z.number().int().min(1).default(5),
  pollIntervalMs: z.number().int().min(100).default(1000),
});

// AI schema
const AISchema = z.object({
  enableAI: z.boolean().default(true),
  quotaUserPerMinute: z.number().int().min(1).default(5),
  quotaUserPerDay: z.number().int().min(1).default(50),
  quotaBucketSize: z.number().int().min(1).default(1000),
  quotaRefillRate: z.number().int().min(1).default(100),
});

// Groq schema
const GroqSchema = z.object({
  apiKey: z.string().min(1),
  baseUrl: z.string().url().default('https://api.groq.com/openai/v1'),
  model: z.string().default('llama-3.3-70b-versatile'),
  maxTokens: z.number().int().min(1).default(1024),
  temperature: z.number().min(0).max(2).default(0.1),
});

// Gemini schema
const GeminiSchema = z.object({
  apiKey: z.string().min(1),
  baseUrl: z.string().url().default('https://generativelanguage.googleapis.com/v1beta'),
  model: z.string().default('gemini-2.0-flash'),
  maxTokens: z.number().int().min(1).default(1024),
  temperature: z.number().min(0).max(2).default(0.1),
});

// GLM schema
const GLMSchema = z.object({
  apiKey: z.string().min(1),
  baseUrl: z.string().url().default('https://open.bigmodel.cn/api/paas/v4'),
  model: z.string().default('glm-4-flash'),
  maxTokens: z.number().int().min(1).default(1024),
  temperature: z.number().min(0).max(2).default(0.1),
});

// Google schema
const GoogleSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  redirectUri: z.string().url(),
});

// OpenClaw schema
const OpenClawSchema = z.object({
  webhookSecret: z.string().min(1),
  apiKey: z.string().min(1),
  instanceId: z.string().min(1),
});

// Security schema
const SecuritySchema = z.object({
  encryptionKey: z.string().length(64), // 32 bytes hex
  hmacKey: z.string().length(64), // 32 bytes hex
});

// Main config schema
export const ConfigSchema = z.object({
  nodeEnv: z.enum(['development', 'test', 'production']).default('development'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  database: DatabaseSchema,
  api: APISchema,
  worker: WorkerSchema,
  ai: AISchema,
  groq: GroqSchema,
  gemini: GeminiSchema,
  glm: GLMSchema,
  google: GoogleSchema,
  openclaw: OpenClawSchema,
  security: SecuritySchema,
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Load configuration from environment
 */
export function loadConfig(): Config {
  return ConfigSchema.parse({
    nodeEnv: process.env['NODE_ENV'] ?? 'development',
    logLevel: process.env['LOG_LEVEL'] ?? 'info',

    database: {
      url: process.env['DATABASE_URL'] ?? 'postgresql://postgres:postgres@localhost:5432/sdj_assistant',
      poolSize: parseInt(process.env['DATABASE_POOL_SIZE'] ?? '10', 10),
      idleTimeoutMs: parseInt(process.env['DATABASE_IDLE_TIMEOUT_MS'] ?? '30000', 10),
    },

    api: {
      host: process.env['API_HOST'] ?? '0.0.0.0',
      port: parseInt(process.env['API_PORT'] ?? '3000', 10),
    },

    worker: {
      concurrency: parseInt(process.env['WORKER_CONCURRENCY'] ?? '5', 10),
      pollIntervalMs: parseInt(process.env['JOB_POLL_INTERVAL_MS'] ?? '1000', 10),
    },

    ai: {
      enableAI: process.env['ENABLE_AI_INTERPRETATION'] !== 'false',
      quotaUserPerMinute: parseInt(process.env['AI_QUOTA_USER_PER_MINUTE'] ?? '5', 10),
      quotaUserPerDay: parseInt(process.env['AI_QUOTA_USER_PER_DAY'] ?? '50', 10),
      quotaBucketSize: parseInt(process.env['AI_QUOTA_BUCKET_SIZE'] ?? '1000', 10),
      quotaRefillRate: parseInt(process.env['AI_QUOTA_REFILL_RATE'] ?? '100', 10),
    },

    groq: {
      apiKey: process.env['GROQ_API_KEY'] ?? '',
      baseUrl: process.env['GROQ_BASE_URL'] ?? 'https://api.groq.com/openai/v1',
      model: process.env['GROQ_MODEL'] ?? 'llama-3.3-70b-versatile',
      maxTokens: parseInt(process.env['GROQ_MAX_TOKENS'] ?? '1024', 10),
      temperature: parseFloat(process.env['GROQ_TEMPERATURE'] ?? '0.1'),
    },

    gemini: {
      apiKey: process.env['GEMINI_API_KEY'] ?? '',
      baseUrl: process.env['GEMINI_BASE_URL'] ?? 'https://generativelanguage.googleapis.com/v1beta',
      model: process.env['GEMINI_MODEL'] ?? 'gemini-2.0-flash',
      maxTokens: parseInt(process.env['GEMINI_MAX_TOKENS'] ?? '1024', 10),
      temperature: parseFloat(process.env['GEMINI_TEMPERATURE'] ?? '0.1'),
    },

    glm: {
      apiKey: process.env['GLM_API_KEY'] ?? '',
      baseUrl: process.env['GLM_BASE_URL'] ?? 'https://open.bigmodel.cn/api/paas/v4',
      model: process.env['GLM_MODEL'] ?? 'glm-4-flash',
      maxTokens: parseInt(process.env['GLM_MAX_TOKENS'] ?? '1024', 10),
      temperature: parseFloat(process.env['GLM_TEMPERATURE'] ?? '0.1'),
    },

    google: {
      clientId: process.env['GOOGLE_CLIENT_ID'] ?? '',
      clientSecret: process.env['GOOGLE_CLIENT_SECRET'] ?? '',
      redirectUri: process.env['GOOGLE_REDIRECT_URI'] ?? 'http://localhost:3000/auth/google/callback',
    },

    openclaw: {
      webhookSecret: process.env['OPENCLAW_WEBHOOK_SECRET'] ?? '',
      apiKey: process.env['OPENCLAW_API_KEY'] ?? '',
      instanceId: process.env['OPENCLAW_INSTANCE_ID'] ?? '',
    },

    security: {
      encryptionKey: process.env['ENCRYPTION_KEY'] ?? '0'.repeat(64),
      hmacKey: process.env['HMAC_KEY'] ?? '0'.repeat(64),
    },
  });
}

// Singleton config instance
let configInstance: Config | null = null;

export function getConfig(): Config {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

export function resetConfig(): void {
  configInstance = null;
}
