import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { loadConfig } from '@sdj/config';
import {
  Database,
  PgStore,
  PgReminderStore,
  CryptoBox,
  pg,
  databaseTLS,
} from '@sdj/infrastructure';
import { ReminderService, systemClock } from '@sdj/application';
import { syntheticEvent } from '@sdj/testing';
import type { ActorContext } from '@sdj/domain';

const run = 'synthetic-reminder-' + randomBytes(6).toString('hex');
let db: Database, box: CryptoBox, store: PgStore, reminders: PgReminderStore, maintenance: pg.Pool;
const actors: ActorContext[] = [];
async function admin<T>(userId: string, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await maintenance.connect();
  try {
    await c.query('BEGIN');
    await c.query("SELECT set_config('app.user_id',$1,true)", [userId]);
    const result = await fn(c);
    await c.query('COMMIT');
    return result;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
beforeAll(async () => {
  const config = loadConfig();
  db = new Database({
    app: config.appDatabaseUrl,
    ingress: config.ingressDatabaseUrl,
    scheduler: config.schedulerDatabaseUrl,
  });
  box = new CryptoBox(config.encryptionKey, config.lookupKey);
  store = new PgStore(db, box, true);
  reminders = new PgReminderStore(db, box, run);
  if (!process.env['DATABASE_URL_MAINTENANCE']) throw new Error('MAINTENANCE_REQUIRED');
  maintenance = new pg.Pool({
    connectionString: process.env['DATABASE_URL_MAINTENANCE'],
    ssl: databaseTLS(),
    max: 2,
  });
  for (const sender of ['a', 'b']) {
    const { actor } = await store.ingest(
      { ...syntheticEvent('bantuan', run + '-' + sender, systemClock), channel_account_id: run },
      new Date()
    );
    actors.push(actor);
    await db.tenant(actor, async (c) => {
      await c.query(
        "UPDATE sdj.users SET status='active',privacy_notice_version='synthetic',consented_at=now(),profile_name_ciphertext=$2 WHERE id=$1",
        [
          actor.userId,
          box.seal(sender === 'a' ? 'Ahmad' : 'Aisyah', `user:profile:${actor.userId}`),
        ]
      );
      const google = crypto.randomUUID();
      await c.query(
        "INSERT INTO sdj.google_connections(id,user_id,subject_lookup,subject_ciphertext,refresh_token_ciphertext,granted_scopes,status) VALUES($1,$2,$3,$4,$5,'{}','active')",
        [
          google,
          actor.userId,
          box.digest(run + sender),
          box.seal('synthetic', `google:subject:${actor.userId}:${google}`),
          box.seal('synthetic', `google:refresh:${actor.userId}:${google}`),
        ]
      );
      await c.query(
        "INSERT INTO sdj.tracker_connections(id,user_id,google_connection_id,spreadsheet_id,sheet_id,sheet_title,template_id,structure_fingerprint,status) VALUES($1,$2,$3,$4,0,'synthetic','sdj-v1.2-full-v1','synthetic','active')",
        [crypto.randomUUID(), actor.userId, google, run + sender]
      );
    });
  }
}, 30000);
beforeEach(async () => {
  for (const actor of actors)
    await admin(actor.userId, async (c) => {
      await c.query('DELETE FROM sdj.deliveries');
      await c.query('DELETE FROM sdj.reminder_occurrences');
      await c.query(
        "UPDATE sdj.users SET status='active',reminders_enabled=true,reminders_started_at=now()"
      );
      await c.query("UPDATE sdj.tracker_connections SET status='active'");
      await c.query("UPDATE sdj.google_connections SET status='active'");
      await c.query("UPDATE sdj.channel_identities SET status='active'");
    });
});
afterAll(async () => {
  if (maintenance) {
    for (const actor of actors)
      await admin(actor.userId, async (c) => {
        for (const table of [
          'deliveries',
          'reminder_occurrences',
          'jobs',
          'commands',
          'inbound_messages',
          'tracker_connections',
          'google_connections',
          'channel_identities',
          'users',
        ])
          await c.query('DELETE FROM sdj.' + table);
      });
    await maintenance.end();
  }
  await db?.close();
}, 30000);
async function seed(slots: readonly string[] = ['morning']) {
  for (const actor of actors)
    await db.tenant(actor, async (c) => {
      for (const slot of slots)
        await c.query(
          "INSERT INTO sdj.reminder_occurrences(id,user_id,identity_id,local_date,slot,scheduled_at,expires_at) VALUES($1,$2,$3,(now() AT TIME ZONE 'Asia/Jakarta')::date,$4,now()-interval '1 minute',now()+interval '29 minutes')",
          [crypto.randomUUID(), actor.userId, actor.identityId, slot]
        );
    });
}
async function count(userId: string, table: string) {
  return db.tenant(
    { userId },
    async (c) =>
      (await c.query('SELECT count(*)::integer AS n FROM sdj.' + table)).rows[0].n as number
  );
}
describe('Reminder PostgreSQL dengan penerima sintetis', () => {
  it('dua scheduler, tiga slot, restart dan render ulang hanya menghasilkan satu kiriman per kejadian', async () => {
    await seed(['morning', 'afternoon', 'evening']);
    const batches = await Promise.all([
      reminders.claimDue(new Date(), 20),
      reminders.claimDue(new Date(), 20),
    ]);
    const claimed = batches.flat();
    expect(claimed).toHaveLength(6);
    expect(new Set(claimed.map((r) => r.id)).size).toBe(6);
    for (const r of claimed) await reminders.enqueue(r, (name) => `*Pengingat*\nHai ${name}`);
    for (const r of claimed) await reminders.enqueue(r, () => '*Duplikat*');
    expect(await new ReminderService(new PgReminderStore(db, box, run)).tick(new Date())).toBe(0);
    for (const actor of actors) expect(await count(actor.userId, 'deliveries')).toBe(3);
    const delivery = await store.claimDelivery(run);
    expect(delivery?.conversationId).toMatch(new RegExp('^' + run + '-[ab]$'));
    expect(delivery?.body).toMatch(/Ahmad|Aisyah/);
  });
  it('opt-out, tracker nonaktif dan Google perlu login tidak menerima reminder', async () => {
    await seed();
    await store.setReminderEnabled(actors[0]!, false);
    await db.tenant(actors[1]!, (c) =>
      c.query("UPDATE sdj.google_connections SET status='reauth_required'")
    );
    expect(await new ReminderService(reminders).tick(new Date())).toBe(0);
    for (const actor of actors) expect(await count(actor.userId, 'deliveries')).toBe(0);
  });
  it('status dicek lagi saat claim; flag global mati membatalkan antrean reminder', async () => {
    await seed();
    await new ReminderService(reminders).tick(new Date());
    await store.setReminderEnabled(actors[0]!, false);
    await db.tenant(actors[1]!, (c) =>
      c.query("UPDATE sdj.tracker_connections SET status='disabled'")
    );
    expect(await store.claimDelivery(run)).toBeNull();
    for (const actor of actors)
      expect(
        await db.tenant(actor, async (c) =>
          (await c.query('SELECT status FROM sdj.deliveries')).rows.every(
            (r) => r.status === 'cancelled'
          )
        )
      ).toBe(true);
    await seed(['afternoon']);
    await db.tenant(actors[0]!, (c) => c.query('UPDATE sdj.users SET reminders_enabled=true'));
    await new ReminderService(reminders).tick(new Date());
    expect(await new PgStore(db, box, false).claimDelivery(run)).toBeNull();
  });
  it('kedaluwarsa tidak dikirim dan hasil kirim tidak pasti tidak dicoba ulang', async () => {
    await seed();
    await new ReminderService(reminders).tick(new Date());
    await db.tenant(actors[0]!, (c) =>
      c.query(
        "UPDATE sdj.reminder_occurrences SET scheduled_at=now()-interval '31 minutes',expires_at=now()-interval '1 minute'"
      )
    );
    const d = await store.claimDelivery(run);
    expect(d?.userId).toBe(actors[1]!.userId);
    expect(await store.nackDelivery(run, d!.id, d!.token, true)).toBe(true);
    expect(await store.claimDelivery(run)).toBeNull();
  });
  it('kegagalan pasti dibatasi tiga kali, lease dapat dipulihkan, dan balasan chat didahulukan', async () => {
    await seed();
    const claimed = await reminders.claimDue(new Date(), 20);
    await db.tenant(actors[0]!, (c) =>
      c.query("UPDATE sdj.reminder_occurrences SET lease_expires_at=now()-interval '1 second'")
    );
    const reclaimed = await reminders.claimDue(new Date(), 20);
    expect(reclaimed).toHaveLength(1);
    for (const r of [...claimed, ...reclaimed]) await reminders.enqueue(r, () => '*Pengingat*');
    const command = await store.command(actors[0]!);
    await store.finish(actors[0]!, command.id, 'completed', '*Balasan chat*');
    const reply = await store.claimDelivery(run);
    expect(reply?.body).toBe('*Balasan chat*');
    await store.ackDelivery(run, reply!.id, reply!.token, 'synthetic-reply');
    for (let i = 0; i < 3; i++) {
      const d = await store.claimDelivery(run);
      expect(d).not.toBeNull();
      await store.nackDelivery(run, d!.id, d!.token, false);
      await db.tenant({ userId: d!.userId }, (c) =>
        c.query("UPDATE sdj.deliveries SET available_at=now()-interval '1 second' WHERE id=$1", [
          d!.id,
        ])
      );
      if (i === 0)
        await db.tenant({ userId: actors.find((a) => a.userId !== d!.userId)!.userId }, (c) =>
          c.query("UPDATE sdj.deliveries SET status='cancelled' WHERE kind='reminder'")
        );
    }
    expect(await store.claimDelivery(run)).toBeNull();
  });
  it('RLS dan FK menolak akses atau routing peserta lain', async () => {
    await seed();
    expect(await count(actors[0]!.userId, 'reminder_occurrences')).toBe(1);
    expect((await db.app.query('SELECT id FROM sdj.reminder_occurrences')).rows).toHaveLength(0);
    await expect(
      db.tenant(actors[0]!, (c) =>
        c.query(
          "INSERT INTO sdj.reminder_occurrences(id,user_id,identity_id,local_date,slot,scheduled_at,expires_at) VALUES($1,$2,$3,current_date,'evening',now(),now()+interval '30 minutes')",
          [crypto.randomUUID(), actors[0]!.userId, actors[1]!.identityId]
        )
      )
    ).rejects.toThrow();
    await expect(
      db.scheduler.query('SELECT profile_name_ciphertext FROM sdj.users')
    ).rejects.toThrow();
    const own = await db.tenant(
      actors[0]!,
      async (c) => (await c.query('SELECT id FROM sdj.reminder_occurrences')).rows[0].id as string
    );
    expect(
      (
        await db.tenant(actors[1]!, (c) =>
          c.query(
            "UPDATE sdj.reminder_occurrences SET status='cancelled' WHERE id=$1 RETURNING id",
            [own]
          )
        )
      ).rowCount
    ).toBe(0);
  });
});

it('pending consent terenkripsi pulih setelah klarifikasi langsung selesai', async () => {
  const actor = actors[0]!;
  const initialCommand = await store.command(actor);
  const received = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 600000).toISOString();
  const deferred = { text: 'subuhku tadi dua ya', received_at: received, sent_at: received };
  await db.tenant(actor, (c) => c.query('UPDATE sdj.users SET ai_processing_allowed=false'));
  await store.finish(actor, initialCommand.id, 'awaiting_input', '*Izin*', 'clarification', {
    mode: 'ai_consent',
    proposal: { schema_version: 2, action: 'unsupported' },
    referenceReceivedAt: received,
    timezone: 'Asia/Jakarta',
    expiresAt,
    deferred_request: deferred,
  });
  const next = (
    await store.ingest(
      { ...syntheticEvent('zuhur', run + '-a', systemClock), channel_account_id: run },
      new Date()
    )
  ).actor;
  const slot = await store.command(next);
  await store.finish(next, slot.id, 'awaiting_input', '*Skor?*', 'clarification', {
    mode: 'slots',
    proposal: {
      schema_version: 2,
      action: 'clarify',
      items: [{ activity_id: 'dzuhur', date_reference: { kind: 'today' }, value: null }],
      missing: ['value'],
    },
    referenceReceivedAt: received,
    timezone: 'Asia/Jakarta',
    expiresAt,
    deferred_request: deferred,
  });
  const answer = (
    await store.ingest(
      { ...syntheticEvent('3', run + '-a', systemClock), channel_account_id: run },
      new Date()
    )
  ).actor;
  await store.finish(answer, (await store.command(answer)).id, 'completed', '*Selesai*');
  expect(await store.pending(answer)).toMatchObject({
    mode: 'ai_consent',
    expiresAt,
    deferred_request: deferred,
  });
});
