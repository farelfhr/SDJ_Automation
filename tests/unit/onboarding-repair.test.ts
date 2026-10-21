import { describe, expect, it, vi } from 'vitest';
import { runInNewContext } from 'node:vm';
import { CryptoBox, Database, GoogleOnboarding, type BrowserSession } from '@sdj/infrastructure';
import { FakeTrackerGateway, FakeClock, MemoryStore } from '@sdj/testing';
import type { Config } from '@sdj/config';
import type { TrackerRepairProgress } from '@sdj/application';
import { createApp } from '../../apps/api/src/app.js';
import { clientScript } from '../../apps/api/src/onboarding-client.js';

function setup(request?: typeof fetch) {
  const url = 'postgresql://synthetic:synthetic@127.0.0.1:5432/synthetic';
  const db = new Database({ app: url, ingress: url, scheduler: url });
  const tenant = vi.spyOn(db, 'tenant').mockRejectedValue(new Error('UNEXPECTED_DATABASE_ACCESS'));
  const config: Config = {
    nodeEnv: 'test',
    remindersEnabled: false,
    host: '127.0.0.1',
    port: 3000,
    publicBaseUrl: 'https://synthetic.example',
    appDatabaseUrl: url,
    ingressDatabaseUrl: url,
    schedulerDatabaseUrl: url,
    encryptionKey: 'a'.repeat(64),
    lookupKey: 'b'.repeat(64),
    channelKey: 'c'.repeat(64),
    channelKeyId: 'synthetic',
    channelAccountId: 'synthetic',
    googleClientId: 'synthetic',
    googleClientSecret: 'synthetic',
    googlePickerKey: 'synthetic',
    googleAppId: '123',
    liveAI: false,
    allowLiveSheets: true,
  };
  const session: BrowserSession = {
    id: crypto.randomUUID(),
    user_id: crypto.randomUUID(),
    identity_id: crypto.randomUUID(),
    source_message_id: crypto.randomUUID(),
    status: 'file_selection',
    expires_at: new Date(Date.now() + 600000),
    csrf_hash: null,
    oauth_state_hash: null,
    pkce_ciphertext: null,
    pending_google_connection_id: crypto.randomUUID(),
    pending_tracker_id: null,
    channel_challenge_hash: null,
    challenge_attempts: 0,
    ai_allowed: false,
  };
  const sheets = Object.assign(new FakeTrackerGateway(), {
    repairStep: vi.fn(async (): Promise<TrackerRepairProgress> => ({
      repairing: true,
      fingerprint: 'synthetic-fingerprint',
      progress: { repairedValidationCells: 3, resetInputCells: 1, convertedInputCells: 2 },
    })),
  });
  const box = new CryptoBox(config.encryptionKey, config.lookupKey);
  const onboarding = new GoogleOnboarding(
    db,
    box,
    sheets,
    { accessToken: async () => 'synthetic-only' },
    config,
    request ?? fetch
  );
  return { db, tenant, session, sheets, onboarding, config };
}

