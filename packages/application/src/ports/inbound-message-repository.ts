/**
 * Inbound Message Repository Port
 *
 * Interface for managing inbound messages.
 */

import type { InboundMessage } from '@sdj/contracts';

/**
 * Inbound message repository interface
 */
export interface InboundMessageRepository {
  /**
   * Save an inbound message
   */
  create(message: InboundMessage): Promise<InboundMessage>;

  /**
   * Get by ID
   */
  getById(id: string): Promise<InboundMessage | null>;

  /**
   * Check if message exists (deduplication)
   */
  exists(id: string): Promise<boolean>;

  /**
   * Get recent messages for user
   */
  getRecentByUserId(
    userId: string,
    limit?: number
  ): Promise<InboundMessage[]>;
}
