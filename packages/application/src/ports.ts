import type {
  ActivityId,
  ActorContext,
  CommandProposal,
  ResolvedItem,
  TypedCellValue,
} from '@sdj/domain';
import type {
  ChannelEvent,
  TargetSnapshotContract,
  WriteGroupContract,
  PendingContract,
} from '@sdj/contracts';
export type TargetSnapshot = TargetSnapshotContract;
export type WriteGroup = WriteGroupContract;
export type Pending = PendingContract;
export type Mutation = WriteGroup['mutations'][number];
export interface Clock {
  now(): Date;
}
export interface User {
  id: string;
  timezone: string;
  status: 'pending' | 'active' | 'suspended' | 'deleting' | 'deleted';
  aiAllowed: boolean;
  remindersEnabled?: boolean;
  providerPolicyVersion?: string | null;
}
export interface Tracker {
  id: string;
  userId: string;
  googleConnectionId: string;
  spreadsheetId: string;
  sheetId: number;
  sheetTitle: string;
  fingerprint: string;
  version: number;
  status: 'pending' | 'active' | 'needs_validation' | 'reauth_required' | 'disabled';
}
export interface StoredMessage {
  id: string;
  userId: string;
  identityId: string;
  receivedAt: string;
  sentAt: string;
  text: string;
  channelAccountId: string;
  conversationId: string;
}
export interface CommandRecord {
  id: string;
  status: string;
  groupId: string | null;
}
export interface IngestResult {
  duplicate: boolean;
  actor: ActorContext;
  collision: boolean;
}
export interface JobLease {
  id: string;
  userId: string;
  messageId: string | null;
  groupId: string | null;
  kind: 'process_message' | 'reconcile_mutation';
  token: string;
  attempts: number;
}
export interface Delivery {
  id: string;
  userId: string;
  channelAccountId: string;
  conversationId: string;
  body: string;
  token: string;
}
export interface Store {
  saveSummaryContext(
    actor: ActorContext,
    commandId: string,
    summary: SummaryContext
  ): Promise<void>;
  lastSummaryContext(actor: ActorContext): Promise<SummaryContext | null>;
  ingest(event: ChannelEvent, now: Date): Promise<IngestResult>;
  message(actor: ActorContext): Promise<StoredMessage>;
  user(actor: ActorContext): Promise<User>;
  setAIConsent(actor: ActorContext, allowed: boolean): Promise<void>;
  setReminderEnabled(actor: ActorContext, enabled: boolean): Promise<void>;
  recordRoute(
    actor: ActorContext,
    commandId: string,
    route: 'parser' | 'pending' | 'ai'
  ): Promise<void>;
  tracker(actor: ActorContext): Promise<Tracker | null>;
  command(actor: ActorContext): Promise<CommandRecord>;
  pending(actor: ActorContext): Promise<Pending | null>;
  finish(
    actor: ActorContext,
    commandId: string,
    status: string,
    body: string,
    kind?: 'terminal' | 'status' | 'clarification' | 'pending',
    pending?: Pending
  ): Promise<void>;
  prepare(
    actor: ActorContext,
    commandId: string,
    tracker: Tracker,
    mutations: Mutation[],
    undoOfId: string | null
  ): Promise<WriteGroup>;
  sending(actor: ActorContext, group: WriteGroup): Promise<void>;
  group(actor: ActorContext, id: string): Promise<WriteGroup | null>;
  activeGroup(actor: ActorContext, trackerId: string): Promise<WriteGroup | null>;
  lastGroup(actor: ActorContext, trackerId: string): Promise<WriteGroup | null>;
  finalize(
    actor: ActorContext,
    group: WriteGroup,
    status: WriteGroup['status'],
    mutations: Mutation[],
    body: string
  ): Promise<void>;
  withTrackerLock<T>(trackerId: string, fn: () => Promise<T>): Promise<T | null>;
  disconnect(actor: ActorContext, deleting: boolean): Promise<boolean>;
  claimJob(worker: string, userId?: string): Promise<JobLease | null>;
  completeJob(job: JobLease): Promise<void>;
  retryJob(job: JobLease, code: string, delayMs: number): Promise<void>;
  withJob<T>(job: JobLease, fn: () => Promise<T>): Promise<T>;
  claimDelivery(account: string): Promise<Delivery | null>;
  ackDelivery(account: string, id: string, token: string, remoteId: string): Promise<boolean>;
  nackDelivery(account: string, id: string, token: string, unknown: boolean): Promise<boolean>;
  reserveNonce(keyId: string, nonce: string, expiresAt: Date): Promise<boolean>;
  health(): Promise<boolean>;
  close(): Promise<void>;
}
export interface SummaryContext {
  action: 'daily_summary' | 'monthly_summary';
  date: string;
}
export interface TrackerConfiguration {
  mode: 'reference' | 'adapted';
  activityCount: number;
  dateCount: number;
  dateFrom: string;
  dateTo: string;
  repairedValidationCells?: number;
  resetInputCells?: number;
  convertedInputCells?: number;
}
export interface TrackerRepairProgress {
  repairing: true;
  retrying?: boolean;
  retryAfterMs?: number;
  fingerprint: string;
  progress: {
    repairedValidationCells: number;
    resetInputCells: number;
    convertedInputCells: number;
  };
}
export interface TrackerValidation {
  sheetTitle: string;
  fingerprint: string;
  bindings: Record<ActivityId, number>;
  normalizedLabels?: Record<ActivityId, string>;
  configuration?: TrackerConfiguration;
}
export interface TrackerGateway {
  repairStep?(
    actor: ActorContext,
    googleConnectionId: string,
    spreadsheetId: string,
    sheetId: number,
    runId: string,
    fingerprint?: string
  ): Promise<TrackerValidation | TrackerRepairProgress>;
  inspect(
    actor: ActorContext,
    tracker: Tracker,
    items: readonly (Pick<ResolvedItem, 'activityId' | 'localDate'> & {
      afterValue?: TypedCellValue;
    })[]
  ): Promise<TargetSnapshot[]>;
  write(actor: ActorContext, tracker: Tracker, mutations: readonly Mutation[]): Promise<void>;
  /** Onboarding action: repairs rules and backs up/clears legacy booleans in numeric inputs. */
  validate(
    actor: ActorContext,
    googleConnectionId: string,
    spreadsheetId: string,
    sheetId: number
  ): Promise<TrackerValidation>;
}
export interface IntentInterpreter {
  interpret(
    text: string,
    actor: ActorContext,
    commandId: string,
    context?: import('@sdj/domain').InterpretationContext
  ): Promise<CommandProposal>;
}
export interface OnboardingGateway {
  start(actor: ActorContext, purpose?: 'connect' | 'profile'): Promise<string>;
  confirm(actor: ActorContext, text: string): Promise<boolean>;
}
export class WriteFailure extends Error {
  constructor(
    readonly definitive: boolean,
    readonly code: string
  ) {
    super(code);
  }
}
export interface AIState {
  reserve(
    userId: string,
    targetIds: readonly string[],
    now: Date
  ): Promise<{ targetId: string; attemptId: string } | null>;
  settle(
    attemptId: string,
    result: {
      ok: boolean;
      error?: string;
      blockedUntil?: Date;
      disable?: boolean;
      tokens?: number;
      durationMs?: number;
    }
  ): Promise<void>;
}
export interface AITarget {
  id: string;
  provider: 'groq' | 'gemini' | 'nvidia' | 'openrouter';
  model: string;
  apiKey: string;
  baseUrl: string;
  quotaOwner: string;
  requestsPerMinute: number;
  requestsPerDay: number;
  enabled: boolean;
  timeoutMs?: number;
}
export interface AIUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}
export interface AIAdapter {
  interpret(
    target: AITarget,
    text: string,
    signal: AbortSignal,
    context?: import('@sdj/domain').InterpretationContext,
    usage?: (usage: AIUsage) => void
  ): Promise<CommandProposal>;
}
export interface PreparedItem {
  activityId: ActivityId;
  localDate: string;
  before: TypedCellValue;
  after: TypedCellValue;
}
