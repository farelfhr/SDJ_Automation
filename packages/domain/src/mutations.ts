/**
 * Mutations
 *
 * Represents changes to be applied to the tracker.
 */

import type { ActivityId } from './activities.js';
import type { DateResolution } from './dates.js';
import type { CommandAction } from './commands.js';

// Mutation types
export const MUTATION_TYPES = ['SET_SCORE', 'UNDO', 'CORRECTION'] as const;
export type MutationType = typeof MUTATION_TYPES[number];

// Mutation status
export const MUTATION_STATUSES = ['PENDING', 'APPLIED', 'FAILED', 'ROLLED_BACK'] as const;
export type MutationStatus = typeof MUTATION_STATUSES[number];

/**
 * Cell position in spreadsheet
 */
export interface CellPosition {
  readonly row: number;
  readonly column: number;
}

/**
 * Cell value with metadata
 */
export interface TypedCellValue {
  readonly activityId: ActivityId;
  readonly date: DateResolution;
  readonly score: number;
  readonly previousScore?: number;
  readonly timestamp: Date;
}

/**
 * Mutation record
 */
export interface Mutation {
  readonly id: string;
  readonly userId: string;
  readonly type: MutationType;
  readonly action: CommandAction;
  readonly activityId: ActivityId;
  readonly targetDate: DateResolution;
  readonly newValue: number;
  readonly previousValue?: number;
  readonly status: MutationStatus;
  readonly createdAt: Date;
  readonly appliedAt?: Date;
  readonly rollbackMutationId?: string;
  readonly idempotencyKey: string;
  readonly channelMessageId: string;
}

/**
 * Create a new mutation record
 */
export function createMutation(params: {
  userId: string;
  type: MutationType;
  action: CommandAction;
  activityId: ActivityId;
  targetDate: DateResolution;
  newValue: number;
  previousValue?: number;
  status?: MutationStatus;
  idempotencyKey: string;
  channelMessageId: string;
}): Mutation {
  return {
    id: crypto.randomUUID(),
    userId: params.userId,
    type: params.type,
    action: params.action,
    activityId: params.activityId,
    targetDate: params.targetDate,
    newValue: params.newValue,
    previousValue: params.previousValue,
    status: params.status ?? 'PENDING',
    createdAt: new Date(),
    idempotencyKey: params.idempotencyKey,
    channelMessageId: params.channelMessageId,
  };
}

/**
 * Check if mutation is eligible for undo
 */
export function isUndoable(mutation: Mutation): boolean {
  return (
    mutation.status === 'APPLIED' &&
    mutation.type === 'SET_SCORE' &&
    mutation.previousValue !== undefined
  );
}

/**
 * Check if mutation can be rolled back
 */
export function canRollback(mutation: Mutation): boolean {
  return mutation.status === 'PENDING' || mutation.status === 'FAILED';
}

/**
 * Mutation result
 */
export interface MutationResult {
  readonly success: boolean;
  readonly mutation: Mutation;
  readonly response: string;
  readonly rollbackMutation?: Mutation;
}
