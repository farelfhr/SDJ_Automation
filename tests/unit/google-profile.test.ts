import { describe, it, expect, vi } from 'vitest';
import { CryptoBox, Database, GoogleOnboarding, type BrowserSession } from '@sdj/infrastructure';
import { ConfigSchema } from '@sdj/config';
import { FakeTrackerGateway } from '@sdj/testing';

function setup(
  connected = true,
  profile: Record<string, string> = { sub: 'synthetic-sub', given_name: 'Ahmad' }
) {
  const url = 'postgresql://synthetic:synthetic@localhost/synthetic';
  const config = ConfigSchema.parse({
    nodeEnv: 'test',
    host: '127.0.0.1',
    port: 3000,
    publicBaseUrl: 'https://synthetic.example',
    appDatabaseUrl: url,
    ingressDatabaseUrl: url,
    schedulerDatabaseUrl: url,
    encryptionKey: 'a'.repeat(64),
    lookupKey: 'b'.repeat(64),
    channelKey: 'c'.repeat(64),
    channelKeyId: 'test',
    channelAccountId: 'synthetic',
    googleClientId: 'synthetic',
    googleClientSecret: 'synthetic',
    googlePickerKey: 'synthetic',
    googleAppId: '123',
    liveAI: false,
    allowLiveSheets: true,
  });
  const db = new Database({ app: url, ingress: url, scheduler: url });
  const box = new CryptoBox(config.encryptionKey, config.lookupKey);
  const state = 'synthetic-state-with-enough-characters';
  const session: BrowserSession = {
    id: crypto.randomUUID(),
    user_id: crypto.randomUUID(),
    identity_id: crypto.randomUUID(),
    source_message_id: crypto.randomUUID(),
    status: 'oauth_pending',
    expires_at: new Date(Date.now() + 600000),
    csrf_hash: null,
    oauth_state_hash: box.digest(state),
    pkce_ciphertext: null,
    pending_google_connection_id: null,
    pending_tracker_id: null,
    channel_challenge_hash: null,
    challenge_attempts: 0,
    ai_allowed: false,
    purpose: 'profile',
    provider_policy_version: 'free-providers-v2',
  };
  session.pkce_ciphertext = box.seal(
    'synthetic-verifier',
    `onboarding:pkce:${session.user_id}:${session.id}`
  );
  const query = vi.fn(async (sql: string, _values?: unknown[]) => ({
    rowCount: sql.startsWith('SELECT g.id') && !connected ? 0 : 1,
    rows: [{ id: 'synthetic' }],
  }));
  vi.spyOn(db, 'tenant').mockImplementation(async (_actor, fn) =>
    fn({ query } as unknown as Parameters<typeof fn>[0])
  );
  const request = vi.fn<typeof fetch>(async (input) =>
    String(input).includes('/token')
      ? Response.json({ access_token: 'synthetic', scope: 'openid profile' })
      : Response.json(profile)
  );
  const sheets = new FakeTrackerGateway();
  const onboarding = new GoogleOnboarding(
    db,
    box,
    sheets,
    {
      accessToken: async () => {
        throw new Error('NO_GOOGLE_REFRESH');
      },
    },
    config,
    request
  );
  return { db, box, state, session, query, request, sheets, onboarding };
}
describe('Pembaruan profil Google terpisah dari tracker', () => {
  it('hanya meminta scope profil untuk pembaruan dan tetap memakai profile saat onboarding', async () => {
    const s = setup();
    try {
      const profile = new URL(
        await s.onboarding.oauthStart({ ...s.session, status: 'browser_bound' }, false)
      );
      expect(profile.searchParams.get('scope')).toBe('openid profile');
      const connect = new URL(
        await s.onboarding.oauthStart(
          { ...s.session, purpose: 'connect', status: 'browser_bound' },
          true
        )
      );
      expect(connect.searchParams.get('scope')).toBe(
        'openid profile https://www.googleapis.com/auth/drive.file'
      );
    } finally {
      await s.db.close();
    }
  });
  it('nama disimpan terenkripsi setelah subject dan identitas cocok tanpa mengganti token atau tracker', async () => {
    const s = setup();
    try {
      await s.onboarding.oauthCallback(s.session, s.state, 'synthetic-code');
      const update = s.query.mock.calls.find(([sql]) =>
        sql.startsWith('UPDATE sdj.users SET profile_name_ciphertext')
      );
      expect(update).toBeDefined();
      const ciphertext = update![1]![1] as Buffer;
      expect(ciphertext.toString()).not.toContain('Ahmad');
      expect(
        s.box.open(
          ciphertext,
          `user:profile:${s.session.user_id}`,
          (await import('zod')).z.string()
        )
      ).toBe('Ahmad');
      expect(
        s.query.mock.calls.some(([sql]) =>
          /UPDATE sdj.(google_connections|tracker_connections)|INSERT INTO sdj.(google_connections|tracker_connections)/.test(
            sql
          )
        )
      ).toBe(false);
      expect(s.sheets.writeCalls).toBe(0);
    } finally {
      await s.db.close();
    }
  });
  it('akun Google berbeda ditolak sebelum nama diperbarui', async () => {
    const s = setup(false);
    try {
      await expect(
        s.onboarding.oauthCallback(s.session, s.state, 'synthetic-code')
      ).rejects.toMatchObject({ code: 'PROFILE_ACCOUNT_MISMATCH' });
      expect(s.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE sdj.users'))).toBe(false);
    } finally {
      await s.db.close();
    }
  });
  it('nama opsional dan memakai name jika given_name kosong', async () => {
    for (const profile of [
      { sub: 'synthetic-sub' },
      { sub: 'synthetic-sub', given_name: '', name: 'Aisyah' },
    ]) {
      const s = setup(true, profile);
      try {
        await s.onboarding.oauthCallback(s.session, s.state, 'synthetic-code');
        const updated = s.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE sdj.users'));
        expect(updated).toBe('name' in profile);
      } finally {
        await s.db.close();
      }
    }
  });
  it('pembatalan memeriksa state dan tidak mengubah koneksi aktif', async () => {
    const s = setup();
    try {
      await expect(s.onboarding.oauthCancel(s.session, 'wrong')).rejects.toMatchObject({
        code: 'OAUTH_STATE_INVALID',
      });
      expect(s.query).not.toHaveBeenCalled();
      await s.onboarding.oauthCancel(s.session, s.state);
      expect(
        s.query.mock.calls.every(
          ([sql]) =>
            !sql.includes('UPDATE sdj.tracker_connections') &&
            !sql.includes('UPDATE sdj.google_connections')
        )
      ).toBe(true);
      await expect(s.onboarding.picker(s.session)).rejects.toMatchObject({
        code: 'ONBOARDING_STATE_INVALID',
      });
    } finally {
      await s.db.close();
    }
  });
});
