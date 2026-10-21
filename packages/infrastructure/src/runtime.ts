import { PgReminderStore } from './reminders.js';
import { loadConfig } from '@sdj/config';
import { CommandService, ReminderService, systemClock } from '@sdj/application';
import { Database } from './db.js';
import { CryptoBox } from './crypto.js';
import { PgStore } from './store.js';
import { GoogleSheetsAdapter, GoogleTokens } from './google.js';
import { GoogleOnboarding } from './onboarding.js';
import { AIRouter, HTTPAIAdapter, PgAIState, targetsFromEnvironment } from './ai.js';
export function createRuntime() {
  const config = loadConfig();
  const db = new Database({
    app: config.appDatabaseUrl,
    ingress: config.ingressDatabaseUrl,
    scheduler: config.schedulerDatabaseUrl,
  });
  const crypto = new CryptoBox(config.encryptionKey, config.lookupKey),
    store = new PgStore(db, crypto, config.remindersEnabled);
  const tokens = new GoogleTokens(db, crypto, config.googleClientId, config.googleClientSecret);
  const sheets = new GoogleSheetsAdapter(tokens, config.allowLiveSheets);
  const onboarding = new GoogleOnboarding(db, crypto, sheets, tokens, config);
  const interpreter = new AIRouter(
    targetsFromEnvironment(config.liveAI),
    new PgAIState(db).scoped(),
    new HTTPAIAdapter(),
    () => new Date(),
    config.liveAI
  );
  const service = new CommandService(
    store,
    sheets,
    interpreter,
    onboarding,
    systemClock,
    config.publicBaseUrl
  );
  const reminders = new ReminderService(new PgReminderStore(db, crypto, config.channelAccountId));
  return { reminders, config, db, store, crypto, tokens, sheets, onboarding, interpreter, service };
}