describe('Kelanjutan perbaikan terikat sesi dan tidak mengaktifkan tracker terlalu dini', () => {
  it('mengembalikan 202 dan token kelanjutan melalui API tanpa kandidat/challenge', async () => {
    const s = setup();
    const app = createApp({
      store: new MemoryStore(new FakeClock()),
      onboarding: {
        exchange: async () => ({ cookie: 'synthetic', csrf: 'synthetic' }),
        session: async () => s.session,
        checkCSRF: () => {},
        oauthStart: async () => '',
        oauthCallback: async () => {},
        picker: async () => ({ accessToken: 'synthetic', apiKey: 'synthetic', appId: '123' }),
        tabs: async () => [],
        cancel: async () => {},
        select: s.onboarding.select.bind(s.onboarding),
      },
      channelKey: s.config.channelKey,
      channelKeyId: 'synthetic',
      channelAccountId: 'synthetic',
      publicBaseUrl: s.config.publicBaseUrl,
    });
    try {
      const r = await app.inject({
        method: 'POST',
        url: '/connect/tracker',
        payload: { spreadsheet_id: 'synthetic-file', sheet_id: 7, repair_version: 1 },
      });
      expect(r.statusCode).toBe(202);
      const body = r.json<{ accepted: boolean; repairing: boolean; continuationToken: string }>();
      expect(body).toMatchObject({ accepted: false, repairing: true });
      const next = await app.inject({
        method: 'POST',
        url: '/connect/tracker',
        payload: {
          spreadsheet_id: 'synthetic-file',
          sheet_id: 7,
          continuation_token: body.continuationToken,
          repair_version: 1,
        },
      });
      expect(next.statusCode).toBe(202);
      expect(s.tenant).not.toHaveBeenCalled();
      expect(s.sheets.repairStep).toHaveBeenCalledTimes(2);
      expect(s.session.pending_tracker_id).toBeNull();
      const legacy = await app.inject({
        method: 'POST',
        url: '/connect/tracker',
        payload: { spreadsheet_id: 'synthetic-file', sheet_id: 7 },
      });
      expect(legacy.statusCode).toBe(409);
      expect(legacy.json()).toMatchObject({ error: { code: 'CLIENT_UPDATE_REQUIRED' } });
    } finally {
      await app.close();
      await s.db.close();
    }
  });
  it('tidak menampilkan tab cadangan internal pada pilihan tracker', async () => {
    const s = setup(async () =>
      Response.json({
        sheets: [
          { properties: { sheetId: 7, title: 'Tracker' } },
          {
            properties: { sheetId: 8, title: '_SDJ_Backup_private', hidden: true },
            developerMetadata: [{ metadataKey: 'sdj.repair.run.v1' }],
          },
          { properties: { sheetId: 9, title: 'Tracker pribadi lain', hidden: true } },
        ],
      })
    );
    try {
      expect(await s.onboarding.tabs(s.session, 'synthetic-file')).toEqual([
        { id: 7, title: 'Tracker' },
        { id: 9, title: 'Tracker pribadi lain' },
      ]);
    } finally {
      await s.db.close();
    }
  });
  it.each(['user', 'session', 'connection', 'file', 'tab', 'tamper', 'expired'] as const)(
    'menolak token yang tidak sesuai: %s sebelum mengakses sheet',
    async (kind) => {
      const s = setup();
      try {
        const first = await s.onboarding.select(s.session, 'synthetic-file', 7);
        if (!first || !('repairing' in first)) throw new Error('EXPECTED_PROGRESS');
        let token = first.continuationToken,
          file = 'synthetic-file',
          tab = 7;
        const session = { ...s.session };
        if (kind === 'user') session.user_id = crypto.randomUUID();
        if (kind === 'session') session.id = crypto.randomUUID();
        if (kind === 'connection') session.pending_google_connection_id = crypto.randomUUID();
        if (kind === 'file') file = 'another-synthetic-file';
        if (kind === 'tab') tab = 8;
        if (kind === 'tamper') token = 'X' + token.slice(1);
        if (kind === 'expired') session.expires_at = new Date(Date.now() - 1);
        await expect(s.onboarding.select(session, file, tab, false, token)).rejects.toMatchObject({
          code: kind === 'expired' ? 'ONBOARDING_EXPIRED' : 'TRACKER_REPAIR_TOKEN_INVALID',
        });
        expect(s.sheets.repairStep).toHaveBeenCalledTimes(1);
        expect(s.tenant).not.toHaveBeenCalled();
      } finally {
        await s.db.close();
      }
    }
  );
  it.each([false, true])(
    'melanjutkan refresh hingga konfirmasi tanpa klik tambahan; respons akhir hilang=%s',
    async (loseFinalResponse) => {
      const saved = new Map([
        [
          'sdjTrackerRepairV1',
          JSON.stringify({ spreadsheet_id: 'synthetic-file', sheet_id: 7, allow_ai: false }),
        ],
      ]);
      const elements = new Map<
        string,
        {
          checked: boolean;
          hidden: boolean;
          textContent: string;
          className: string;
          disabled: boolean;
          value: string;
          setAttribute: () => void;
          removeAttribute: () => void;
        }
      >();
      const element = (key: string) => {
        if (!elements.has(key))
          elements.set(key, {
            checked: false,
            hidden: false,
            textContent: '',
            className: '',
            disabled: false,
            value: '',
            setAttribute: () => {},
            removeAttribute: () => {},
          });
        return elements.get(key)!;
      };
      const payloads: unknown[] = [];
      const delays: number[] = [];
      let completed = false;
      runInNewContext(clientScript, {
        document: { cookie: '', querySelector: element },
        location: { assign: () => {} },
        sessionStorage: {
          getItem: (key: string) => saved.get(key) ?? null,
          setItem: (key: string, value: string) => saved.set(key, value),
          removeItem: (key: string) => saved.delete(key),
        },
        setTimeout: (callback: () => void, delay: number) => {
          delays.push(delay);
          queueMicrotask(callback);
          return 0;
        },
        fetch: async (path: string, init?: RequestInit) => {
          if (path === '/connect/status')
            return Response.json({
              status: completed ? 'channel_confirmation' : 'file_selection',
              ai_allowed: false,
            });
          payloads.push(JSON.parse(String(init?.body)));
          if (payloads.length <= 2)
            return Response.json(
              {
                repairing: true,
                continuationToken: `token-${payloads.length}`,
                progress: { convertedInputCells: payloads.length },
                ...(payloads.length === 1 ? { retrying: true, retryAfterMs: 61000 } : {}),
              },
              { status: 202 }
            );
          if (loseFinalResponse) {
            if (!completed) {
              completed = true;
              throw new TypeError('SYNTHETIC_FINAL_RESPONSE_LOST');
            }
            return Response.json(
              { error: { code: 'ONBOARDING_STATE_INVALID', message: 'Already completed' } },
              { status: 400 }
            );
          }
          return Response.json({
            accepted: true,
            configuration: {
              activityCount: 15,
              dateCount: 701,
              dateFrom: '2026-01-01',
              dateTo: '2027-12-02',
              convertedInputCells: 2,
              resetInputCells: 1,
            },
          });
        },
      });
      for (let i = 0; i < 5; i++) await new Promise<void>((resolve) => setImmediate(resolve));
      expect(payloads).toHaveLength(loseFinalResponse ? 4 : 3);
      expect(payloads[1]).toMatchObject({ continuation_token: 'token-1' });
      expect(payloads[2]).toMatchObject({ continuation_token: 'token-2' });
      expect(element('#confirmation-panel').hidden).toBe(false);
      if (loseFinalResponse)
        expect(element('#status').textContent).toContain('Kode konfirmasi sudah dikirim');
      else {
        expect(element('#status').textContent).toContain('2 isian dikonversi');
        expect(element('#status').textContent).toContain(
          '1 isian yang tidak dapat dipastikan dikosongkan'
        );
        expect(element('#status').textContent).toContain('tab cadangan tersembunyi');
        expect(element('#status').textContent).toContain('\n');
      }
      expect(saved.size).toBe(0);
      expect(delays).toContain(61000);
    }
  );
});
