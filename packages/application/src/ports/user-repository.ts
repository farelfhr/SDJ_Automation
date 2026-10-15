/**
 * User Repository Port
 *
 * Interface for user management.
 */

import type { User, UserStatus } from '@sdj/domain';

/**
 * User repository interface
 */
export interface UserRepository {
  /**
   * Create a new user
   */
  create(user: User): Promise<User>;

  /**
   * Get user by ID
   */
  getById(id: string): Promise<User | null>;

  /**
   * Get user by email
   */
  getByEmail(email: string): Promise<User | null>;

  /**
   * Update user
   */
  update(user: User): Promise<User>;

  /**
   * Update user status
   */
  updateStatus(id: string, status: UserStatus): Promise<void>;

  /**
   * Grant consent
   */
  grantConsent(id: string): Promise<void>;

  /**
   * Check if user exists
   */
  exists(id: string): Promise<boolean>;
}
