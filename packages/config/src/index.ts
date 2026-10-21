import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { z } from 'zod';
export function loadEnvironment(): void {
  for (const file of ['.env'])
    if (existsSync(file)) {
      const values = parseEnv(readFileSync(file, 'utf8'));
      for (const [key, value] of Object.entries(values))
        if (process.env[key] === undefined) process.env[key] = value;
    }
}
const secret = z.string().regex(/^[a-f0-9]{64}$/i);
export const ConfigSchema = z
  .object({
    nodeEnv: z.enum(['development', 'test', 'production']),
    host: z.string(),
    port: z.coerce.number().int().min(1).max(65535),
    publicBaseUrl: z.string().url(),
    appDatabaseUrl: z.string().url(),
    ingressDatabaseUrl: z.string().url(),
    schedulerDatabaseUrl: z.string().url(),
    encryptionKey: secret,
    lookupKey: secret,
    channelKey: secret,
    channelKeyId: z.string().min(1),
    channelAccountId: z.string().min(1),
    googleClientId: z.string(),
    googleClientSecret: z.string(),
    googlePickerKey: z.string(),
    googleAppId: z.string(),
    liveAI: z.boolean(),
    remindersEnabled: z.boolean().default(false),
    allowLiveSheets: z.boolean(),
  })
  .strict();
export type Config = z.infer<typeof ConfigSchema>;
export function loadConfig(): Config {
  loadEnvironment();
  const result = ConfigSchema.safeParse({
    nodeEnv: process.env['NODE_ENV'] ?? 'development',
    host: process.env['API_HOST'] ?? '127.0.0.1',
    port: process.env['API_PORT'] ?? 3000,
    publicBaseUrl: process.env['PUBLIC_BASE_URL'] ?? 'http://localhost:3000',
    appDatabaseUrl: process.env['DATABASE_URL_APP'] ?? '',
    ingressDatabaseUrl: process.env['DATABASE_URL_INGRESS'] ?? '',
    schedulerDatabaseUrl: process.env['DATABASE_URL_SCHEDULER'] ?? '',
    encryptionKey: process.env['ENCRYPTION_KEY'] ?? '',
    lookupKey: process.env['LOOKUP_HMAC_KEY'] ?? '',
    channelKey: process.env['CHANNEL_HMAC_KEY'] ?? '',
    channelKeyId: process.env['CHANNEL_KEY_ID'] ?? 'local-v1',
    channelAccountId: process.env['CHANNEL_ACCOUNT_ID'] ?? 'sdj-local',
    googleClientId: process.env['GOOGLE_CLIENT_ID'] ?? '',
    googleClientSecret: process.env['GOOGLE_CLIENT_SECRET'] ?? '',
    googlePickerKey: process.env['GOOGLE_PICKER_API_KEY'] ?? '',
    googleAppId: process.env['GOOGLE_APP_ID'] ?? '',
    liveAI: process.env['AI_LIVE_ENABLED'] === 'true',
    remindersEnabled: process.env['REMINDERS_ENABLED'] === 'true',
    allowLiveSheets: process.env['SHEETS_LIVE_ENABLED'] === 'true',
  });
  if (!result.success)
    throw new Error(
      'CONFIG_INVALID: ' + result.error.issues.map((i) => i.path.join('.')).join(', ')
    );
  const config = result.data;
  if (config.nodeEnv === 'production' && !config.publicBaseUrl.startsWith('https://'))
    throw new Error('PUBLIC_BASE_URL_REQUIRES_HTTPS');
  if (new Set([config.encryptionKey, config.lookupKey, config.channelKey]).size !== 3)
    throw new Error('KEYS_MUST_BE_DISTINCT');
  for (const url of [
    config.appDatabaseUrl,
    config.ingressDatabaseUrl,
    config.schedulerDatabaseUrl,
  ]) {
    const connection = new URL(url);
    if (['postgres', 'service_role'].includes(connection.username.split('.')[0] ?? ''))
      throw new Error('RUNTIME_PRIVILEGED_ROLE_FORBIDDEN');
    if (connection.port === '6543') throw new Error('SESSION_POOLER_REQUIRED');
  }
  return config;
}
