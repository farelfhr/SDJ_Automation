import { z } from 'zod';
import { ACTIVITY_IDS, isISODate } from '@sdj/domain';
export const DateReferenceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('today') }).strict(),
  z.object({ kind: z.literal('yesterday') }).strict(),
  z.object({ kind: z.literal('days_ago'), days: z.number().int().min(1).max(31) }).strict(),
  z.object({ kind: z.literal('explicit'), date: z.string().refine(isISODate) }).strict(),
]);
export const CellValueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('blank') }).strict(),
  z.object({ kind: z.literal('number'), value: z.number().finite() }).strict(),
  z.object({ kind: z.literal('boolean'), value: z.boolean() }).strict(),
]);
export const ProposalItemSchema = z
  .object({
    activity_id: z.enum(ACTIVITY_IDS),
    date_reference: DateReferenceSchema,
    value: z.union([z.number().finite(), z.boolean()]),
  })
  .strict();
export const DraftItemSchema = z
  .object({
    activity_id: z.enum(ACTIVITY_IDS).nullable(),
    date_reference: DateReferenceSchema.nullable(),
    value: z.union([z.number().finite(), z.boolean()]).nullable(),
  })
  .strict();
export const CommandProposalSchema = z.discriminatedUnion('action', [
  z
    .object({
      schema_version: z.literal(2),
      action: z.literal('set_activities'),
      items: z.array(ProposalItemSchema).min(1).max(5),
      continues_pending: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      schema_version: z.literal(2),
      action: z.literal('daily_summary'),
      date_reference: DateReferenceSchema,
    })
    .strict(),
  z
    .object({
      schema_version: z.literal(2),
      action: z.literal('monthly_summary'),
      date_reference: DateReferenceSchema,
    })
    .strict(),
  z
    .object({
      schema_version: z.literal(2),
      action: z.literal('clarify'),
      continues_pending: z.boolean().optional(),
      items: z.array(DraftItemSchema).min(1).max(5),
      missing: z
        .array(z.enum(['activity', 'date', 'value']))
        .min(1)
        .refine((v) => new Set(v).size === v.length),
    })
    .strict(),
  ...(
    [
      'help',
      'connection_status',
      'undo_last',
      'connect',
      'disconnect',
      'delete_account',
      'confirm_pending',
      'cancel_pending',
      'reminder_on',
      'reminder_off',
      'reminder_status',
      'refresh_profile',
      'format_summary',
      'unsupported',
    ] as const
  ).map((action) => z.object({ schema_version: z.literal(2), action: z.literal(action) }).strict()),
]);
export const ChannelEventSchema = z
  .object({
    version: z.literal(1),
    event_id: z.string().min(1).max(255),
    channel: z.literal('whatsapp'),
    channel_account_id: z.string().min(1).max(100),
    sender_id: z.string().min(1).max(255),
    conversation_id: z.string().min(1).max(255),
    is_direct: z.boolean(),
    is_from_bot: z.boolean(),
    sent_at: z.string().datetime({ offset: true }),
    text: z.string().min(1).max(1000),
  })
  .strict();
export type ChannelEvent = z.infer<typeof ChannelEventSchema>;
export const TargetSnapshotSchema = z
  .object({
    spreadsheetId: z.string(),
    sheetId: z.number().int().nonnegative(),
    row: z.number().int().nonnegative(),
    column: z.number().int().nonnegative(),
    activityId: z.enum(ACTIVITY_IDS),
    localDate: z.string().refine(isISODate),
    fingerprint: z.string(),
    value: CellValueSchema,
    formula: z.boolean(),
    writable: z.boolean(),
  })
  .strict();
export const StoredMutationSchema = z
  .object({
    id: z.string().uuid(),
    target: TargetSnapshotSchema,
    before: CellValueSchema,
    after: CellValueSchema,
    status: z.enum([
      'prepared',
      'sending',
      'verified',
      'uncertain',
      'needs_review',
      'conflict',
      'failed',
    ]),
  })
  .strict();
export const WriteGroupSchema = z
  .object({
    id: z.string().uuid(),
    commandId: z.string().uuid(),
    trackerId: z.string().uuid(),
    userId: z.string().uuid(),
    status: z.enum([
      'prepared',
      'sending',
      'verified',
      'uncertain',
      'needs_review',
      'conflict',
      'failed',
    ]),
    createdAt: z.string().datetime(),
    verifiedAt: z.string().datetime().nullable(),
    undoOfId: z.string().uuid().nullable(),
    mutations: z.array(StoredMutationSchema).min(1).max(5),
  })
  .strict();
export const PendingSchema = z
  .object({
    proposal: CommandProposalSchema,
    referenceReceivedAt: z.string().datetime(),
    timezone: z.string(),
    expiresAt: z.string().datetime(),
    mode: z.enum(['slots', 'date', 'disconnect', 'delete_account', 'ai_consent']),
    deferred_request: z
      .object({
        text: z.string().min(1).max(1000),
        received_at: z.string().datetime(),
        sent_at: z.string().datetime(),
      })
      .strict()
      .optional(),
  })
  .strict();
export const AIFailureSchema = z.enum([
  'rate_limit',
  'quota_exhausted',
  'authentication',
  'configuration',
  'network',
  'invalid_output',
  'refusal',
]);
export const AIResponseEnvelopeSchema = z
  .object({
    action: z.enum([
      'set_activities',
      'daily_summary',
      'monthly_summary',
      'clarify',
      'unsupported',
      'help',
      'connection_status',
      'undo_last',
      'connect',
      'disconnect',
      'delete_account',
      'confirm_pending',
      'cancel_pending',
      'reminder_on',
      'reminder_off',
      'reminder_status',
      'refresh_profile',
      'format_summary',
    ]),
    items: z.array(DraftItemSchema).max(5),
    date_reference: DateReferenceSchema.nullable(),
    missing: z.array(z.enum(['activity', 'date', 'value'])),
    continues_pending: z.boolean().optional(),
  })
  .strict();
export type TargetSnapshotContract = z.infer<typeof TargetSnapshotSchema>;
export type WriteGroupContract = z.infer<typeof WriteGroupSchema>;
export type PendingContract = z.infer<typeof PendingSchema>;
