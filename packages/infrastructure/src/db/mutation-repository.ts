/**
 * Mutation Repository Implementation
 */

import type { MutationRepository } from '@sdj/application';
import type { Mutation, MutationStatus, CommandAction, ActivityId, DateResolution } from '@sdj/domain';
import { query } from './pool.js';

export class PgMutationRepository implements MutationRepository {
  async create(mutation: Mutation): Promise<Mutation> {
    const result = await query<{
      id: string;
      user_id: string;
      type: string;
      action: string;
      activity_id: string;
      activity_type: string;
      activity_display_name: string;
      target_date: string;
      date_anchor: string;
      date_precision: string;
      date_description: string;
      new_value: number;
      previous_value: number | null;
      status: string;
      created_at: Date;
      applied_at: Date | null;
      rollback_mutation_id: string | null;
      idempotency_key: string;
      channel_message_id: string;
    }>(
      `INSERT INTO mutations
       (id, user_id, type, action, activity_id, activity_type, activity_display_name,
        target_date, date_anchor, date_precision, date_description,
        new_value, previous_value, status, idempotency_key, channel_message_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING *`,
      [
        mutation.id,
        mutation.userId,
        mutation.type,
        mutation.action,
        mutation.activityId.id,
        mutation.activityId.type,
        mutation.activityId.displayName,
        mutation.targetDate.date.toISOString(),
        mutation.targetDate.anchor,
        mutation.targetDate.precision,
        mutation.targetDate.description,
        mutation.newValue,
        mutation.previousValue ?? null,
        mutation.status,
        mutation.idempotencyKey,
        mutation.channelMessageId,
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  async getById(id: string): Promise<Mutation | null> {
    const result = await query<{
      id: string;
      user_id: string;
      type: string;
      action: string;
      activity_id: string;
      activity_type: string;
      activity_display_name: string;
      target_date: string;
      date_anchor: string;
      date_precision: string;
      date_description: string;
      new_value: number;
      previous_value: number | null;
      status: string;
      created_at: Date;
      applied_at: Date | null;
      rollback_mutation_id: string | null;
      idempotency_key: string;
      channel_message_id: string;
    }>('SELECT * FROM mutations WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  async getByUserId(
    userId: string,
    options?: { limit?: number; offset?: number; status?: MutationStatus }
  ): Promise<Mutation[]> {
    const params: unknown[] = [userId];
    let whereClause = 'WHERE user_id = $1';

    if (options?.status) {
      params.push(options.status);
      whereClause += ` AND status = $${params.length}`;
    }

    let limitClause = '';
    if (options?.limit) {
      params.push(options.limit);
      limitClause = ` LIMIT $${params.length}`;
    }

    let offsetClause = '';
    if (options?.offset) {
      params.push(options.offset);
      offsetClause = ` OFFSET $${params.length}`;
    }

    const result = await query<{
      id: string;
      user_id: string;
      type: string;
      action: string;
      activity_id: string;
      activity_type: string;
      activity_display_name: string;
      target_date: string;
      date_anchor: string;
      date_precision: string;
      date_description: string;
      new_value: number;
      previous_value: number | null;
      status: string;
      created_at: Date;
      applied_at: Date | null;
      rollback_mutation_id: string | null;
      idempotency_key: string;
      channel_message_id: string;
    }>(
      `SELECT * FROM mutations ${whereClause} ORDER BY created_at DESC${limitClause}${offsetClause}`,
      params
    );

    return result.rows.map(row => this.mapRow(row));
  }

  async getByDate(userId: string, date: string): Promise<Mutation[]> {
    const result = await query<{
      id: string;
      user_id: string;
      type: string;
      action: string;
      activity_id: string;
      activity_type: string;
      activity_display_name: string;
      target_date: string;
      date_anchor: string;
      date_precision: string;
      date_description: string;
      new_value: number;
      previous_value: number | null;
      status: string;
      created_at: Date;
      applied_at: Date | null;
      rollback_mutation_id: string | null;
      idempotency_key: string;
      channel_message_id: string;
    }>(
      `SELECT * FROM mutations
       WHERE user_id = $1 AND target_date = $2
       ORDER BY created_at DESC`,
      [userId, date]
    );

    return result.rows.map(row => this.mapRow(row));
  }

  async getLastUndoable(userId: string): Promise<Mutation | null> {
    const result = await query<{
      id: string;
      user_id: string;
      type: string;
      action: string;
      activity_id: string;
      activity_type: string;
      activity_display_name: string;
      target_date: string;
      date_anchor: string;
      date_precision: string;
      date_description: string;
      new_value: number;
      previous_value: number | null;
      status: string;
      created_at: Date;
      applied_at: Date | null;
      rollback_mutation_id: string | null;
      idempotency_key: string;
      channel_message_id: string;
    }>(
      `SELECT * FROM mutations
       WHERE user_id = $1 AND status = 'APPLIED' AND type = 'SET_SCORE' AND previous_value IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  async updateStatus(id: string, status: MutationStatus, appliedAt?: Date): Promise<void> {
    const params: unknown[] = [id, status];
    let updateClause = 'status = $2';

    if (appliedAt) {
      params.push(appliedAt);
      updateClause += `, applied_at = $${params.length}`;
    }

    await query(`UPDATE mutations SET ${updateClause} WHERE id = $1`, params);
  }

  async setRollbackMutationId(id: string, rollbackMutationId: string): Promise<void> {
    await query(
      'UPDATE mutations SET rollback_mutation_id = $2 WHERE id = $1',
      [id, rollbackMutationId]
    );
  }

  async existsByIdempotencyKey(idempotencyKey: string): Promise<boolean> {
    const result = await query<{ exists: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM mutations WHERE idempotency_key = $1) as exists',
      [idempotencyKey]
    );
    return result.rows[0]?.exists ?? false;
  }

  private mapRow(row: {
    id: string;
    user_id: string;
    type: string;
    action: string;
    activity_id: string;
    activity_type: string;
    activity_display_name: string;
    target_date: string;
    date_anchor: string;
    date_precision: string;
    date_description: string;
    new_value: number;
    previous_value: number | null;
    status: string;
    created_at: Date;
    applied_at: Date | null;
    rollback_mutation_id: string | null;
    idempotency_key: string;
    channel_message_id: string;
  }): Mutation {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type as Mutation['type'],
      action: row.action as CommandAction,
      activityId: {
        type: row.activity_type,
        id: row.activity_id,
        displayName: row.activity_display_name,
      } as ActivityId,
      targetDate: {
        date: new Date(row.target_date),
        anchor: row.date_anchor as DateResolution['anchor'],
        precision: row.date_precision as DateResolution['precision'],
        description: row.date_description,
      } as DateResolution,
      newValue: row.new_value,
      previousValue: row.previous_value ?? undefined,
      status: row.status as MutationStatus,
      createdAt: row.created_at,
      appliedAt: row.applied_at ?? undefined,
      rollbackMutationId: row.rollback_mutation_id ?? undefined,
      idempotencyKey: row.idempotency_key,
      channelMessageId: row.channel_message_id,
    };
  }
}
