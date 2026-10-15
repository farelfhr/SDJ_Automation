/**
 * User Aggregate
 *
 * User entity with associated connections and preferences.
 */

// User status
export const USER_STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED', 'DELETED'] as const;
export type UserStatus = typeof USER_STATUSES[number];

// User entity
export interface User {
  readonly id: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly status: UserStatus;
  readonly timezone: string;
  readonly language: string;
  readonly consentGiven: boolean;
  readonly consentTimestamp?: Date;
  readonly displayName?: string;
  readonly email?: string;
  readonly phoneNumber?: string;
}

/**
 * Create a new user
 */
export function createUser(params: {
  id: string;
  timezone?: string;
  language?: string;
  displayName?: string;
  email?: string;
  phoneNumber?: string;
}): User {
  const now = new Date();
  return {
    id: params.id,
    createdAt: now,
    updatedAt: now,
    status: 'PENDING',
    timezone: params.timezone ?? 'Asia/Jakarta',
    language: params.language ?? 'id',
    consentGiven: false,
    displayName: params.displayName,
    email: params.email,
    phoneNumber: params.phoneNumber,
  };
}

/**
 * Activate user
 */
export function activateUser(user: User): User {
  return {
    ...user,
    status: 'ACTIVE',
    updatedAt: new Date(),
  };
}

/**
 * Suspend user
 */
export function suspendUser(user: User): User {
  return {
    ...user,
    status: 'SUSPENDED',
    updatedAt: new Date(),
  };
}

/**
 * Grant consent
 */
export function grantConsent(user: User): User {
  return {
    ...user,
    consentGiven: true,
    consentTimestamp: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Check if user is active
 */
export function isUserActive(user: User): boolean {
  return user.status === 'ACTIVE';
}

/**
 * Check if user has given consent
 */
export function hasUserConsented(user: User): boolean {
  return user.consentGiven;
}
