/**
 * AI Schemas
 *
 * Zod schemas for AI interpretation and quota management.
 */

import { z } from 'zod';

// AI Provider enum
export const AIProviderSchema = z.enum(['groq', 'gemini', 'glm']);

// AI target configuration
export const AIProviderConfigSchema = z.object({
  id: z.string().uuid(),
  provider: AIProviderSchema,
  model: z.string(),
  isActive: z.boolean(),
  priority: z.number().int(),
  baseUrl: z.string().url(),
  apiKey: z.string(),
  maxTokens: z.number().int().default(1024),
  temperature: z.number().min(0).max(2).default(0.1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// AI interpretation request
export const AIInterpretationRequestSchema = z.object({
  messageId: z.string().uuid(),
  userId: z.string().uuid(),
  rawText: z.string().min(1).max(1000),
  context: z.object({
    recentCommands: z.array(z.string()).optional(),
    preferredLanguage: z.string().default('id'),
  }).optional(),
});

// AI interpretation response (what we expect from the model)
export const AIInterpretationResponseSchema = z.object({
  action: z.enum(['SET_SCORE', 'QUERY', 'RECAP', 'UNDO', 'HELP', 'STATUS', 'UNKNOWN']),
  activity: z.object({
    type: z.string(),
    id: z.string(),
    displayName: z.string().optional(),
  }).optional(),
  score: z.number().int().min(0).max(10).optional(),
  date: z.object({
    anchor: z.enum(['today', 'yesterday', 'tomorrow', 'explicit']),
    description: z.string(),
    explicitDate: z.string().optional(), // YYYY-MM-DD if anchor is explicit
  }).optional(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().optional(),
});

// AI quota bucket
export const QuotaBucketSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  maxTokens: z.number().int(),
  currentTokens: z.number().int(),
  refillRate: z.number().int(),
  lastRefillAt: z.string().datetime(),
});

// AI provider attempt log
export const ProviderAttemptSchema = z.object({
  id: z.string().uuid(),
  requestId: z.string().uuid(),
  provider: AIProviderSchema,
  model: z.string(),
  promptTokens: z.number().int(),
  completionTokens: z.number().int(),
  totalTokens: z.number().int(),
  latencyMs: z.number().int(),
  status: z.enum(['success', 'rate_limited', 'error', 'timeout']),
  errorMessage: z.string().optional(),
  createdAt: z.string().datetime(),
});

// Provider reservation (in-flight)
export const ProviderReservationSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  provider: AIProviderSchema,
  tokens: z.number().int(),
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});

// Type exports
export type AIProvider = z.infer<typeof AIProviderSchema>;
export type AIProviderConfig = z.infer<typeof AIProviderConfigSchema>;
export type AIInterpretationRequest = z.infer<typeof AIInterpretationRequestSchema>;
export type AIInterpretationResponse = z.infer<typeof AIInterpretationResponseSchema>;
export type QuotaBucket = z.infer<typeof QuotaBucketSchema>;
export type ProviderAttempt = z.infer<typeof ProviderAttemptSchema>;
export type ProviderReservation = z.infer<typeof ProviderReservationSchema>;
