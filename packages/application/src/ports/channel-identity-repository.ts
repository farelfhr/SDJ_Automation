/**
 * Channel Identity Repository Port
 *
 * Interface for managing channel identities.
 */

import type { ChannelIdentity } from '@sdj/domain';

/**
 * Channel identity repository interface
 */
export interface ChannelIdentityRepository {
  /**
   * Create a new channel identity
   */
  create(identity: ChannelIdentity): Promise<ChannelIdentity>;

  /**
   * Get by ID
   */
  getById(id: string): Promise<ChannelIdentity | null>;

  /**
   * Get by sender ID (e.g., WhatsApp sender)
   */
  getBySenderId(senderId: string, channelType: string): Promise<ChannelIdentity | null>;

  /**
   * Get user ID from sender
   */
  getUserIdBySenderId(senderId: string, channelType: string): Promise<string | null>;

  /**
   * Update identity
   */
  update(identity: ChannelIdentity): Promise<ChannelIdentity>;

  /**
   * Update last message timestamp
   */
  updateLastMessage(id: string): Promise<void>;

  /**
   * Verify identity
   */
  verify(id: string): Promise<void>;
}
