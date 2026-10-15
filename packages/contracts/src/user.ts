/**
 * User Schemas
 *
 * Zod schemas for user-related data.
 */

import { z } from 'zod';

// User status enum
export const UserStatusSchema = z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'DELETED']);

// User create input
export const UserCreateInputSchema = z.object({
  timezone: z.string().default('Asia/Jakarta'),
  language: z.string().default('id'),
  displayName: z.string().optional(),
  email: z.string().email().optional(),
  phoneNumber: z.string().optional(),
});

// User update input
export const UserUpdateInputSchema = z.object({
  timezone: z.string().optional(),
  language: z.string().optional(),
  displayName: z.string().optional(),
  email: z.string().email().optional(),
});

// User response
export const UserResponseSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  status: UserStatusSchema,
  timezone: z.string(),
  language: z.string(),
  consentGiven: z.boolean(),
  consentTimestamp: z.string().datetime().nullable(),
  displayName: z.string().nullable(),
  email: z.string().nullable(),
  phoneNumber: z.string().nullable(),
});

// Type exports
export type UserStatus = z.infer<typeof UserStatusSchema>;
export type UserCreateInput = z.infer<typeof UserCreateInputSchema>;
export type UserUpdateInput = z.infer<typeof UserUpdateInputSchema>;
export type UserResponse = z.infer<typeof UserResponseSchema>;
