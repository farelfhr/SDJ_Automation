import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';
import { DomainError, isISODate, type ActorContext } from '@sdj/domain';
import {
  PendingSchema,
  CellValueSchema,
  TargetSnapshotSchema,
  WriteGroupSchema,
  type ChannelEvent,
} from '@sdj/contracts';
import {
  presentNotice,
  type Store,
  type User,
  type Tracker,
  type StoredMessage,
  type CommandRecord,
  type Pending,
  type Mutation,
  type WriteGroup,
  type JobLease,
  type Delivery,
  type IngestResult,
  type SummaryContext,
} from '@sdj/application';
import { Database, type PoolClient } from './db.js';
import { CryptoBox, secureToken } from './crypto.js';
const UserRow = z.object({
  id: z.string(),
  timezone: z.string(),
  status: z.enum(['pending', 'active', 'suspended', 'deleting', 'deleted']),
  ai_processing_allowed: z.boolean(),
  reminders_enabled: z.boolean(),
  provider_policy_version: z.string().nullable(),
});
const TrackerRow = z.object({
  id: z.string(),
  user_id: z.string(),
  google_connection_id: z.string(),
  spreadsheet_id: z.string(),
  sheet_id: z.number(),
  sheet_title: z.string(),
  structure_fingerprint: z.string(),
  version: z.coerce.number(),
  status: z.enum([
    'pending',
    'active',
    'needs_validation',
    'reauth_required',
    'disabled',
    'archived',
  ]),
});
const MessageRow = z.object({
  id: z.string(),
  user_id: z.string(),
  identity_id: z.string(),
  received_at: z.date(),
  sent_at: z.date(),
  text_ciphertext: z.instanceof(Buffer).nullable(),
  conversation_ciphertext: z.instanceof(Buffer),
  channel_account_id: z.string(),
  status: z.string(),
});
export class PgStore implements Store {
  async saveSummaryContext(
    actor: ActorContext,
    commandId: string,
    summary: SummaryContext
  ): Promise<void> {
    await this.db.tenant(actor, async (client) => {
      await this.assertActor(client, actor);
      await this.assertLease(client);
      const result = await client.query(
        'UPDATE sdj.commands SET intent_ciphertext=$4 WHERE id=$1 AND identity_id=$2 AND origin_message_id=$3 RETURNING id',
        [
          commandId,
          actor.identityId,
          actor.sourceMessageId,
          this.crypto.seal(summary, `command:intent:${actor.userId}:${commandId}`),
        ]
      );
      if (!result.rowCount)
        throw new DomainError('IDENTITY_SCOPE_INVALID', 'Ringkasan tidak sesuai peserta.');
    });
  }
  async lastSummaryContext(actor: ActorContext): Promise<SummaryContext | null> {
    return this.db.tenant(actor, async (client) => {
      await this.assertActor(client, actor);
      const row = (
        await client.query<{ id: string; intent_ciphertext: Buffer }>(
          "SELECT id,intent_ciphertext FROM sdj.commands WHERE identity_id=$1 AND status='completed' AND intent_ciphertext IS NOT NULL AND created_at>now()-interval '30 minutes' ORDER BY created_at DESC,id DESC LIMIT 1",
          [actor.identityId]
        )
      ).rows[0];
      if (row)
        return this.crypto.open(
          row.intent_ciphertext,
          `command:intent:${actor.userId}:${row.id}`,
          z
            .object({
              action: z.enum(['daily_summary', 'monthly_summary']),
              date: z.string().refine(isISODate),
            })
            .strict()
        );
      // Compatibility with summaries produced before encrypted summary references were saved.
      const deliveries = await client.query<{ id: string; body_ciphertext: Buffer }>(
        "SELECT d.id,d.body_ciphertext FROM sdj.deliveries d JOIN sdj.commands c ON c.id=d.command_id AND c.user_id=d.user_id WHERE d.identity_id=$1 AND c.status='completed' AND c.created_at>now()-interval '30 minutes' AND d.kind='terminal' AND d.body_ciphertext IS NOT NULL ORDER BY d.created_at DESC,d.id DESC LIMIT 8",
        [actor.identityId]
      );
      for (const delivery of deliveries.rows) {
        const body = this.crypto.open(
          delivery.body_ciphertext,
          `delivery:body:${actor.userId}:${delivery.id}`,
          z.string()
        );
        const month = body.match(
          /(?:^|\n)Progres (\d{4}-\d{2}) \(\d{4}-\d{2}-\d{2} s\.d\. (\d{4}-\d{2}-\d{2})\):/
        );
        if (month?.[2] && isISODate(month[2]) && month[2].startsWith(month[1]!))
          return { action: 'monthly_summary', date: month[2] };
        const day = body.match(/(?:^|\n)Rekap (\d{4}-\d{2}-\d{2}):/);
        if (day?.[1] && isISODate(day[1])) return { action: 'daily_summary', date: day[1] };
      }
      return null;
    });
  }
  private readonly context = new AsyncLocalStorage<JobLease>();
  constructor(
    readonly db: Database,
    readonly crypto: CryptoBox,
    private readonly remindersEnabled = false
  ) {}
  async ingest(event: ChannelEvent, _now: Date): Promise<IngestResult> {
    const user = crypto.randomUUID(),
      identity = crypto.randomUUID();
    const lookup = this.crypto.digest(
      JSON.stringify([event.channel, event.channel_account_id, event.sender_id])
    );
    const identityResult = await this.db.ingress.query<{ user_id: string; identity_id: string }>(
      'SELECT * FROM sdj.resolve_identity($1,$2,$3,$4,$5)',
      [
        lookup,
        user,
        identity,
        this.crypto.seal(event.sender_id, `identity:sender:${user}:${identity}`),
        event.channel_account_id,
      ]
    );
    const resolved = identityResult.rows[0];
    if (!resolved) throw new Error('IDENTITY_UNAVAILABLE');
    const messageId = crypto.randomUUID();
    const result = await this.db.ingress.query<{
      id: string;
      duplicate: boolean;
      collision: boolean;
    }>('SELECT * FROM sdj.accept_event($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
      messageId,
      resolved.user_id,
      resolved.identity_id,
      event.channel_account_id,
      event.event_id,
      this.crypto.seal(
        event.conversation_id,
        `message:conversation:${resolved.user_id}:${messageId}`
      ),
      this.crypto.seal(event.text, `message:text:${resolved.user_id}:${messageId}`),
      this.crypto.digest(JSON.stringify(event)),
      event.sent_at,
    ]);
    const accepted = result.rows[0];
    if (!accepted) throw new Error('INGRESS_UNAVAILABLE');
    return {
      duplicate: accepted.duplicate,
      collision: accepted.collision,
      actor: {
        userId: resolved.user_id,
        identityId: resolved.identity_id,
        sourceMessageId: accepted.id,
      },
    };
  }
  private async assertActor(client: PoolClient, actor: ActorContext): Promise<void> {
    const r = await client.query(
      'SELECT id FROM sdj.inbound_messages WHERE id=$1 AND identity_id=$2',
      [actor.sourceMessageId, actor.identityId]
    );
    if (!r.rowCount)
      throw new DomainError('IDENTITY_SCOPE_INVALID', 'Identitas atau pesan tidak sesuai.');
  }
  private async assertLease(client: PoolClient): Promise<void> {
    const lease = this.context.getStore();
    if (!lease) return;
    const r = await client.query(
      "SELECT id FROM sdj.jobs WHERE id=$1 AND lease_token_hash=$2 AND status='leased' AND lease_expires_at>now() FOR UPDATE",
      [lease.id, this.crypto.digest(lease.token)]
    );
    if (!r.rowCount) throw new Error('STALE_LEASE');
  }
  private async finishJob(client: PoolClient): Promise<void> {
    const lease = this.context.getStore();
    if (lease)
      await client.query("UPDATE sdj.jobs SET status='done' WHERE id=$1 AND lease_token_hash=$2", [
        lease.id,
        this.crypto.digest(lease.token),
      ]);
  }
  async message(actor: ActorContext): Promise<StoredMessage> {
    return this.db.tenant(actor, async (client) => {
      await this.assertActor(client, actor);
      const row = MessageRow.parse(
        (
          await client.query('SELECT * FROM sdj.inbound_messages WHERE id=$1', [
            actor.sourceMessageId,
          ])
        ).rows[0]
      );
      if (row.status === 'collision')
        throw new DomainError('DUPLICATE_EVENT_COLLISION', 'Event bertabrakan dan dikarantina.');
      if (!row.text_ciphertext)
        throw new DomainError('MESSAGE_EXPIRED', 'Isi pesan sudah kedaluwarsa.');
      return {
        id: row.id,
        userId: row.user_id,
        identityId: row.identity_id,
        receivedAt: row.received_at.toISOString(),
        sentAt: row.sent_at.toISOString(),
        channelAccountId: row.channel_account_id,
        text: this.crypto.open(
          row.text_ciphertext,
          `message:text:${actor.userId}:${row.id}`,
          z.string()
        ),
        conversationId: this.crypto.open(
          row.conversation_ciphertext,
          `message:conversation:${actor.userId}:${row.id}`,
          z.string()
        ),
      };
    });
  }
  async user(actor: ActorContext): Promise<User> {
    return this.db.tenant(actor, async (client) => {
      await this.assertActor(client, actor);
      const row = UserRow.parse(
        (await client.query('SELECT * FROM sdj.users WHERE id=$1', [actor.userId])).rows[0]
      );
      return {
        id: row.id,
        timezone: row.timezone,
        status: row.status,
        aiAllowed: row.ai_processing_allowed,
        remindersEnabled: row.reminders_enabled,
        providerPolicyVersion: row.provider_policy_version,
      };
    });
  }
  async tracker(actor: ActorContext): Promise<Tracker | null> {
    return this.db.tenant(actor, async (client) => {
      await this.assertActor(client, actor);
      const raw = (
        await client.query(
          "SELECT * FROM sdj.tracker_connections WHERE status IN ('active','needs_validation','reauth_required') LIMIT 1"
        )
      ).rows[0];
      if (!raw) return null;
      const row = TrackerRow.parse(raw);
      if (row.status === 'archived') return null;
      return {
        id: row.id,
        userId: row.user_id,
        googleConnectionId: row.google_connection_id,
        spreadsheetId: row.spreadsheet_id,
        sheetId: row.sheet_id,
        sheetTitle: row.sheet_title,
        fingerprint: row.structure_fingerprint,
        version: row.version,
        status: row.status,
      };
    });
  }
  async recordRoute(
    actor: ActorContext,
    commandId: string,
    route: 'parser' | 'pending' | 'ai'
  ): Promise<void> {
    await this.db.tenant(actor, async (client) => {
      await this.assertActor(client, actor);
      await this.assertLease(client);
      await client.query(
        'UPDATE sdj.commands SET interpretation_route=$3 WHERE id=$1 AND origin_message_id=$2',
        [commandId, actor.sourceMessageId, route]
      );
    });
  }
  async setReminderEnabled(actor: ActorContext, enabled: boolean): Promise<void> {
    await this.db.tenant(actor, async (client) => {
      await this.assertActor(client, actor);
      await this.assertLease(client);
      const changed = await client.query(
        "UPDATE sdj.users SET reminders_enabled=$2,reminders_started_at=CASE WHEN $2 AND NOT reminders_enabled THEN now() ELSE reminders_started_at END WHERE id=$1 AND status='active' RETURNING id",
        [actor.userId, enabled]
      );
      if (!changed.rowCount)
        throw new DomainError(
          'USER_NOT_CONNECTED',
          'Hubungkan tracker terlebih dahulu dengan “daftar”.'
        );
      if (!enabled)
        await client.query(
          "UPDATE sdj.deliveries SET status='cancelled' WHERE kind='reminder' AND status='pending'"
        );
    });
  }
  async setAIConsent(actor: ActorContext, allowed: boolean): Promise<void> {
    await this.db.tenant(actor, async (client) => {
      await this.assertActor(client, actor);
      await this.assertLease(client);
      const result = await client.query(
        "UPDATE sdj.users SET ai_processing_allowed=$2,provider_policy_version='free-providers-v2',consented_at=now(),version=version+1 WHERE id=$1 AND status='active' RETURNING id",
        [actor.userId, allowed]
      );
      if (!result.rowCount)
        throw new DomainError(
          'USER_NOT_CONNECTED',
          'Hubungkan tracker terlebih dahulu untuk mengaktifkan AI.'
        );
    });
  }
  async command(actor: ActorContext): Promise<CommandRecord> {
    return this.db.tenant(actor, async (client) => {
      await this.assertActor(client, actor);
      await this.assertLease(client);
      await client.query(
        'INSERT INTO sdj.commands(id,user_id,identity_id,origin_message_id,timezone_snapshot,reference_received_at) SELECT $1,$2,$3,m.id,u.timezone,m.received_at FROM sdj.inbound_messages m JOIN sdj.users u ON u.id=m.user_id WHERE m.id=$4 ON CONFLICT(origin_message_id) DO NOTHING',
        [crypto.randomUUID(), actor.userId, actor.identityId, actor.sourceMessageId]
      );
      const row = z
        .object({ id: z.string(), status: z.string(), group_id: z.string().nullable() })
        .parse(
          (
            await client.query(
              'SELECT c.id,c.status,g.id AS group_id FROM sdj.commands c LEFT JOIN sdj.write_groups g ON g.command_id=c.id WHERE c.origin_message_id=$1',
              [actor.sourceMessageId]
            )
          ).rows[0]
        );
      return { id: row.id, status: row.status, groupId: row.group_id };
    });
  }
  async pending(actor: ActorContext): Promise<Pending | null> {
    return this.db.tenant(actor, async (client) => {
      await this.assertActor(client, actor);
      const raw = (
        await client.query(
          "SELECT id,pending_ciphertext FROM sdj.commands WHERE identity_id=$1 AND status='awaiting_input' AND expires_at>now() LIMIT 1",
          [actor.identityId]
        )
      ).rows[0];
      if (!raw) return null;
      const row = z.object({ id: z.string(), pending_ciphertext: z.instanceof(Buffer) }).parse(raw);
      return this.crypto.open(
        row.pending_ciphertext,
        `command:pending:${actor.userId}:${row.id}`,
        PendingSchema
      );
    });
  }
  private async finishTx(
    client: PoolClient,
    actor: ActorContext,
    commandId: string,
    status: string,
    body: string,
    kind: 'terminal' | 'status' | 'clarification' | 'pending',
    pending?: Pending
  ): Promise<void> {
    const source = z
      .object({
        identity_id: z.string(),
        origin_message_id: z.string(),
        channel_account_id: z.string(),
      })
      .parse(
        (
          await client.query(
            'SELECT c.identity_id,c.origin_message_id,m.channel_account_id FROM sdj.commands c JOIN sdj.inbound_messages m ON m.id=c.origin_message_id WHERE c.id=$1',
            [commandId]
          )
        ).rows[0]
      );
    if (source.identity_id !== actor.identityId)
      throw new DomainError('IDENTITY_SCOPE_INVALID', 'Tujuan balasan tidak sesuai.');
    const existing = (
      await client.query<{ id: string; pending_ciphertext: Buffer }>(
        "SELECT id,pending_ciphertext FROM sdj.commands WHERE identity_id=$1 AND status='awaiting_input' AND id<>$2 FOR UPDATE",
        [actor.identityId, commandId]
      )
    ).rows[0];
    const consented = (
      await client.query<{ allowed: boolean }>(
        "SELECT (ai_processing_allowed AND provider_policy_version='free-providers-v2') AS allowed FROM sdj.users WHERE id=$1",
        [actor.userId]
      )
    ).rows[0]?.allowed;
    const previous = existing
      ? this.crypto.open(
          existing.pending_ciphertext,
          `command:pending:${actor.userId}:${existing.id}`,
          PendingSchema
        )
      : null;
    const preserveConsent =
      !consented &&
      !pending &&
      status !== 'cancelled' &&
      previous &&
      Date.parse(previous.expiresAt) > Date.now() &&
      (previous.mode === 'ai_consent' || previous.deferred_request);
    if (
      preserveConsent &&
      previous.mode !== 'ai_consent' &&
      previous.deferred_request &&
      existing
    ) {
      const restored: Pending = {
        ...previous,
        mode: 'ai_consent',
        proposal: { schema_version: 2, action: 'unsupported' },
        referenceReceivedAt: previous.deferred_request.received_at,
      };
      await client.query('UPDATE sdj.commands SET pending_ciphertext=$2 WHERE id=$1', [
        existing.id,
        this.crypto.seal(restored, `command:pending:${actor.userId}:${existing.id}`),
      ]);
      body +=
        '\n\n> Untuk permintaan pertama, balas “setuju” atau “tidak” sebelum izin kedaluwarsa.';
    }
    if (!preserveConsent)
      await client.query(
        "UPDATE sdj.commands SET status='cancelled',pending_ciphertext=NULL,completed_at=now() WHERE identity_id=$1 AND status='awaiting_input' AND id<>$2",
        [source.identity_id, commandId]
      );
    await client.query(
      "UPDATE sdj.commands SET status=$2,pending_ciphertext=$3,expires_at=$4,completed_at=CASE WHEN $2 IN ('completed','applied','rejected','no_op','conflict','partially_applied') THEN now() ELSE NULL END,version=version+1 WHERE id=$1",
      [
        commandId,
        status,
        pending ? this.crypto.seal(pending, `command:pending:${actor.userId}:${commandId}`) : null,
        pending?.expiresAt ?? null,
      ]
    );
    const deliveryId = crypto.randomUUID();
    await client.query(
      'INSERT INTO sdj.deliveries(id,user_id,command_id,identity_id,source_message_id,channel_account_id,dedupe_key,body_ciphertext,kind) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(user_id,dedupe_key) DO NOTHING',
      [
        deliveryId,
        actor.userId,
        commandId,
        source.identity_id,
        source.origin_message_id,
        source.channel_account_id,
        `${commandId}:${kind}:${status}`,
        this.crypto.seal(presentNotice(body), `delivery:body:${actor.userId}:${deliveryId}`),
        kind,
      ]
    );
    await this.finishJob(client);
  }
  async finish(
    actor: ActorContext,
    commandId: string,
    status: string,
    body: string,
    kind: 'terminal' | 'status' | 'clarification' | 'pending' = 'terminal',
    pending?: Pending
  ): Promise<void> {
    await this.db.tenant(actor, async (client) => {
      await this.assertActor(client, actor);
      await this.assertLease(client);
      await this.finishTx(client, actor, commandId, status, body, kind, pending);
    });
  }
  async prepare(
    actor: ActorContext,
    commandId: string,
    tracker: Tracker,
    mutations: Mutation[],
    undoOfId: string | null
  ): Promise<WriteGroup> {
    return this.db.tenant(actor, async (client) => {
      await this.assertActor(client, actor);
      await this.assertLease(client);
      const check = await client.query(
        "SELECT id FROM sdj.tracker_connections WHERE id=$1 AND version=$2 AND status='active' FOR UPDATE",
        [tracker.id, tracker.version]
      );
      if (!check.rowCount)
        throw new DomainError('TRACKER_SCHEMA_CHANGED', 'Koneksi tracker berubah.');
      const id = crypto.randomUUID();
      await client.query(
        "INSERT INTO sdj.write_groups(id,user_id,command_id,tracker_id,status,undo_of_id) VALUES($1,$2,$3,$4,'prepared',$5)",
        [id, actor.userId, commandId, tracker.id, undoOfId]
      );
      for (const [ordinal, m] of mutations.entries()) {
        const binding = z
          .object({ id: z.string() })
          .parse(
            (
              await client.query(
                'SELECT id FROM sdj.activity_bindings WHERE tracker_id=$1 AND activity_id=$2',
                [tracker.id, m.target.activityId]
              )
            ).rows[0]
          );
        const itemId = crypto.randomUUID();
        await client.query(
          'INSERT INTO sdj.command_items(id,user_id,command_id,tracker_id,ordinal,activity_id,activity_date) VALUES($1,$2,$3,$4,$5,$6,$7)',
          [
            itemId,
            actor.userId,
            commandId,
            tracker.id,
            ordinal,
            m.target.activityId,
            m.target.localDate,
          ]
        );
        await client.query(
          "INSERT INTO sdj.mutations(id,user_id,group_id,tracker_id,item_id,binding_id,activity_id,snapshot_ciphertext,before_value_ciphertext,after_value_ciphertext,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'prepared')",
          [
            m.id,
            actor.userId,
            id,
            tracker.id,
            itemId,
            binding.id,
            m.target.activityId,
            this.crypto.seal(m.target, `mutation:target:${actor.userId}:${m.id}`),
            this.crypto.seal(m.before, `mutation:before:${actor.userId}:${m.id}`),
            this.crypto.seal(m.after, `mutation:after:${actor.userId}:${m.id}`),
          ]
        );
      }
      await client.query("UPDATE sdj.commands SET status='applying' WHERE id=$1", [commandId]);
      return this.loadGroup(client, actor, id);
    });
  }
  async sending(actor: ActorContext, group: WriteGroup): Promise<void> {
    await this.db.tenant(actor, async (client) => {
      await this.assertLease(client);
      const r = await client.query(
        "UPDATE sdj.write_groups SET status='sending',send_attempts=send_attempts+1,version=version+1 WHERE id=$1 AND status='prepared' AND send_attempts<3 RETURNING id",
        [group.id]
      );
      if (!r.rowCount) throw new Error('GROUP_NOT_PREPARED');
      await client.query("UPDATE sdj.mutations SET status='sending' WHERE group_id=$1", [group.id]);
    });
  }
  private async loadGroup(
    client: PoolClient,
    actor: ActorContext,
    id: string
  ): Promise<WriteGroup> {
    const row = z
      .object({
        id: z.string(),
        user_id: z.string(),
        command_id: z.string(),
        tracker_id: z.string(),
        status: z.string(),
        created_at: z.date(),
        verified_at: z.date().nullable(),
        undo_of_id: z.string().nullable(),
      })
      .parse((await client.query('SELECT * FROM sdj.write_groups WHERE id=$1', [id])).rows[0]);
    const raw = await client.query(
      'SELECT m.* FROM sdj.mutations m JOIN sdj.command_items i ON i.id=m.item_id WHERE m.group_id=$1 ORDER BY i.ordinal',
      [id]
    );
    const mutations = raw.rows.map((value) => {
      const r = z
        .object({
          id: z.string(),
          status: z.string(),
          snapshot_ciphertext: z.instanceof(Buffer),
          before_value_ciphertext: z.instanceof(Buffer),
          after_value_ciphertext: z.instanceof(Buffer),
        })
        .parse(value);
      return {
        id: r.id,
        status: r.status,
        target: this.crypto.open(
          r.snapshot_ciphertext,
          `mutation:target:${actor.userId}:${r.id}`,
          TargetSnapshotSchema
        ),
        before: this.crypto.open(
          r.before_value_ciphertext,
          `mutation:before:${actor.userId}:${r.id}`,
          CellValueSchema
        ),
        after: this.crypto.open(
          r.after_value_ciphertext,
          `mutation:after:${actor.userId}:${r.id}`,
          CellValueSchema
        ),
      };
    });
    return WriteGroupSchema.parse({
      id: row.id,
      userId: row.user_id,
      commandId: row.command_id,
      trackerId: row.tracker_id,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      verifiedAt: row.verified_at?.toISOString() ?? null,
      undoOfId: row.undo_of_id,
      mutations,
    });
  }
  async group(actor: ActorContext, id: string): Promise<WriteGroup | null> {
    return this.db.tenant(actor, async (client) => {
      await this.assertActor(client, actor);
      if (!(await client.query('SELECT id FROM sdj.write_groups WHERE id=$1', [id])).rowCount)
        return null;
      return this.loadGroup(client, actor, id);
    });
  }
  async activeGroup(actor: ActorContext, trackerId: string): Promise<WriteGroup | null> {
    return this.db.tenant(actor, async (client) => {
      const row = (
        await client.query<{ id: string }>(
          "SELECT id FROM sdj.write_groups WHERE tracker_id=$1 AND status IN ('prepared','sending','uncertain','needs_review') LIMIT 1",
          [trackerId]
        )
      ).rows[0];
      return row ? this.loadGroup(client, actor, row.id) : null;
    });
  }
  async lastGroup(actor: ActorContext, trackerId: string): Promise<WriteGroup | null> {
    return this.db.tenant(actor, async (client) => {
      const row = (
        await client.query<{ id: string }>(
          'SELECT id FROM sdj.write_groups WHERE tracker_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1',
          [trackerId]
        )
      ).rows[0];
      return row ? this.loadGroup(client, actor, row.id) : null;
    });
  }
  async finalize(
    actor: ActorContext,
    group: WriteGroup,
    status: WriteGroup['status'],
    mutations: Mutation[],
    body: string
  ): Promise<void> {
    await this.db.tenant(actor, async (client) => {
      await this.assertLease(client);
      const result = await client.query<{ version: string }>(
        "UPDATE sdj.write_groups SET status=$2,verified_at=CASE WHEN $2='verified' THEN now() ELSE verified_at END,version=version+1,reconcile_after=CASE WHEN $2='uncertain' THEN now()+interval '5 seconds' ELSE NULL END WHERE id=$1 AND status IN ('prepared','sending','uncertain','needs_review') RETURNING version",
        [group.id, status]
      );
      if (!result.rowCount) return;
      for (const m of mutations)
        await client.query(
          "UPDATE sdj.mutations SET status=$2,verified_at=CASE WHEN $2='verified' THEN now() ELSE verified_at END WHERE id=$1 AND group_id=$3",
          [m.id, m.status, group.id]
        );
      const commandStatus =
        status === 'verified' ? 'applied' : status === 'failed' ? 'rejected' : status;
      await this.finishTx(
        client,
        actor,
        group.commandId,
        commandStatus,
        body,
        ['uncertain', 'needs_review'].includes(status) ? 'pending' : 'terminal'
      );
      if (status === 'uncertain')
        await client.query(
          "INSERT INTO sdj.jobs(id,user_id,kind,group_id,dedupe_key,available_at) VALUES($1,$2,'reconcile_mutation',$3,$4,now()+interval '5 seconds') ON CONFLICT(user_id,dedupe_key) DO NOTHING",
          [
            crypto.randomUUID(),
            actor.userId,
            group.id,
            `reconcile:${group.id}:${result.rows[0]?.version}`,
          ]
        );
    });
  }
  async withTrackerLock<T>(trackerId: string, fn: () => Promise<T>): Promise<T | null> {
    return this.db.lock(trackerId, fn);
  }
  async disconnect(actor: ActorContext, deleting: boolean): Promise<boolean> {
    return this.db.tenant(actor, async (client) => {
      await this.assertActor(client, actor);
      await this.assertLease(client);
      if (
        (
          await client.query(
            "SELECT id FROM sdj.write_groups WHERE status IN ('prepared','sending','uncertain','needs_review')"
          )
        ).rowCount
      )
        return false;
      await client.query(
        "UPDATE sdj.tracker_connections SET status='disabled',version=version+1 WHERE status<>'archived'"
      );
      await client.query(
        "UPDATE sdj.google_connections SET status='revoked',refresh_token_ciphertext=NULL,version=version+1"
      );
      await client.query(
        "UPDATE sdj.onboarding_sessions SET status='cancelled',pkce_ciphertext=NULL WHERE status NOT IN ('completed','cancelled','expired')"
      );
      await client.query("UPDATE sdj.jobs SET status='cancelled' WHERE status='queued'");
      await client.query(
        "UPDATE sdj.deliveries SET status='cancelled' WHERE kind='reminder' AND status='pending'"
      );
      await client.query(
        "UPDATE sdj.users SET status=$2,ai_processing_allowed=false,deletion_requested_at=CASE WHEN $2='deleting' THEN now() ELSE NULL END WHERE id=$1",
        [actor.userId, deleting ? 'deleting' : 'pending']
      );
      return true;
    });
  }
  async claimJob(worker: string, userId?: string): Promise<JobLease | null> {
    const token = secureToken(),
      raw = (
        await this.db.scheduler.query('SELECT * FROM sdj.claim_job($1,$2,$3)', [
          worker,
          this.crypto.digest(token),
          userId ?? null,
        ])
      ).rows[0];
    if (!raw) return null;
    const row = z
      .object({
        id: z.string(),
        user_id: z.string(),
        message_id: z.string().nullable(),
        group_id: z.string().nullable(),
        kind: z.enum(['process_message', 'reconcile_mutation']),
        attempts: z.number(),
      })
      .parse(raw);
    return {
      id: row.id,
      userId: row.user_id,
      messageId: row.message_id,
      groupId: row.group_id,
      kind: row.kind,
      attempts: row.attempts,
      token,
    };
  }
  async actorForJob(job: JobLease): Promise<ActorContext> {
    return this.db.tenant({ userId: job.userId }, async (client) => {
      const raw = (
        await client.query(
          'SELECT m.id,m.identity_id FROM sdj.inbound_messages m WHERE m.id=$1 OR m.id=(SELECT c.origin_message_id FROM sdj.commands c JOIN sdj.write_groups g ON g.command_id=c.id WHERE g.id=$2)',
          [job.messageId, job.groupId]
        )
      ).rows[0];
      const row = z.object({ id: z.string(), identity_id: z.string() }).parse(raw);
      return { userId: job.userId, identityId: row.identity_id, sourceMessageId: row.id };
    });
  }
  async completeJob(job: JobLease): Promise<void> {
    await this.db.tenant({ userId: job.userId }, async (client) => {
      const r = await client.query(
        "UPDATE sdj.jobs SET status='done',lease_expires_at=NULL WHERE id=$1 AND lease_token_hash=$2 AND status IN ('leased','done') RETURNING id",
        [job.id, this.crypto.digest(job.token)]
      );
      if (!r.rowCount) throw new Error('STALE_LEASE');
    });
  }
  async retryJob(job: JobLease, code: string, delayMs: number): Promise<void> {
    await this.db.tenant({ userId: job.userId }, async (client) => {
      await client.query(
        "UPDATE sdj.jobs SET status=CASE WHEN attempts>=max_attempts THEN 'failed' ELSE 'queued' END,last_error_code=$3,available_at=now()+$4*interval '1 millisecond',lease_token_hash=NULL,lease_expires_at=NULL WHERE id=$1 AND lease_token_hash=$2 AND status='leased'",
        [job.id, this.crypto.digest(job.token), code, delayMs]
      );
    });
  }
  async withJob<T>(job: JobLease, fn: () => Promise<T>): Promise<T> {
    return this.context.run(job, fn);
  }
  async claimDelivery(account: string): Promise<Delivery | null> {
    const token = secureToken();
    const row = (
      await this.db.scheduler.query<{ id: string; user_id: string }>(
        'SELECT * FROM sdj.claim_delivery($1,$2,$3)',
        [account, this.crypto.digest(token), this.remindersEnabled]
      )
    ).rows[0];
    if (!row) return null;
    return this.db.tenant({ userId: row.user_id }, async (client) => {
      const raw = z
        .object({
          id: z.string(),
          body_ciphertext: z.instanceof(Buffer),
          source_message_id: z.string().nullable(),
          identity_id: z.string(),
          conversation_ciphertext: z.instanceof(Buffer).nullable(),
          sender_ciphertext: z.instanceof(Buffer),
        })
        .parse(
          (
            await client.query(
              'SELECT d.id,d.body_ciphertext,d.source_message_id,d.identity_id,m.conversation_ciphertext,i.sender_ciphertext FROM sdj.deliveries d LEFT JOIN sdj.inbound_messages m ON m.id=d.source_message_id AND m.user_id=d.user_id JOIN sdj.channel_identities i ON i.id=d.identity_id AND i.user_id=d.user_id WHERE d.id=$1',
              [row.id]
            )
          ).rows[0]
        );
      return {
        id: raw.id,
        userId: row.user_id,
        channelAccountId: account,
        conversationId:
          raw.source_message_id && raw.conversation_ciphertext
            ? this.crypto.open(
                raw.conversation_ciphertext,
                `message:conversation:${row.user_id}:${raw.source_message_id}`,
                z.string()
              )
            : this.crypto.open(
                raw.sender_ciphertext,
                `identity:sender:${row.user_id}:${raw.identity_id}`,
                z.string()
              ),
        body: this.crypto.open(
          raw.body_ciphertext,
          `delivery:body:${row.user_id}:${raw.id}`,
          z.string()
        ),
        token,
      };
    });
  }
  async ackDelivery(
    account: string,
    id: string,
    token: string,
    remoteId: string
  ): Promise<boolean> {
    return (
      (
        await this.db.scheduler.query<{ ok: boolean }>(
          'SELECT sdj.delivery_receipt($1,$2,$3,$4,$5) AS ok',
          [account, id, this.crypto.digest(token), remoteId, 'sent']
        )
      ).rows[0]?.ok ?? false
    );
  }
  async nackDelivery(
    account: string,
    id: string,
    token: string,
    unknown: boolean
  ): Promise<boolean> {
    return (
      (
        await this.db.scheduler.query<{ ok: boolean }>(
          'SELECT sdj.delivery_receipt($1,$2,$3,NULL,$4) AS ok',
          [account, id, this.crypto.digest(token), unknown ? 'delivery_unknown' : 'pending']
        )
      ).rows[0]?.ok ?? false
    );
  }
  async reserveNonce(keyId: string, nonce: string, _expiresAt: Date): Promise<boolean> {
    return (
      (
        await this.db.ingress.query<{ ok: boolean }>('SELECT sdj.reserve_nonce($1,$2) AS ok', [
          keyId,
          this.crypto.digest(nonce),
        ])
      ).rows[0]?.ok ?? false
    );
  }
  async health(): Promise<boolean> {
    try {
      const rows = await Promise.all([
        this.db.app.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
          'SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user'
        ),
        this.db.ingress.query('SELECT 1'),
        this.db.scheduler.query('SELECT 1'),
      ]);
      const role = rows[0].rows[0];
      return !!role && !role.rolsuper && !role.rolbypassrls;
    } catch {
      return false;
    }
  }
  async close(): Promise<void> {
    await this.db.close();
  }
}
