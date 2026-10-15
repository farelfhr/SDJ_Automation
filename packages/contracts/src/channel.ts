/**
 * Channel Schemas
 *
 * Zod schemas for WhatsApp/OpenClaw channel operations.
 */

import { z } from 'zod';

// Channel type
export const ChannelTypeSchema = z.enum(['whatsapp']);

// Channel identity
export const ChannelIdentitySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  channelType: ChannelTypeSchema,
  senderId: z.string(),
  senderName: z.string().optional(),
  phoneNumber: z.string().optional(),
  isVerified: z.boolean(),
  createdAt: z.string().datetime(),
  lastMessageAt: z.string().datetime().nullable(),
});

// Inbound message
export const InboundMessageSchema = z.object({
  id: z.string(),
  channelType: ChannelTypeSchema,
  senderId: z.string(),
  senderName: z.string().optional(),
  phoneNumber: z.string().optional(),
  content: z.string(),
  timestamp: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// Outbound message
export const OutboundMessageSchema = z.object({
  id: z.string(),
  recipientId: z.string(),
  channelType: ChannelTypeSchema,
  content: z.string(),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  scheduledAt: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string().datetime(),
  sentAt: z.string().datetime().nullable(),
  deliveredAt: z.string().datetime().nullable(),
  readAt: z.string().datetime().nullable(),
  status: z.enum(['pending', 'sent', 'delivered', 'read', 'failed']).default('pending'),
  failureReason: z.string().optional(),
});

// Delivery status update
export const DeliveryStatusUpdateSchema = z.object({
  messageId: z.string(),
  status: z.enum(['sent', 'delivered', 'read', 'failed']),
  timestamp: z.string().datetime(),
  failureReason: z.string().optional(),
});

// Webhook event (from OpenClaw)
export const WebhookEventSchema = z.object({
  event: z.enum(['message', 'ack', 'delivery', 'read', 'error']),
  messageId: z.string(),
  timestamp: z.string().datetime(),
  data: z.record(z.string(), z.unknown()),
  signature: z.string().optional(),
});

// HMAC verification
export const HMACVerificationSchema = z.object({
  timestamp: z.string(),
  nonce: z.string(),
  body: z.string(),
  signature: z.string(),
});

// Type exports
export type ChannelType = z.infer<typeof ChannelTypeSchema>;
export type ChannelIdentity = z.infer<typeof ChannelIdentitySchema>;
export type InboundMessage = z.infer<typeof InboundMessageSchema>;
export type OutboundMessage = z.infer<typeof OutboundMessageSchema>;
export type DeliveryStatusUpdate = z.infer<typeof DeliveryStatusUpdateSchema>;
export type WebhookEvent = z.infer<typeof WebhookEventSchema>;
export type HMACVerification = z.infer<typeof HMACVerificationSchema>;
