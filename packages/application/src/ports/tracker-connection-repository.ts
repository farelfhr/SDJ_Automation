/**
 * Tracker Connection Repository Port
 *
 * Interface for managing tracker connections.
 */

import type { TrackerConnection } from '@sdj/contracts';

/**
 * Tracker connection repository interface
 */
export interface TrackerConnectionRepository {
  /**
   * Create a new tracker connection
   */
  create(connection: TrackerConnection): Promise<TrackerConnection>;

  /**
   * Get by ID
   */
  getById(id: string): Promise<TrackerConnection | null>;

  /**
   * Get by user ID
   */
  getByUserId(userId: string): Promise<TrackerConnection | null>;

  /**
   * Get active connection for user
   */
  getActiveByUserId(userId: string): Promise<TrackerConnection | null>;

  /**
   * Update connection
   */
  update(connection: TrackerConnection): Promise<TrackerConnection>;

  /**
   * Deactivate connection
   */
  deactivate(id: string): Promise<void>;

  /**
   * Update last sync timestamp
   */
  updateLastSync(id: string): Promise<void>;
}
