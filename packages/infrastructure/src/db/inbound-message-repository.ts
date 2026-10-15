/**
 * Inbound Message Repository Implementation
 */

import type { InboundMessageRepository } from '@sdj/application';
import type { InboundMessage } from '@sdj/contracts';
import { query } from './pool.js';

export class PgInboundMessageRepository implements InboundMessageRepository {
  async create(message: InboundMessage): Promise<InboundMessage> {
    const result = await query<{
      id: string;
      channel_type: string;
      sender_id: string;
      sender_name: string | null;
      phone_number: string | null;
      content: string;
      timestamp: Date;
      metadata: unknown | null;
    }>(
      `INSERT INTO inbound_messages
       (id, channel_type, sender_id, sender_name, phone_number, content, timestamp, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        message.id,
        message.channelType,
        message.senderId,
        message.senderName ?? null,
        message.phoneNumber ?? null,
        message.content,
        message.timestamp,
        message.metadata ? JSON.stringify(message.metadata) : null,
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  async getById(id: string): Promise<InboundMessage | null> {
    const result = await query<{
      id: string;
      channel_type: string;
      sender_id: string;
      sender_name: string | null;
      phone_number: string | null;
      content: string;
      timestamp: Date;
      metadata: unknown | null;
    }>('SELECT * FROM inbound_messages WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  async exists(id: string): Promise<boolean> {
    const result = await query<{ exists: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM inbound_messages WHERE id = $1) as exists',
      [id]
    );
    return result.rows[0]?.exists ?? false;
  }

  async getRecentByUserId(userId: string, limit = 10): Promise<InboundMessage[]> {
    const result = await query<{
      id: string;
      channel_type: string;
      sender_id: string;
      sender_name: string | null;
      phone_number: string | null;
      content: string;
      timestamp: Date;
      metadata: unknown | null;
    }>(
      `SELECT im.* FROM inbound_messages im
       JOIN channel_identities ci ON im.sender_id = ci.sender_id AND im.channel_type = ci.channel_type
       WHERE ci.user_id = $1
       ORDER BY im.timestamp DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows.map(row => this.mapRow(row));
  }

  private mapRow(row: {
    id: string;
    channel_type: string;
    sender_id: string;
    sender_name: string | null;
    phone_number: string | null;
    content: string;
    timestamp: Date;
    metadata: unknown | null;
  }): InboundMessage {
    return {
      id: row.id,
      channelType: row.channel_type as InboundMessage['channelType'],
      senderId: row.sender_id,
      senderName: row.sender_name ?? undefined,
      phoneNumber: row.phone_number ?? undefined,
      content: row.content,
      timestamp: row.timestamp.toISOString(),
      metadata: row.metadata as Record<string, unknown> | undefined,
    };
  }
}
