/**
 * Channel Gateway Port
 *
 * Interface for sending messages to users via WhatsApp.
 */

import type { User } from '@sdj/domain';

/**
 * Outbound message to send
 */
export interface OutboundMessage {
  readonly userId: string;
  readonly content: string;
  readonly priority: 'low' | 'normal' | 'high';
  readonly replyToMessageId?: string;
}

/**
 * Delivery status
 */
export interface DeliveryStatus {
  readonly messageId: string;
  readonly status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  readonly timestamp: Date;
  readonly error?: string;
}

/**
 * Channel gateway interface
 */
export interface ChannelGateway {
  /**
   * Send a message to a user
   */
  send(message: OutboundMessage): Promise<string>; // Returns message ID

  /**
   * Send multiple messages in batch
   */
  sendBatch(messages: OutboundMessage[]): Promise<string[]>; // Returns message IDs

  /**
   * Get delivery status
   */
  getDeliveryStatus(messageId: string): Promise<DeliveryStatus>;

  /**
   * Format a response message for the user
   */
  formatResponse(user: User, content: string): OutboundMessage;
}
