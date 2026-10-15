/**
 * Mutation Repository Port
 *
 * Interface for managing mutation journal.
 */

import type { Mutation, MutationStatus } from '@sdj/domain';

/**
 * Mutation repository interface
 */
export interface MutationRepository {
  /**
   * Create a new mutation
   */
  create(mutation: Mutation): Promise<Mutation>;

  /**
   * Get mutation by ID
   */
  getById(id: string): Promise<Mutation | null>;

  /**
   * Get mutations for a user
   */
  getByUserId(
    userId: string,
    options?: { limit?: number; offset?: number; status?: MutationStatus }
  ): Promise<Mutation[]>;

  /**
   * Get mutations for a date
   */
  getByDate(userId: string, date: string): Promise<Mutation[]>;

  /**
   * Get last undoable mutation
   */
  getLastUndoable(userId: string): Promise<Mutation | null>;

  /**
   * Update mutation status
   */
  updateStatus(id: string, status: MutationStatus, appliedAt?: Date): Promise<void>;

  /**
   * Set rollback mutation ID
   */
  setRollbackMutationId(id: string, rollbackMutationId: string): Promise<void>;

  /**
   * Check idempotency
   */
  existsByIdempotencyKey(idempotencyKey: string): Promise<boolean>;
}
