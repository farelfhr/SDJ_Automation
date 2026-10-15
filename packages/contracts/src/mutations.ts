/**
 * Mutation Schemas
 *
 * Zod schemas for mutation/journal operations.
 */

import { z } from 'zod';

// Mutation type enum
export const MutationTypeSchema = z.enum(['SET_SCORE', 'UNDO', 'CORRECTION']);

// Mutation status enum
export const MutationStatusSchema = z.enum(['PENDING', 'APPLIED', 'FAILED', 'ROLLED_BACK']);

// Cell position
export const CellPositionSchema = z.object({
  row: z.number().int(),
  column: z.number().int(),
});

// Typed cell value
export const TypedCellValueSchema = z.object({
  activityId: z.string(),
  date: z.string(), // ISO date string
  score: z.number().int(),
  previousScore: z.number().int().optional(),
  timestamp: z.string().datetime(),
});

// Mutation record
export const MutationSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  type: MutationTypeSchema,
  action: z.string(),
  activityId: z.string(),
  targetDate: z.string(), // ISO date string
  newValue: z.number().int(),
  previousValue: z.number().int().optional(),
  status: MutationStatusSchema,
  createdAt: z.string().datetime(),
  appliedAt: z.string().datetime().nullable(),
  rollbackMutationId: z.string().uuid().nullable(),
  idempotencyKey: z.string(),
  channelMessageId: z.string(),
});

// Mutation create input
export const MutationCreateInputSchema = z.object({
  userId: z.string().uuid(),
  type: MutationTypeSchema,
  action: z.string(),
  activityId: z.string(),
  targetDate: z.string(),
  newValue: z.number().int(),
  previousValue: z.number().int().optional(),
  idempotencyKey: z.string(),
  channelMessageId: z.string(),
});

// Mutation result
export const MutationResultSchema = z.object({
  success: z.boolean(),
  mutation: MutationSchema,
  response: z.string(),
  rollbackMutationId: z.string().uuid().nullable(),
});

// Type exports
export type MutationType = z.infer<typeof MutationTypeSchema>;
export type MutationStatus = z.infer<typeof MutationStatusSchema>;
export type CellPosition = z.infer<typeof CellPositionSchema>;
export type TypedCellValue = z.infer<typeof TypedCellValueSchema>;
export type Mutation = z.infer<typeof MutationSchema>;
export type MutationCreateInput = z.infer<typeof MutationCreateInputSchema>;
export type MutationResult = z.infer<typeof MutationResultSchema>;
