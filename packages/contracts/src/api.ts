/**
 * API Schemas
 *
 * Zod schemas for HTTP API endpoints.
 */

import { z } from 'zod';

/**
 * Common response wrappers
 */

// Success response
export const SuccessResponseSchema = z.object({
  success: z.literal(true),
  data: z.unknown(),
  timestamp: z.string().datetime(),
});

// Error response
export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
  timestamp: z.string().datetime(),
});

// API Response (union)
export const ApiResponseSchema = z.union([SuccessResponseSchema, ErrorResponseSchema]);

/**
 * Health check
 */

export const HealthCheckResponseSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  version: z.string(),
  uptime: z.number(),
  checks: z.record(z.string(), z.object({
    status: z.enum(['ok', 'error']),
    latencyMs: z.number().optional(),
    message: z.string().optional(),
  })),
});

/**
 * Onboarding
 */

export const OnboardingStartRequestSchema = z.object({
  phoneNumber: z.string(),
  displayName: z.string().optional(),
});

export const OnboardingStartResponseSchema = z.object({
  userId: z.string().uuid(),
  channelIdentityId: z.string().uuid(),
  nextStep: z.enum(['verify_phone', 'link_google_sheet', 'complete']),
});

/**
 * Message processing
 */

export const ProcessMessageRequestSchema = z.object({
  messageId: z.string(),
  channelType: z.enum(['whatsapp']),
  senderId: z.string(),
  senderName: z.string().optional(),
  content: z.string(),
  timestamp: z.string().datetime(),
});

export const ProcessMessageResponseSchema = z.object({
  messageId: z.string(),
  response: z.string(),
  action: z.string(),
  confidence: z.number(),
});

/**
 * Tracker operations
 */

export const GetRecapRequestSchema = z.object({
  userId: z.string().uuid(),
  date: z.string().optional(), // ISO date string, defaults to today
});

export const RecapResponseSchema = z.object({
  date: z.string(),
  activities: z.array(z.object({
    activityId: z.string(),
    displayName: z.string(),
    score: z.number().int().nullable(),
    scoreLabel: z.string().nullable(),
  })),
  totalScore: z.number(),
  maxScore: z.number(),
  summary: z.string(),
});

/**
 * Google OAuth
 */

export const GoogleOAuthStartRequestSchema = z.object({
  userId: z.string().uuid(),
});

export const GoogleOAuthStartResponseSchema = z.object({
  authUrl: z.string().url(),
  state: z.string(),
});

export const GoogleOAuthCallbackRequestSchema = z.object({
  code: z.string(),
  state: z.string(),
});

export const GoogleOAuthCallbackResponseSchema = z.object({
  success: z.boolean(),
  connectionId: z.string().uuid().optional(),
  error: z.string().optional(),
});

/**
 * Tracker connection
 */

export const LinkTrackerRequestSchema = z.object({
  userId: z.string().uuid(),
  spreadsheetId: z.string(),
  sheetName: z.string().optional(),
});

export const LinkTrackerResponseSchema = z.object({
  trackerConnectionId: z.string().uuid(),
  spreadsheetName: z.string(),
  validated: z.boolean(),
  activities: z.array(z.object({
    id: z.string(),
    displayName: z.string(),
    row: z.number().int(),
    column: z.number().int(),
  })),
});

/**
 * User profile
 */

export const GetProfileRequestSchema = z.object({
  userId: z.string().uuid(),
});

export const ProfileResponseSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().nullable(),
  timezone: z.string(),
  consentGiven: z.boolean(),
  googleConnected: z.boolean(),
  trackerConnected: z.boolean(),
  createdAt: z.string().datetime(),
});

/**
 * Type exports
 */

export type SuccessResponse = z.infer<typeof SuccessResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type ApiResponse = z.infer<typeof ApiResponseSchema>;
export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;
export type OnboardingStartRequest = z.infer<typeof OnboardingStartRequestSchema>;
export type OnboardingStartResponse = z.infer<typeof OnboardingStartResponseSchema>;
export type ProcessMessageRequest = z.infer<typeof ProcessMessageRequestSchema>;
export type ProcessMessageResponse = z.infer<typeof ProcessMessageResponseSchema>;
export type GetRecapRequest = z.infer<typeof GetRecapRequestSchema>;
export type RecapResponse = z.infer<typeof RecapResponseSchema>;
export type GoogleOAuthStartRequest = z.infer<typeof GoogleOAuthStartRequestSchema>;
export type GoogleOAuthStartResponse = z.infer<typeof GoogleOAuthStartResponseSchema>;
export type GoogleOAuthCallbackRequest = z.infer<typeof GoogleOAuthCallbackRequestSchema>;
export type GoogleOAuthCallbackResponse = z.infer<typeof GoogleOAuthCallbackResponseSchema>;
export type LinkTrackerRequest = z.infer<typeof LinkTrackerRequestSchema>;
export type LinkTrackerResponse = z.infer<typeof LinkTrackerResponseSchema>;
export type GetProfileRequest = z.infer<typeof GetProfileRequestSchema>;
export type ProfileResponse = z.infer<typeof ProfileResponseSchema>;
