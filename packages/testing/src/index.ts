import { AsyncLocalStorage } from 'node:async_hooks';
export * from './evaluation.js';
import {
  DomainError,
  ACTIVITIES,
  normalizeLabel,
  type ActorContext,
  type ActivityId,
  type ResolvedItem,
  type TypedCellValue,
  type CommandProposal,
  type InterpretationContext,
} from '@sdj/domain';
import {
  WriteFailure,
  presentNotice,
  type Store,
  type Clock,
  type StoredMessage,
  type User,
  type Tracker,
  type CommandRecord,
  type Pending,
  type Mutation,
  type WriteGroup,
  type JobLease,
  type Delivery,
  type IngestResult,
  type TrackerGateway,
  type TargetSnapshot,
  type IntentInterpreter,
  type OnboardingGateway,
  type SummaryContext,
} from '@sdj/application';
import type { ChannelEvent } from '@sdj/contracts';
export class FakeClock implements Clock {
  constructor(private instant = new Date('2026-10-15T09:00:00Z')) {}
  now(): Date {
    return new Date(this.instant);
  }
  advance(ms: number): void {
    this.instant = new Date(this.instant.getTime() + ms);
  }
}
interface MemoryJob {
  lease: JobLease;
  status: string;
  availableAt: number;
  expiresAt: number;
  createdAt: number;
}
export class MemoryStore implements Store {
  private readonly summaryContexts = new Map<
    string,
    { userId: string; identityId: string; at: number; value: SummaryContext }
  >();
  async saveSummaryContext(
    actor: ActorContext,
    commandId: string,
    summary: SummaryContext
  ): Promise<void> {
    this.assertActor(actor);
    this.assertLease();
    if (this.commands.get(actor.sourceMessageId)?.id !== commandId)
      throw new Error('COMMAND_MISSING');
    this.summaryContexts.set(commandId, {
      userId: actor.userId,
      identityId: actor.identityId,
      at: this.clock.now().getTime(),
      value: structuredClone(summary),
    });
  }
  async lastSummaryContext(actor: ActorContext): Promise<SummaryContext | null> {
    this.assertActor(actor);
    const found = [...this.summaryContexts.entries()]
      .filter(
        ([id, value]) =>
          value.userId === actor.userId &&
          value.identityId === actor.identityId &&
          value.at > this.clock.now().getTime() - 1800000 &&
          [...this.commands.values()].some((c) => c.id === id && c.status === 'completed')
      )
      .at(-1);
    return found ? structuredClone(found[1].value) : null;
  }
  readonly users = new Map<string, User>();
  readonly trackers = new Map<string, Tracker>();
  readonly messages = new Map<string, StoredMessage>();
  readonly commands = new Map<string, CommandRecord>();
  readonly groups = new Map<string, WriteGroup>();
  readonly deliveries = new Map<
    string,
    Delivery & { status: string; key: string; expiresAt: number }
  >();
  readonly jobs = new Map<string, MemoryJob>();
  private readonly identities = new Map<string, { userId: string; id: string }>();
  private readonly seen = new Map<string, { digest: string; actor: ActorContext }>();
  private readonly pendingByIdentity = new Map<string, { commandId: string; value: Pending }>();
  private readonly locks = new Set<string>();
  private readonly nonces = new Map<string, number>();
  private readonly jobContext = new AsyncLocalStorage<JobLease>();
  constructor(readonly clock: Clock) {}
  async ingest(event: ChannelEvent, now: Date): Promise<IngestResult> {
    const identityKey = JSON.stringify([event.channel, event.channel_account_id, event.sender_id]);
    let identity = this.identities.get(identityKey);
    if (!identity) {
      identity = { userId: crypto.randomUUID(), id: crypto.randomUUID() };
      this.identities.set(identityKey, identity);
      this.users.set(identity.userId, {
        id: identity.userId,
        timezone: 'Asia/Jakarta',
        status: 'pending',
        aiAllowed: false,
      });
    }
    const key = JSON.stringify([event.channel, event.channel_account_id, event.event_id]);
    const old = this.seen.get(key);
    const digest = JSON.stringify(event);
    if (old) return { duplicate: true, collision: old.digest !== digest, actor: old.actor };
    const id = crypto.randomUUID();
    const actor = { userId: identity.userId, identityId: identity.id, sourceMessageId: id };
    this.seen.set(key, { digest, actor });
    this.messages.set(id, {
      id,
      userId: actor.userId,
      identityId: actor.identityId,
      receivedAt: now.toISOString(),
      sentAt: event.sent_at,
      text: event.text,
      channelAccountId: event.channel_account_id,
      conversationId: event.conversation_id,
    });
    this.enqueue(actor.userId, id, null, 'process_message');
    return { duplicate: false, collision: false, actor };
  }
  private enqueue(
    userId: string,
    messageId: string | null,
    groupId: string | null,
    kind: JobLease['kind'],
    delay = 0
  ): void {
    if (
      [...this.jobs.values()].some(
        (j) =>
          j.lease.messageId === messageId &&
          j.lease.groupId === groupId &&
          j.lease.kind === kind &&
          ['queued', 'leased'].includes(j.status)
      )
    )
      return;
    const id = crypto.randomUUID();
    this.jobs.set(id, {
      lease: { id, userId, messageId, groupId, kind, token: '', attempts: 0 },
      status: 'queued',
      availableAt: this.clock.now().getTime() + delay,
      expiresAt: 0,
      createdAt: this.clock.now().getTime(),
    });
  }
  private assertActor(actor: ActorContext): StoredMessage {
    const m = this.messages.get(actor.sourceMessageId);
    if (!m || m.userId !== actor.userId || m.identityId !== actor.identityId)
      throw new DomainError('IDENTITY_SCOPE_INVALID', 'Actor tidak sesuai.');
    return m;
  }
  async message(actor: ActorContext): Promise<StoredMessage> {
    return structuredClone(this.assertActor(actor));
  }
  async user(actor: ActorContext): Promise<User> {
    this.assertActor(actor);
    const user = this.users.get(actor.userId);
    if (!user) throw new Error('USER_MISSING');
    return structuredClone(user);
  }
  async tracker(actor: ActorContext): Promise<Tracker | null> {
    this.assertActor(actor);
    return structuredClone(
      [...this.trackers.values()].find(
        (t) => t.userId === actor.userId && t.status !== 'disabled'
      ) ?? null
    );
  }
  async setAIConsent(actor: ActorContext, allowed: boolean): Promise<void> {
    this.assertActor(actor);
    this.assertLease();
    const user = this.users.get(actor.userId);
    if (!user || user.status !== 'active')
      throw new DomainError(
        'USER_NOT_CONNECTED',
        'Hubungkan tracker terlebih dahulu untuk mengaktifkan AI.'
      );
    user.aiAllowed = allowed;
    user.providerPolicyVersion = 'free-providers-v2';
  }
  readonly routes = new Map<string, string>();
  async recordRoute(
    actor: ActorContext,
    commandId: string,
    route: 'parser' | 'pending' | 'ai'
  ): Promise<void> {
    this.assertActor(actor);
    this.routes.set(commandId, route);
  }
  async setReminderEnabled(actor: ActorContext, enabled: boolean): Promise<void> {
    this.assertActor(actor);
    const user = this.users.get(actor.userId);
    if (!user || user.status !== 'active')
      throw new DomainError('USER_NOT_CONNECTED', 'Hubungkan tracker terlebih dahulu.');
    user.remindersEnabled = enabled;
  }
  async command(actor: ActorContext): Promise<CommandRecord> {
    this.assertActor(actor);
    let c = this.commands.get(actor.sourceMessageId);
    if (!c) {
      c = { id: crypto.randomUUID(), status: 'received', groupId: null };
      this.commands.set(actor.sourceMessageId, c);
    }
    return structuredClone(c);
  }
  async pending(actor: ActorContext): Promise<Pending | null> {
    this.assertActor(actor);
    return structuredClone(this.pendingByIdentity.get(actor.identityId)?.value ?? null);
  }
  async finish(
    actor: ActorContext,
    commandId: string,
    status: string,
    body: string,
    kind: 'terminal' | 'status' | 'clarification' | 'pending' = 'terminal',
    pending?: Pending
  ): Promise<void> {
    this.assertActor(actor);
    this.assertLease();
    const entry = [...this.commands.entries()].find(([, c]) => c.id === commandId);
    const m = entry ? this.messages.get(entry[0]) : undefined;
    const command = entry?.[1];
    if (!m || m.userId !== actor.userId || m.identityId !== actor.identityId || !command)
      throw new Error('COMMAND_MISSING');
    const previous = this.pendingByIdentity.get(actor.identityId);
    const user = this.users.get(actor.userId);
    const consented = user?.aiAllowed && user.providerPolicyVersion === 'free-providers-v2';
    const preserveConsent =
      !consented &&
      previous &&
      !pending &&
      status !== 'cancelled' &&
      Date.parse(previous.value.expiresAt) > this.clock.now().getTime() &&
      (previous.value.mode === 'ai_consent' || previous.value.deferred_request);
    if (
      preserveConsent &&
      previous.value.mode !== 'ai_consent' &&
      previous.value.deferred_request
    ) {
      previous.value = {
        ...previous.value,
        mode: 'ai_consent',
        proposal: { schema_version: 2, action: 'unsupported' },
        referenceReceivedAt: previous.value.deferred_request.received_at,
      };
      body +=
        '\n\n> Untuk permintaan pertama, balas “setuju” atau “tidak” sebelum izin kedaluwarsa.';
    }
    if (!preserveConsent && previous && previous.commandId !== commandId)
      for (const c of this.commands.values())
        if (c.id === previous.commandId) c.status = 'cancelled';
    if (!preserveConsent) this.pendingByIdentity.delete(actor.identityId);
    if (pending)
      this.pendingByIdentity.set(actor.identityId, { commandId, value: structuredClone(pending) });
    command.status = status;
    const key = `${commandId}:${kind}:${status}`;
    if (![...this.deliveries.values()].some((d) => d.key === key)) {
      const id = crypto.randomUUID();
      this.deliveries.set(id, {
        id,
        userId: actor.userId,
        channelAccountId: m.channelAccountId,
        conversationId: m.conversationId,
        body: presentNotice(body),
        token: '',
        status: 'pending',
        key,
        expiresAt: 0,
      });
    }
    this.finishCurrentJob();
  }
  async prepare(
    actor: ActorContext,
    commandId: string,
    tracker: Tracker,
    mutations: Mutation[],
    undoOfId: string | null
  ): Promise<WriteGroup> {
    this.assertActor(actor);
    this.assertLease();
    if (tracker.userId !== actor.userId || (await this.activeGroup(actor, tracker.id)))
      throw new DomainError('WRITE_OUTCOME_UNKNOWN', 'Tracker tertahan.');
    if (
      undoOfId &&
      [...this.groups.values()].some(
        (g) => g.undoOfId === undoOfId && !['failed', 'conflict'].includes(g.status)
      )
    )
      throw new DomainError('UNDO_NOT_ELIGIBLE', 'Sudah dibatalkan.');
    const group: WriteGroup = {
      id: crypto.randomUUID(),
      commandId,
      trackerId: tracker.id,
      userId: actor.userId,
      status: 'prepared',
      createdAt: this.clock.now().toISOString(),
      verifiedAt: null,
      undoOfId,
      mutations: structuredClone(mutations),
    };
    this.groups.set(group.id, group);
    const c = this.commands.get(actor.sourceMessageId);
    if (c) {
      c.groupId = group.id;
      c.status = 'applying';
    }
    return structuredClone(group);
  }
  async sending(actor: ActorContext, group: WriteGroup): Promise<void> {
    this.assertActor(actor);
    this.assertLease();
    const g = this.groups.get(group.id);
    if (g?.userId === actor.userId) {
      g.status = 'sending';
      g.mutations.forEach((m) => {
        m.status = 'sending';
      });
    }
  }
  async group(actor: ActorContext, id: string): Promise<WriteGroup | null> {
    this.assertActor(actor);
    const group = this.groups.get(id);
    return group?.userId === actor.userId ? structuredClone(group) : null;
  }
  async activeGroup(actor: ActorContext, trackerId: string): Promise<WriteGroup | null> {
    this.assertActor(actor);
    return structuredClone(
      [...this.groups.values()].find(
        (g) =>
          g.userId === actor.userId &&
          g.trackerId === trackerId &&
          ['prepared', 'sending', 'uncertain', 'needs_review'].includes(g.status)
      ) ?? null
    );
  }
  async lastGroup(actor: ActorContext, trackerId: string): Promise<WriteGroup | null> {
    this.assertActor(actor);
    return structuredClone(
      [...this.groups.values()]
        .filter((g) => g.userId === actor.userId && g.trackerId === trackerId)
        .at(-1) ?? null
    );
  }
  async finalize(
    actor: ActorContext,
    group: WriteGroup,
    status: WriteGroup['status'],
    mutations: Mutation[],
    body: string
  ): Promise<void> {
    const current = this.groups.get(group.id);
    this.assertActor(actor);
    this.assertLease();
    if (!current || current.userId !== actor.userId) throw new Error('GROUP_MISSING');
    current.status = status;
    current.mutations = structuredClone(mutations);
    if (status === 'verified') current.verifiedAt = this.clock.now().toISOString();
    await this.finish(
      actor,
      group.commandId,
      status === 'verified' ? 'applied' : status === 'failed' ? 'rejected' : status,
      body,
      ['uncertain', 'needs_review'].includes(status) ? 'pending' : 'terminal'
    );
    if (status === 'uncertain')
      this.enqueue(actor.userId, null, group.id, 'reconcile_mutation', 2000);
  }
  async withTrackerLock<T>(trackerId: string, fn: () => Promise<T>): Promise<T | null> {
    if (this.locks.has(trackerId)) return null;
    this.locks.add(trackerId);
    try {
      return await fn();
    } finally {
      this.locks.delete(trackerId);
    }
  }
  async disconnect(actor: ActorContext, deleting: boolean): Promise<boolean> {
    this.assertActor(actor);
    if (
      [...this.groups.values()].some(
        (g) =>
          g.userId === actor.userId &&
          ['prepared', 'sending', 'uncertain', 'needs_review'].includes(g.status)
      )
    )
      return false;
    for (const t of this.trackers.values()) if (t.userId === actor.userId) t.status = 'disabled';
    const user = this.users.get(actor.userId);
    if (user) user.status = deleting ? 'deleting' : 'pending';
    return true;
  }
  async claimJob(_worker: string, userId?: string): Promise<JobLease | null> {
    const now = this.clock.now().getTime();
    const jobs = [...this.jobs.values()]
      .filter(
        (j) =>
          (!userId || j.lease.userId === userId) &&
          (j.status === 'queued' || (j.status === 'leased' && j.expiresAt <= now)) &&
          j.availableAt <= now
      )
      .sort((a, b) => a.createdAt - b.createdAt);
    const job = jobs[0];
    if (!job) return null;
    job.status = 'leased';
    job.expiresAt = now + 60000;
    job.lease = { ...job.lease, token: crypto.randomUUID(), attempts: job.lease.attempts + 1 };
    return structuredClone(job.lease);
  }
  private assertLease(): void {
    const lease = this.jobContext.getStore();
    if (lease && this.jobs.get(lease.id)?.lease.token !== lease.token)
      throw new Error('STALE_LEASE');
  }
  private finishCurrentJob(): void {
    const lease = this.jobContext.getStore();
    if (lease) {
      const job = this.jobs.get(lease.id);
      if (job) job.status = 'done';
    }
  }
  async completeJob(lease: JobLease): Promise<void> {
    if (this.jobs.get(lease.id)?.lease.token !== lease.token) throw new Error('STALE_LEASE');
    const job = this.jobs.get(lease.id);
    if (job) job.status = 'done';
  }
  async retryJob(lease: JobLease, _code: string, delayMs: number): Promise<void> {
    const job = this.jobs.get(lease.id);
    if (job?.lease.token === lease.token) {
      job.status = lease.attempts >= 5 ? 'failed' : 'queued';
      job.availableAt = this.clock.now().getTime() + delayMs;
    }
  }
  async withJob<T>(job: JobLease, fn: () => Promise<T>): Promise<T> {
    return this.jobContext.run(job, fn);
  }
  async claimDelivery(account: string): Promise<Delivery | null> {
    const d = [...this.deliveries.values()].find(
      (d) => d.channelAccountId === account && d.status === 'pending'
    );
    if (!d) return null;
    d.status = 'leased';
    d.token = crypto.randomUUID();
    d.expiresAt = this.clock.now().getTime() + 60000;
    return structuredClone(d);
  }
  async ackDelivery(
    account: string,
    id: string,
    token: string,
    _remoteId: string
  ): Promise<boolean> {
    const d = this.deliveries.get(id);
    if (
      !d ||
      d.channelAccountId !== account ||
      d.status !== 'leased' ||
      d.token !== token ||
      d.expiresAt < this.clock.now().getTime()
    )
      return false;
    d.status = 'sent';
    return true;
  }
  async nackDelivery(
    account: string,
    id: string,
    token: string,
    unknown: boolean
  ): Promise<boolean> {
    const d = this.deliveries.get(id);
    if (!d || d.channelAccountId !== account || d.status !== 'leased' || d.token !== token)
      return false;
    d.status = unknown ? 'delivery_unknown' : 'pending';
    return true;
  }
  async reserveNonce(keyId: string, nonce: string, expiresAt: Date): Promise<boolean> {
    const key = keyId + ':' + nonce;
    if ((this.nonces.get(key) ?? 0) > this.clock.now().getTime()) return false;
    this.nonces.set(key, expiresAt.getTime());
    return true;
  }
  async health(): Promise<boolean> {
    return true;
  }
  async close(): Promise<void> {}
  activate(actor: ActorContext): Tracker {
    const user = this.users.get(actor.userId);
    if (!user) throw new Error('USER_MISSING');
    user.status = 'active';
    user.aiAllowed = true;
    user.providerPolicyVersion = 'free-providers-v2';
    const previous = this.pendingByIdentity.get(actor.identityId);
    if (previous?.value.mode === 'ai_consent') {
      for (const command of this.commands.values())
        if (command.id === previous.commandId) command.status = 'cancelled';
      this.pendingByIdentity.delete(actor.identityId);
    }
    const tracker: Tracker = {
      id: crypto.randomUUID(),
      userId: actor.userId,
      googleConnectionId: crypto.randomUUID(),
      spreadsheetId: 'synthetic-' + actor.userId,
      sheetId: 0,
      sheetTitle: '[NEW] SDJ v1.2',
      fingerprint: 'synthetic-full-v1',
      version: 1,
      status: 'active',
    };
    this.trackers.set(tracker.id, tracker);
    return structuredClone(tracker);
  }
  responses(actor: ActorContext): string[] {
    return [...this.deliveries.values()]
      .filter((d) => d.userId === actor.userId)
      .map((d) => d.body);
  }
}
export class FakeTrackerGateway implements TrackerGateway {
  readonly cells = new Map<string, TypedCellValue>();
  readonly formulas = new Set<string>();
  readonly protectedCells = new Set<string>();
  writeCalls = 0;
  mode: 'normal' | 'timeout_after_write' | 'reject' | 'read_error' | 'partial' = 'normal';
  key(tracker: Tracker, id: ActivityId, date: string): string {
    return `${tracker.spreadsheetId}:${id}:${date}`;
  }
  async inspect(
    _actor: ActorContext,
    tracker: Tracker,
    items: readonly Pick<ResolvedItem, 'activityId' | 'localDate'>[]
  ): Promise<TargetSnapshot[]> {
    if (this.mode === 'read_error') throw new Error('NETWORK');
    return items.map((i) => ({
      spreadsheetId: tracker.spreadsheetId,
      sheetId: tracker.sheetId,
      row: ACTIVITIES.findIndex((a) => a.id === i.activityId) + 8,
      column: 9 + Number(i.localDate.slice(8)),
      activityId: i.activityId,
      localDate: i.localDate,
      fingerprint: tracker.fingerprint,
      value: structuredClone(
        this.cells.get(this.key(tracker, i.activityId, i.localDate)) ?? { kind: 'blank' }
      ),
      formula: this.formulas.has(this.key(tracker, i.activityId, i.localDate)),
      writable: !this.protectedCells.has(this.key(tracker, i.activityId, i.localDate)),
    }));
  }
  async write(
    _actor: ActorContext,
    tracker: Tracker,
    mutations: readonly Mutation[]
  ): Promise<void> {
    this.writeCalls++;
    if (this.mode === 'reject') throw new WriteFailure(true, 'PERMISSION');
    for (const [index, m] of mutations.entries())
      if (this.mode !== 'partial' || index === 0)
        this.cells.set(
          this.key(tracker, m.target.activityId, m.target.localDate),
          structuredClone(m.after)
        );
    if (this.mode === 'timeout_after_write') throw new WriteFailure(false, 'TIMEOUT');
  }
  async validate(
    _actor: ActorContext,
    _google: string,
    _spreadsheet: string,
    _sheet: number
  ): Promise<{ sheetTitle: string; fingerprint: string; bindings: Record<ActivityId, number> }> {
    return {
      sheetTitle: '[NEW] SDJ v1.2',
      fingerprint: 'synthetic-full-v1',
      bindings: Object.fromEntries(ACTIVITIES.map((a, i) => [a.id, i + 8])) as Record<
        ActivityId,
        number
      >,
    };
  }
}
export class FakeInterpreter implements IntentInterpreter {
  calls = 0;
  constructor(readonly response: CommandProposal = { schema_version: 2, action: 'unsupported' }) {}
  async interpret(
    _text: string,
    _actor: ActorContext,
    _commandId: string,
    _context?: InterpretationContext
  ): Promise<CommandProposal> {
    this.calls++;
    return structuredClone(this.response);
  }
}
export class FakeOnboarding implements OnboardingGateway {
  async start(): Promise<string> {
    return 'http://localhost/connect?token=synthetic-token';
  }
  async confirm(): Promise<boolean> {
    return false;
  }
}
export function syntheticEvent(
  text: string,
  sender = 'synthetic-a',
  clock: Clock = { now: () => new Date('2026-10-15T09:00:00Z') }
): ChannelEvent {
  return {
    version: 1,
    event_id: crypto.randomUUID(),
    channel: 'whatsapp',
    channel_account_id: 'synthetic-bot',
    sender_id: sender,
    conversation_id: 'synthetic-dm-' + sender,
    is_direct: true,
    is_from_bot: false,
    sent_at: clock.now().toISOString(),
    text,
  };
}
export const syntheticLabels = ACTIVITIES.map((a) => normalizeLabel(a.sourceLabels[0] ?? a.label));
