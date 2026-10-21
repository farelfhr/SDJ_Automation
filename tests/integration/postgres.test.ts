import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { ACTIVITIES } from '@sdj/domain';
import { CommandService, systemClock } from '@sdj/application';
import { loadConfig } from '@sdj/config';
import {
  Database,
  PgStore,
  CryptoBox,
  PgAIState,
  GoogleOnboarding,
  Maintenance,
  pg,
  databaseTLS,
} from '@sdj/infrastructure';
import { FakeTrackerGateway, FakeInterpreter, FakeOnboarding, syntheticEvent } from '@sdj/testing';
let db: Database, store: PgStore, maintenance: pg.Pool, box: CryptoBox;
let a: Awaited<ReturnType<PgStore['ingest']>>['actor'], b: typeof a;
const run = 'synthetic-' + randomBytes(6).toString('hex'),
  targets = ['groq', 'gemini', 'nvidia'].map((p) => run + '-' + p);
function event(text: string, sender = 'a') {
  return { ...syntheticEvent(text, run + '-' + sender, systemClock), channel_account_id: run };
}
async function maintenanceTx<T>(
  userId: string,
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await maintenance.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.user_id',$1,true)", [userId]);
    const r = await fn(client);
    await client.query('COMMIT');
    return r;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
beforeAll(async () => {
  const c = loadConfig();
  db = new Database({
    app: c.appDatabaseUrl,
    ingress: c.ingressDatabaseUrl,
    scheduler: c.schedulerDatabaseUrl,
  });
  box = new CryptoBox(c.encryptionKey, c.lookupKey);
  store = new PgStore(db, box);
  if (!process.env['DATABASE_URL_MAINTENANCE'])
    throw new Error('PRIMARY_MAINTENANCE_CREDENTIAL_REQUIRED');
  maintenance = new pg.Pool({
    connectionString: process.env['DATABASE_URL_MAINTENANCE'],
    ssl: databaseTLS(),
    connectionTimeoutMillis: 10000,
    max: 2,
  });
  a = (await store.ingest(event('bantuan'), new Date())).actor;
  b = (await store.ingest(event('bantuan', 'b'), new Date())).actor;
}, 30000);
afterAll(async () => {
  if (maintenance) {
    for (const actor of [a, b])
      if (actor)
        await maintenanceTx(actor.userId, async (client) => {
          const unresolved = await client.query(
            "SELECT id FROM sdj.write_groups WHERE status IN ('prepared','sending','uncertain','needs_review')"
          );
          if (unresolved.rowCount) throw new Error('SYNTHETIC_UNRESOLVED_GROUP_RETAINED');
          for (const table of [
            'onboarding_sessions',
            'deliveries',
            'reminder_occurrences',
            'jobs',
            'mutations',
            'command_items',
            'write_groups',
            'commands',
            'activity_bindings',
            'tracker_connections',
            'google_connections',
            'provider_attempts',
            'inbound_messages',
            'channel_identities',
            'users',
          ])
            await client.query('DELETE FROM sdj.' + table);
        });
    await maintenance.query('DELETE FROM sdj.ai_targets WHERE id=ANY($1)', [targets]);
    await maintenance.query('DELETE FROM sdj.quota_buckets WHERE owner_ref=ANY($1)', [targets]);
    await maintenance.end();
  }
  await db?.close();
}, 30000);
describe('Integrasi PostgreSQL environment utama', () => {
  it('runtime bukan owner/superuser/BYPASSRLS', async () => {
    await expect.poll(() => store.health(), { timeout: 20000, interval: 1000 }).toBe(true);
    const r = await db.app.query('SELECT current_user');
    expect(r.rows[0].current_user).toBe('sdj_app');
  });
  it('tanpa tenant SELECT kosong dan INSERT ditolak', async () => {
    expect((await db.app.query('SELECT id FROM sdj.users')).rowCount).toBe(0);
    await expect(
      db.app.query('INSERT INTO sdj.users(id) VALUES($1)', [crypto.randomUUID()])
    ).rejects.toThrow();
  });
  it('SELECT/UPDATE tanpa filter user tetap terisolasi dan context tidak bocor', async () => {
    await db.tenant(a, async (client) => {
      expect((await client.query('SELECT id FROM sdj.users')).rows).toEqual([{ id: a.userId }]);
      expect(
        (await client.query('UPDATE sdj.users SET timezone=timezone WHERE id=$1', [b.userId]))
          .rowCount
      ).toBe(0);
    });
    expect((await db.app.query('SELECT id FROM sdj.users')).rowCount).toBe(0);
  });
  it('spoof source message ditolak', async () => {
    await expect(store.message({ ...a, sourceMessageId: b.sourceMessageId })).rejects.toThrow();
  });
  it('konteks rekap terenkripsi, persisten per identity, dan tidak terlihat peserta lain', async () => {
    const command = await store.command(a);
    await store.saveSummaryContext(a, command.id, {
      action: 'monthly_summary',
      date: '2026-10-15',
    });
    await store.finish(a, command.id, 'completed', 'synthetic-summary');
    expect(await store.lastSummaryContext(a)).toEqual({
      action: 'monthly_summary',
      date: '2026-10-15',
    });
    expect(await store.lastSummaryContext(b)).toBeNull();
    await expect(
      store.saveSummaryContext(b, command.id, { action: 'daily_summary', date: '2026-10-14' })
    ).rejects.toThrow();
    await db.tenant(a, async (client) => {
      const result = await client.query<{ intent_ciphertext: Buffer }>(
        'SELECT intent_ciphertext FROM sdj.commands WHERE id=$1',
        [command.id]
      );
      expect(result.rows[0]!.intent_ciphertext.toString()).not.toContain('monthly_summary');
      await client.query(
        "UPDATE sdj.commands SET created_at=now()-interval '31 minutes' WHERE id=$1",
        [command.id]
      );
    });
    expect(await store.lastSummaryContext(a)).toBeNull();
    const legacy = (await store.ingest(event('rekap bulan ini'), new Date())).actor;
    const legacyCommand = await store.command(legacy);
    await store.finish(
      legacy,
      legacyCommand.id,
      'completed',
      'Progres 2026-10 (2026-10-01 s.d. 2026-10-15):\nsynthetic-only'
    );
    expect(await store.lastSummaryContext(legacy)).toEqual({
      action: 'monthly_summary',
      date: '2026-10-15',
    });
    expect(await store.lastSummaryContext(b)).toBeNull();
  });
  it('izin AI dipersistenkan per peserta dan actor palsu tidak dapat mengubahnya', async () => {
    await db.tenant(a, async (client) => {
      await client.query(
        "UPDATE sdj.users SET status='active',privacy_notice_version='privacy-v1',consented_at=now() WHERE id=$1",
        [a.userId]
      );
    });
    await store.setAIConsent(a, true);
    expect((await store.user(a)).aiAllowed).toBe(true);
    expect((await store.user(b)).aiAllowed).toBe(false);
    await expect(
      store.setAIConsent({ ...a, sourceMessageId: b.sourceMessageId }, false)
    ).rejects.toThrow();
    expect((await store.user(a)).aiAllowed).toBe(true);
    await store.setAIConsent(a, false);
    expect((await store.user(a)).aiAllowed).toBe(false);
    await expect(store.setAIConsent(b, true)).rejects.toThrow();
  });
  it('ingress dan scheduler tidak membaca token/journal', async () => {
    await expect(db.ingress.query('SELECT * FROM sdj.google_connections')).rejects.toThrow();
    await expect(db.scheduler.query('SELECT * FROM sdj.mutations')).rejects.toThrow();
  });
  it('dedupe paralel menyimpan satu job dan collision dikarantina', async () => {
    const message = event('zuhur 3');
    const r = await Promise.all(Array.from({ length: 5 }, () => store.ingest(message, new Date())));
    expect(r.filter((v) => !v.duplicate)).toHaveLength(1);
    await db.tenant(a, async (client) => {
      expect(
        (
          await client.query('SELECT id FROM sdj.jobs WHERE message_id=$1', [
            r[0]?.actor.sourceMessageId,
          ])
        ).rowCount
      ).toBe(1);
    });
    expect((await store.ingest({ ...message, text: 'zuhur 2' }, new Date())).collision).toBe(true);
  });
  it('nonce replay ditolak', async () => {
    const nonce = run + '-nonce';
    expect(await store.reserveNonce(run, nonce, new Date())).toBe(true);
    expect(await store.reserveNonce(run, nonce, new Date())).toBe(false);
  });
  it('composite FK menolak koneksi Google peserta lain', async () => {
    const id = crypto.randomUUID();
    await db.tenant(b, async (client) => {
      await client.query(
        "INSERT INTO sdj.google_connections(id,user_id,subject_lookup,subject_ciphertext,granted_scopes,status) VALUES($1,$2,$3,$4,'{}','pending')",
        [
          id,
          b.userId,
          box.digest(run + '-b'),
          box.seal('synthetic-subject', `google:subject:${b.userId}:${id}`),
        ]
      );
    });
    await expect(
      db.tenant(a, async (client) => {
        await client.query(
          "INSERT INTO sdj.tracker_connections(id,user_id,google_connection_id,spreadsheet_id,sheet_id,sheet_title,template_id,structure_fingerprint,status) VALUES($1,$2,$3,$4,0,'synthetic','sdj-v1.2-full-v1','synthetic','pending')",
          [crypto.randomUUID(), a.userId, id, run + '-cross']
        );
      })
    ).rejects.toThrow();
  });
  it('claim dibatasi peserta sintetis dan stale lease ditolak', async () => {
    const job = await store.claimJob(run, a.userId);
    expect(job?.userId).toBe(a.userId);
    if (!job) return;
    await expect(store.completeJob({ ...job, token: 'wrong' })).rejects.toThrow('STALE_LEASE');
    await store.completeJob(job);
  });
  it('advisory lock menahan writer kedua lintas koneksi', async () => {
    let release: () => void = () => {};
    const wait = new Promise<void>((r) => {
      release = r;
    });
    let ready: () => void = () => {};
    const started = new Promise<void>((r) => {
      ready = r;
    });
    const first = db.lock(run, async () => {
      ready();
      await wait;
      return true;
    });
    await started;
    expect(await db.lock(run, async () => false)).toBeNull();
    release();
    expect(await first).toBe(true);
  });
  it('prioritas dan reservation disimpan di DB utama dengan target sintetis', async () => {
    await db.tenant(a, async (client) => {
      await client.query(
        "UPDATE sdj.users SET status='active',ai_processing_allowed=true,privacy_notice_version='v1',consented_at=now() WHERE id=$1",
        [a.userId]
      );
    });
    for (const [i, id] of targets.entries()) {
      await maintenance.query('INSERT INTO sdj.quota_buckets(owner_ref) VALUES($1)', [id]);
      await maintenance.query(
        "INSERT INTO sdj.ai_targets(id,provider,model_id,credential_ref,quota_owner,enabled,requests_per_minute,requests_per_day) VALUES($1,$2,'synthetic','env:SYNTHETIC',$1,true,10,50)",
        [id, ['groq', 'gemini', 'nvidia'][i]]
      );
    }
    const state = new PgAIState(db).scoped(),
      selected: string[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await state.reserve(a.userId, targets, new Date());
      if (r) {
        selected.push(r.targetId);
        await state.settle(r.attemptId, { ok: true });
      }
    }
    expect(selected).toEqual([targets[0], targets[0], targets[0], targets[0]]);
    expect(selected[3]).toBe(selected[0]);
  });
  it('pencatatan gabungan dan undo memakai journal/outbox DB utama', async () => {
    const connection = crypto.randomUUID(),
      trackerId = crypto.randomUUID();
    await db.tenant(a, async (client) => {
      await client.query(
        "INSERT INTO sdj.google_connections(id,user_id,subject_lookup,subject_ciphertext,refresh_token_ciphertext,granted_scopes,status) VALUES($1,$2,$3,$4,$5,'{}','active')",
        [
          connection,
          a.userId,
          box.digest(run + '-a'),
          box.seal('synthetic-subject', `google:subject:${a.userId}:${connection}`),
          box.seal('synthetic-token', `google:refresh:${a.userId}:${connection}`),
        ]
      );
      await client.query(
        "INSERT INTO sdj.tracker_connections(id,user_id,google_connection_id,spreadsheet_id,sheet_id,sheet_title,template_id,structure_fingerprint,status) VALUES($1,$2,$3,$4,0,'[NEW] SDJ v1.2','sdj-v1.2-full-v1','synthetic-full-v1','active')",
        [trackerId, a.userId, connection, run + '-sheet']
      );
      for (const [index, definition] of ACTIVITIES.entries())
        await client.query(
          'INSERT INTO sdj.activity_bindings(id,user_id,tracker_id,template_id,activity_id,row_index,normalized_label_hash,binding_version) VALUES($1,$2,$3,$4,$5,$6,$7,1)',
          [
            crypto.randomUUID(),
            a.userId,
            trackerId,
            'sdj-v1.2-full-v1',
            definition.id,
            index + 8,
            'synthetic',
          ]
        );
    });
    const gateway = new FakeTrackerGateway(),
      service = new CommandService(
        store,
        gateway,
        new FakeInterpreter(),
        new FakeOnboarding(),
        systemClock
      );
    const r = await store.ingest(event('zuhur 3,tilawah 0,5 halaman,dhuha sudah'), new Date());
    await service.process(r.actor);
    const group = await store.lastGroup(r.actor, trackerId);
    expect(group?.status).toBe('verified');
    expect(group?.mutations).toHaveLength(3);
    expect(gateway.writeCalls).toBe(1);
    await db.tenant(a, async (client) => {
      expect(
        (
          await client.query('SELECT id FROM sdj.deliveries WHERE command_id=$1', [
            group?.commandId,
          ])
        ).rowCount
      ).toBe(1);
    });
    const undo = await store.ingest(event('batal'), new Date());
    await service.process(undo.actor);
    expect((await store.lastGroup(undo.actor, trackerId))?.undoOfId).toBe(group?.id);
  });
  it('OAuth state sekali pakai, CSRF, dan challenge terikat DM asal', async () => {
    const c = loadConfig();
    const configuration = {
      mode: 'adapted' as const,
      activityCount: 15,
      dateCount: 31,
      dateFrom: '2026-10-01',
      dateTo: '2026-10-31',
    };
    const syntheticSheets = new (class extends FakeTrackerGateway {
      override async validate(...args: Parameters<FakeTrackerGateway['validate']>) {
        return { ...(await super.validate(...args)), configuration };
      }
    })();
    const onboarding = new GoogleOnboarding(
      db,
      box,
      syntheticSheets,
      { accessToken: async () => 'synthetic-access' },
      {
        ...c,
        allowLiveSheets: true,
        googleClientId: 'synthetic-client',
        googleClientSecret: 'synthetic-secret',
        googlePickerKey: 'synthetic-picker',
        googleAppId: '123456',
      },
      async (input) => {
        if (String(input) === 'https://oauth2.googleapis.com/token')
          return Response.json({
            access_token: 'synthetic-access',
            refresh_token: 'synthetic-refresh',
            scope: 'openid profile https://www.googleapis.com/auth/drive.file',
          });
        if (String(input) === 'https://openidconnect.googleapis.com/v1/userinfo')
          return Response.json({ sub: run + '-subject', given_name: 'Ahmad' });
        throw new Error('UNEXPECTED_GOOGLE_URL');
      }
    );
    await store.command(a);
    const link = await onboarding.start(a),
      token = new URL(link).searchParams.get('token')!;
    const browser = await onboarding.exchange(token);
    await expect(onboarding.exchange(token)).rejects.toMatchObject({ code: 'ONBOARDING_EXPIRED' });
    await expect(onboarding.exchange(token, 'synthetic-wrong-browser')).rejects.toMatchObject({
      code: 'ONBOARDING_EXPIRED',
    });
    const otherLink = await onboarding.start(b);
    const otherBrowser = await onboarding.exchange(new URL(otherLink).searchParams.get('token')!);
    await expect(onboarding.exchange(token, otherBrowser.cookie)).rejects.toMatchObject({
      code: 'ONBOARDING_EXPIRED',
    });
    const resumed = await onboarding.exchange(token, browser.cookie);
    expect(resumed.cookie).toBe(browser.cookie);
    expect(resumed.csrf).not.toBe(browser.csrf);
    let session = await onboarding.session(browser.cookie);
    expect(() => onboarding.checkCSRF(session, 'wrong')).toThrow();
    expect(() => onboarding.checkCSRF(session, browser.csrf)).toThrow();
    browser.csrf = resumed.csrf;
    onboarding.checkCSRF(session, browser.csrf);
    const url = new URL(await onboarding.oauthStart(session, false)),
      state = url.searchParams.get('state')!;
    const duringOAuth = await onboarding.exchange(token, browser.cookie);
    browser.csrf = duringOAuth.csrf;
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    session = await onboarding.session(browser.cookie);
    expect(session.status).toBe('oauth_pending');
    onboarding.checkCSRF(session, browser.csrf);
    await expect(
      onboarding.oauthCallback(session, 'wrong', 'synthetic-code')
    ).rejects.toMatchObject({ code: 'OAUTH_STATE_INVALID' });
    await onboarding.oauthCallback(session, state, 'synthetic-code');
    await expect(onboarding.oauthCallback(session, state, 'synthetic-code')).rejects.toMatchObject({
      code: 'OAUTH_STATE_INVALID',
    });
    session = await onboarding.session(browser.cookie);
    expect(session.ai_allowed).toBe(false);
    expect(await onboarding.select(session, run + '-oauth-sheet', 7, true)).toEqual(configuration);
    const bindings = await db.tenant(a, (client) =>
      client.query(
        'SELECT activity_id,row_index FROM sdj.activity_bindings WHERE tracker_id=(SELECT pending_tracker_id FROM sdj.onboarding_sessions WHERE id=$1) ORDER BY row_index',
        [session.id]
      )
    );
    expect(bindings.rows.map((row) => row.activity_id)).toEqual(ACTIVITIES.map((a) => a.id));
    expect(bindings.rows.map((row) => row.row_index)).toEqual(ACTIVITIES.map((_a, i) => i + 8));
    const challenge = await db.tenant(a, async (client) => {
      const r = await client.query<{ id: string; body_ciphertext: Buffer }>(
        "SELECT id,body_ciphertext FROM sdj.deliveries WHERE kind='onboarding' ORDER BY created_at DESC LIMIT 1"
      );
      const d = r.rows[0]!;
      return box
        .open(
          d.body_ciphertext,
          `delivery:body:${a.userId}:${d.id}`,
          (await import('zod')).z.string()
        )
        .split('hubungkan ')[1]!;
    });
    await expect(onboarding.confirm(b, 'hubungkan ' + challenge)).rejects.toMatchObject({
      code: 'CHALLENGE_INVALID',
    });
    expect(await onboarding.confirm(a, 'hubungkan ' + challenge)).toBe(true);
    await expect(onboarding.exchange(token, browser.cookie)).rejects.toMatchObject({
      code: 'ONBOARDING_EXPIRED',
    });
    await expect(onboarding.session(browser.cookie)).rejects.toMatchObject({
      code: 'ONBOARDING_EXPIRED',
    });
    expect((await store.tracker(a))?.spreadsheetId).toBe(run + '-oauth-sheet');
    expect((await store.user(a)).aiAllowed).toBe(true);
    expect((await store.user(a)).providerPolicyVersion).toBe('free-providers-v2');
    const trackerBefore = await store.tracker(a);
    const profileLink = await onboarding.start(a, 'profile');
    const profileBrowser = await onboarding.exchange(
      new URL(profileLink).searchParams.get('token')!
    );
    let profileSession = await onboarding.session(profileBrowser.cookie);
    const profileUrl = new URL(await onboarding.oauthStart(profileSession, false));
    expect(profileUrl.searchParams.get('scope')).toBe('openid profile');
    profileSession = await onboarding.session(profileBrowser.cookie);
    await onboarding.oauthCallback(
      profileSession,
      profileUrl.searchParams.get('state')!,
      'synthetic-profile-code'
    );
    expect(await store.tracker(a)).toEqual(trackerBefore);
    await db.tenant(a, async (client) => {
      const row = (
        await client.query<{ profile_name_ciphertext: Buffer }>(
          'SELECT profile_name_ciphertext FROM sdj.users'
        )
      ).rows[0]!;
      expect(row.profile_name_ciphertext.toString()).not.toContain('Ahmad');
      expect(
        box.open(
          row.profile_name_ciphertext,
          `user:profile:${a.userId}`,
          (await import('zod')).z.string()
        )
      ).toBe('Ahmad');
    });
  }, 60000);
  it('retensi menghapus teks terminal lama dan akun sintetis tanpa menyentuh peserta lain', async () => {
    // Only synthetic participant b is aged and deleted; participant a must survive.
    await store.command(b);
    await db.tenant(b, async (client) => {
      await client.query("UPDATE sdj.inbound_messages SET received_at=now()-interval '8 days'");
      await client.query("UPDATE sdj.commands SET status='completed'");
      await client.query("UPDATE sdj.jobs SET status='done'");
    });
    const retention = new Maintenance(maintenance);
    await retention.run([b.userId]);
    await db.tenant(b, async (client) => {
      expect(
        (await client.query('SELECT text_ciphertext FROM sdj.inbound_messages')).rows.every(
          (r) => r.text_ciphertext === null
        )
      ).toBe(true);
    });
    await db.tenant(b, async (client) => {
      await client.query("UPDATE sdj.users SET status='deleting',deletion_requested_at=now()");
    });
    await retention.run([b.userId]);
    await maintenanceTx(b.userId, async (client) => {
      expect((await client.query('SELECT id FROM sdj.users')).rowCount).toBe(0);
      expect((await client.query('SELECT user_id FROM sdj.deletion_tombstones')).rowCount).toBe(1);
    });
    expect((await store.user(a)).id).toBe(a.userId);
  });
  it('retensi journal 30 hari menjaga FK undo lalu menghapus payload terminal', async () => {
    await db.tenant(a, async (client) => {
      await client.query("UPDATE sdj.jobs SET status='done',created_at=now()-interval '31 days'");
      await client.query(
        "UPDATE sdj.deliveries SET status='sent',sent_at=now(),created_at=now()-interval '31 days'"
      );
      await client.query(
        "UPDATE sdj.commands SET status='completed',created_at=now()-interval '31 days'"
      );
      await client.query(
        "UPDATE sdj.onboarding_sessions SET created_at=now()-interval '31 days',expires_at=now()-interval '1 hour'"
      );
      await client.query("UPDATE sdj.write_groups SET created_at=now()-interval '31 days'");
      await client.query("UPDATE sdj.inbound_messages SET received_at=now()-interval '31 days'");
    });
    const retention = new Maintenance(maintenance);
    await retention.run([a.userId]);
    await retention.run([a.userId]);
    await db.tenant(a, async (client) => {
      for (const table of [
        'write_groups',
        'mutations',
        'command_items',
        'commands',
        'inbound_messages',
      ])
        expect((await client.query('SELECT id FROM sdj.' + table)).rowCount, table).toBe(0);
    });
  });
});
