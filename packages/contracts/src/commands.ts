/**
 * Command Schemas
 *
 * Zod schemas for command parsing and processing.
 */

import { z } from 'zod';

// Command action enum
export const CommandActionSchema = z.enum([
  'SET_SCORE',
  'QUERY',
  'RECAP',
  'UNDO',
  'HELP',
  'STATUS',
  'UNKNOWN',
]);

// Date anchor enum
export const DateAnchorSchema = z.enum(['today', 'yesterday', 'tomorrow', 'explicit']);

// Date resolution
export const DateResolutionSchema = z.object({
  date: z.string(), // ISO date string
  anchor: DateAnchorSchema,
  precision: z.enum(['day', 'week', 'month']),
  description: z.string(),
});

// Activity ID reference
export const ActivityIdRefSchema = z.object({
  type: z.string(),
  id: z.string(),
  displayName: z.string(),
});

// Command proposal (parsed intent)
export const CommandProposalSchema = z.object({
  action: CommandActionSchema,
  activityId: ActivityIdRefSchema.optional(),
  score: z.number().int().optional(),
  date: DateResolutionSchema.optional(),
  rawText: z.string(),
  confidence: z.number().min(0).max(1),
  requiresAI: z.boolean(),
});

// Inbound message
export const InboundMessageSchema = z.object({
  id: z.string(),
  channelType: z.enum(['whatsapp']),
  senderId: z.string(),
  senderName: z.string().optional(),
  phoneNumber: z.string().optional(),
  content: z.string(),
  timestamp: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// Channel event
export const ChannelEventSchema = z.object({
  type: z.enum(['message', 'ack', 'delivery', 'read']),
  messageId: z.string(),
  timestamp: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// Type exports
export type CommandAction = z.infer<typeof CommandActionSchema>;
export type DateAnchor = z.infer<typeof DateAnchorSchema>;
export type DateResolution = z.infer<typeof DateResolutionSchema>;
export type ActivityIdRef = z.infer<typeof ActivityIdRefSchema>;
export type CommandProposal = z.infer<typeof CommandProposalSchema>;
export type InboundMessage = z.infer<typeof InboundMessageSchema>;
export type ChannelEvent = z.infer<typeof ChannelEventSchema>;
