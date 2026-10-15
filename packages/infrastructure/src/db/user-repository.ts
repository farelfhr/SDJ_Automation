/**
 * User Repository Implementation
 */

import type { UserRepository } from '@sdj/application';
import type { User, UserStatus } from '@sdj/domain';
import { query } from './pool.js';

export class PgUserRepository implements UserRepository {
  async create(user: User): Promise<User> {
    const result = await query<{
      id: string;
      created_at: Date;
      updated_at: Date;
      status: string;
      timezone: string;
      language: string;
      consent_given: boolean;
      consent_timestamp: Date | null;
      display_name: string | null;
      email: string | null;
      phone_number: string | null;
    }>(
      `INSERT INTO users (id, status, timezone, language, consent_given, display_name, email, phone_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        user.id,
        user.status,
        user.timezone,
        user.language,
        user.consentGiven,
        user.displayName ?? null,
        user.email ?? null,
        user.phoneNumber ?? null,
      ]
    );

    const row = result.rows[0];
    return this.mapRow(row);
  }

  async getById(id: string): Promise<User | null> {
    const result = await query<{
      id: string;
      created_at: Date;
      updated_at: Date;
      status: string;
      timezone: string;
      language: string;
      consent_given: boolean;
      consent_timestamp: Date | null;
      display_name: string | null;
      email: string | null;
      phone_number: string | null;
    }>('SELECT * FROM users WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  async getByEmail(email: string): Promise<User | null> {
    const result = await query<{
      id: string;
      created_at: Date;
      updated_at: Date;
      status: string;
      timezone: string;
      language: string;
      consent_given: boolean;
      consent_timestamp: Date | null;
      display_name: string | null;
      email: string | null;
      phone_number: string | null;
    }>('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  async update(user: User): Promise<User> {
    const result = await query<{
      id: string;
      created_at: Date;
      updated_at: Date;
      status: string;
      timezone: string;
      language: string;
      consent_given: boolean;
      consent_timestamp: Date | null;
      display_name: string | null;
      email: string | null;
      phone_number: string | null;
    }>(
      `UPDATE users
       SET status = $2, timezone = $3, language = $4, consent_given = $5,
           consent_timestamp = $6, display_name = $7, email = $8, phone_number = $9,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        user.id,
        user.status,
        user.timezone,
        user.language,
        user.consentGiven,
        user.consentTimestamp ?? null,
        user.displayName ?? null,
        user.email ?? null,
        user.phoneNumber ?? null,
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  async updateStatus(id: string, status: UserStatus): Promise<void> {
    await query('UPDATE users SET status = $2, updated_at = NOW() WHERE id = $1', [
      id,
      status,
    ]);
  }

  async grantConsent(id: string): Promise<void> {
    await query(
      'UPDATE users SET consent_given = true, consent_timestamp = NOW(), updated_at = NOW() WHERE id = $1',
      [id]
    );
  }

  async exists(id: string): Promise<boolean> {
    const result = await query<{ exists: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM users WHERE id = $1) as exists',
      [id]
    );
    return result.rows[0]?.exists ?? false;
  }

  private mapRow(row: {
    id: string;
    created_at: Date;
    updated_at: Date;
    status: string;
    timezone: string;
    language: string;
    consent_given: boolean;
    consent_timestamp: Date | null;
    display_name: string | null;
    email: string | null;
    phone_number: string | null;
  }): User {
    return {
      id: row.id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      status: row.status as UserStatus,
      timezone: row.timezone,
      language: row.language,
      consentGiven: row.consent_given,
      consentTimestamp: row.consent_timestamp ?? undefined,
      displayName: row.display_name ?? undefined,
      email: row.email ?? undefined,
      phoneNumber: row.phone_number ?? undefined,
    };
  }
}
