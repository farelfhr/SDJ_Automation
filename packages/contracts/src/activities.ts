/**
 * Activity Schemas
 *
 * Zod schemas for activity-related data.
 */

import { z } from 'zod';

// Activity type enum
export const ActivityTypeSchema = z.enum(['prayer', 'tilawah', 'dhuha', 'tahajjud', 'shaum']);

// Prayer ID enum
export const PrayerIdSchema = z.enum(['subuh', 'zuhur', 'ashar', 'maghrib', 'isya']);

// Activity ID
export const ActivityIdSchema = z.object({
  type: ActivityTypeSchema,
  id: z.string(),
  displayName: z.string(),
});

// Prayer score (0-3)
export const PrayerScoreSchema = z.number().int().min(0).max(3);

// Score labels
export const ScoreLabelsSchema = z.record(z.enum(['0', '1', '2', '3']), z.string());

// Activity binding (row/column mapping)
export const ActivityBindingSchema = z.object({
  activityId: z.string(),
  rowOffset: z.number().int(),
  columnOffset: z.number().int(),
});

// Activity definition
export const ActivityDefinitionSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: ActivityTypeSchema,
  description: z.string().optional(),
  isActive: z.boolean(),
  scoringMin: z.number().int().optional(),
  scoringMax: z.number().int().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// Type exports
export type ActivityType = z.infer<typeof ActivityTypeSchema>;
export type PrayerId = z.infer<typeof PrayerIdSchema>;
export type ActivityId = z.infer<typeof ActivityIdSchema>;
export type PrayerScore = z.infer<typeof PrayerScoreSchema>;
export type ScoreLabels = z.infer<typeof ScoreLabelsSchema>;
export type ActivityBinding = z.infer<typeof ActivityBindingSchema>;
export type ActivityDefinition = z.infer<typeof ActivityDefinitionSchema>;
