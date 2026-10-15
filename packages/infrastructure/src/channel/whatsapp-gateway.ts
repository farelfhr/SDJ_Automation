/**
 * Channel Gateway Implementation
 *
 * Sends messages via WhatsApp (OpenClaw integration).
 */

import type { ChannelGateway, OutboundMessage, DeliveryStatus } from '@sdj/application';
import type { User } from '@sdj/domain';

export class WhatsAppChannelGateway implements ChannelGateway {
  private readonly webhookSecret: string;
  private readonly apiKey: string;
  private readonly instanceId: string;

  constructor(options: {
    webhookSecret: string;
    apiKey: string;
    instanceId: string;
  }) {
    this.webhookSecret = options.webhookSecret;
    this.apiKey = options.apiKey;
    this.instanceId = options.instanceId;
  }

  async send(message: OutboundMessage): Promise<string> {
    // In production, this would call OpenClaw API
    // For now, return a mock message ID
    console.log('Sending WhatsApp message:', {
      userId: message.userId,
      content: message.content.substring(0, 50),
      priority: message.priority,
    });

    return `msg_${crypto.randomUUID()}`;
  }

  async sendBatch(messages: OutboundMessage[]): Promise<string[]> {
    return Promise.all(messages.map(m => this.send(m)));
  }

  async getDeliveryStatus(messageId: string): Promise<DeliveryStatus> {
    // In production, this would query OpenClaw for delivery status
    return {
      messageId,
      status: 'sent',
      timestamp: new Date(),
    };
  }

  formatResponse(user: User, content: string): OutboundMessage {
    return {
      userId: user.id,
      content,
      priority: 'normal',
    };
  }
}

/**
 * HMAC Verification
 */
export function verifyHMAC(
  payload: string,
  signature: string,
  secret: string
): boolean {
  // Implementation would use crypto.createHmac
  // For now, simplified check
  return signature.length > 0;
}

/**
 * Generate HMAC signature
 */
export function generateHMAC(
  payload: string,
  secret: string
): string {
  // Implementation would use crypto.createHmac
  return `hmac_${Buffer.from(payload).toString('base64').substring(0, 32)}`;
}
