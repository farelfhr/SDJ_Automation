/**
 * Channel Identity
 *
 * Represents the WhatsApp sender mapping.
 */

// Channel types
export const CHANNEL_TYPES = ['whatsapp'] as const;
export type ChannelType = typeof CHANNEL_TYPES[number];

/**
 * Channel identity record
 */
export interface ChannelIdentity {
  readonly id: string;
  readonly userId: string;
  readonly channelType: ChannelType;
  readonly senderId: string;
  readonly senderName?: string;
  readonly phoneNumber?: string;
  readonly isVerified: boolean;
  readonly createdAt: Date;
  readonly lastMessageAt?: Date;
}

/**
 * Create a new channel identity
 */
export function createChannelIdentity(params: {
  userId: string;
  channelType: ChannelType;
  senderId: string;
  senderName?: string;
  phoneNumber?: string;
}): ChannelIdentity {
  return {
    id: crypto.randomUUID(),
    userId: params.userId,
    channelType: params.channelType,
    senderId: params.senderId,
    senderName: params.senderName,
    phoneNumber: params.phoneNumber,
    isVerified: false,
    createdAt: new Date(),
  };
}

/**
 * Verify channel identity
 */
export function verifyChannelIdentity(identity: ChannelIdentity): ChannelIdentity {
  return {
    ...identity,
    isVerified: true,
  };
}

/**
 * Update last message timestamp
 */
export function updateLastMessage(identity: ChannelIdentity): ChannelIdentity {
  return {
    ...identity,
    lastMessageAt: new Date(),
  };
}
