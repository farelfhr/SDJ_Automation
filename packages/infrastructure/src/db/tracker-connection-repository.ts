/**
 * Tracker Connection Repository Implementation
 */

import type { TrackerConnectionRepository } from '@sdj/application';
import type { TrackerConnection } from '@sdj/contracts';
import { query } from './pool.js';

export class PgTrackerConnectionRepository implements TrackerConnectionRepository {
  async create(connection: TrackerConnection): Promise<TrackerConnection> {
    const result = await query<{
      id: string;
      user_id: string;
      google_connection_id: string;
      spreadsheet_id: string;
      spreadsheet_name: string;
      sheet_name: string;
      date_column_start: number;
      activity_row_start: number;
      is_active: boolean;
      last_sync_at: Date | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `INSERT INTO tracker_connections
       (id, user_id, google_connection_id, spreadsheet_id, spreadsheet_name, sheet_name,
        date_column_start, activity_row_start, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        connection.id,
        connection.userId,
        connection.googleConnectionId,
        connection.spreadsheetId,
        connection.spreadsheetName,
        connection.sheetName,
        connection.dateColumnStart,
        connection.activityRowStart,
        connection.isActive,
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  async getById(id: string): Promise<TrackerConnection | null> {
    const result = await query<{
      id: string;
      user_id: string;
      google_connection_id: string;
      spreadsheet_id: string;
      spreadsheet_name: string;
      sheet_name: string;
      date_column_start: number;
      activity_row_start: number;
      is_active: boolean;
      last_sync_at: Date | null;
      created_at: Date;
      updated_at: Date;
    }>('SELECT * FROM tracker_connections WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  async getByUserId(userId: string): Promise<TrackerConnection | null> {
    const result = await query<{
      id: string;
      user_id: string;
      google_connection_id: string;
      spreadsheet_id: string;
      spreadsheet_name: string;
      sheet_name: string;
      date_column_start: number;
      activity_row_start: number;
      is_active: boolean;
      last_sync_at: Date | null;
      created_at: Date;
      updated_at: Date;
    }>('SELECT * FROM tracker_connections WHERE user_id = $1', [userId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  async getActiveByUserId(userId: string): Promise<TrackerConnection | null> {
    const result = await query<{
      id: string;
      user_id: string;
      google_connection_id: string;
      spreadsheet_id: string;
      spreadsheet_name: string;
      sheet_name: string;
      date_column_start: number;
      activity_row_start: number;
      is_active: boolean;
      last_sync_at: Date | null;
      created_at: Date;
      updated_at: Date;
    }>(
      'SELECT * FROM tracker_connections WHERE user_id = $1 AND is_active = true',
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  async update(connection: TrackerConnection): Promise<TrackerConnection> {
    const result = await query<{
      id: string;
      user_id: string;
      google_connection_id: string;
      spreadsheet_id: string;
      spreadsheet_name: string;
      sheet_name: string;
      date_column_start: number;
      activity_row_start: number;
      is_active: boolean;
      last_sync_at: Date | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `UPDATE tracker_connections
       SET spreadsheet_name = $3, sheet_name = $4, date_column_start = $5,
           activity_row_start = $6, is_active = $7, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        connection.id,
        connection.userId,
        connection.spreadsheetName,
        connection.sheetName,
        connection.dateColumnStart,
        connection.activityRowStart,
        connection.isActive,
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  async deactivate(id: string): Promise<void> {
    await query(
      'UPDATE tracker_connections SET is_active = false, updated_at = NOW() WHERE id = $1',
      [id]
    );
  }

  async updateLastSync(id: string): Promise<void> {
    await query(
      'UPDATE tracker_connections SET last_sync_at = NOW(), updated_at = NOW() WHERE id = $1',
      [id]
    );
  }

  private mapRow(row: {
    id: string;
    user_id: string;
    google_connection_id: string;
    spreadsheet_id: string;
    spreadsheet_name: string;
    sheet_name: string;
    date_column_start: number;
    activity_row_start: number;
    is_active: boolean;
    last_sync_at: Date | null;
    created_at: Date;
    updated_at: Date;
  }): TrackerConnection {
    return {
      id: row.id,
      userId: row.user_id,
      googleConnectionId: row.google_connection_id,
      spreadsheetId: row.spreadsheet_id,
      spreadsheetName: row.spreadsheet_name,
      sheetName: row.sheet_name,
      dateColumnStart: row.date_column_start,
      activityRowStart: row.activity_row_start,
      isActive: row.is_active,
      lastSyncAt: row.last_sync_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
