/**
 * Channel Identity Repository Implementation
 */

import type { ChannelIdentityRepository } from '@sdj/application';
import type { ChannelIdentity, ChannelType } from '@sdj/domain';
import { query } from './pool.js';

export class PgChannelIdentityRepository implements ChannelIdentityRepository {
  async create(identity: ChannelIdentity): Promise<ChannelIdentity> {
    const result = await query<{
      id: string;
      user_id: string;
      channel_type: string;
      sender_id: string;
      sender_name: string | null;
      phone_number: string | null;
      is_verified: boolean;
      created_at: Date;
      last_message_at: Date | null;
    }>(
      `INSERT INTO channel_identities
       (id, user_id, channel_type, sender_id, sender_name, phone_number, is_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        identity.id,
        identity.userId,
        identity.channelType,
        identity.senderId,
        identity.senderName ?? null,
        identity.phoneNumber ?? null,
        identity.isVerified,
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  async getById(id: string): Promise<ChannelIdentity | null> {
    const result = await query<{
      id: string;
      user_id: string;
      channel_type: string;
      sender_id: string;
      sender_name: string | null;
      phone_number: string | null;
      is_verified: boolean;
      created_at: Date;
      last_message_at: Date | null;
    }>('SELECT * FROM channel_identities WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  async getBySenderId(
    senderId: string,
    channelType: string
  ): Promise<ChannelIdentity | null> {
    const result = await query<{
      id: string;
      user_id: string;
      channel_type: string;
      sender_id: string;
      sender_name: string | null;
      phone_number: string | null;
      is_verified: boolean;
      created_at: Date;
      last_message_at: Date | null;
    }>(
      'SELECT * FROM channel_identities WHERE sender_id = $1 AND channel_type = $2',
      [senderId, channelType]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  async getUserIdBySenderId(
    senderId: string,
    channelType: string
  ): Promise<string | null> {
    const result = await query<{ user_id: string }>(
      'SELECT user_id FROM channel_identities WHERE sender_id = $1 AND channel_type = $2',
      [senderId, channelType]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0]?.user_id ?? null;
  }

  async update(identity: ChannelIdentity): Promise<ChannelIdentity> {
    const result = await query<{
      id: string;
      user_id: string;
      channel_type: string;
      sender_id: string;
      sender_name: string | null;
      phone_number: string | null;
      is_verified: boolean;
      created_at: Date;
      last_message_at: Date | null;
    }>(
      `UPDATE channel_identities
       SET sender_name = $3, phone_number = $4, is_verified = $5, last_message_at = $6
       WHERE id = $1
       RETURNING *`,
      [
        identity.id,
        identity.userId,
        identity.senderName ?? null,
        identity.phoneNumber ?? null,
        identity.isVerified,
        identity.lastMessageAt ?? null,
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  async updateLastMessage(id: string): Promise<void> {
    await query(
      'UPDATE channel_identities SET last_message_at = NOW() WHERE id = $1',
      [id]
    );
  }

  async verify(id: string): Promise<void> {
    await query(
      'UPDATE channel_identities SET is_verified = true WHERE id = $1',
      [id]
    );
  }

  private mapRow(row: {
    id: string;
    user_id: string;
    channel_type: string;
    sender_id: string;
    sender_name: string | null;
    phone_number: string | null;
    is_verified: boolean;
    created_at: Date;
    last_message_at: Date | null;
  }): ChannelIdentity {
    return {
      id: row.id,
      userId: row.user_id,
      channelType: row.channel_type as ChannelType,
      senderId: row.sender_id,
      senderName: row.sender_name ?? undefined,
      phoneNumber: row.phone_number ?? undefined,
      isVerified: row.is_verified,
      createdAt: row.created_at,
      lastMessageAt: row.last_message_at ?? undefined,
    };
  }
}
