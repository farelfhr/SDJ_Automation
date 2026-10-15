/**
 * Activity Identifiers and Scoring
 *
 * Core domain values for spiritual activities and their scoring rules.
 */

// Activity Types
export const ACTIVITY_TYPES = ['prayer', 'tilawah', 'dhuha', 'tahajjud', 'shaum'] as const;
export type ActivityType = typeof ACTIVITY_TYPES[number];

// Prayer identifiers (Indonesian)
export const PRAYER_IDS = ['subuh', 'zuhur', 'ashar', 'maghrib', 'isya'] as const;
export type PrayerId = typeof PRAYER_IDS[number];

// Activity ID - combines type and specific identifier
export interface ActivityId {
  readonly type: ActivityType;
  readonly id: string;
  readonly displayName: string;
}

// Score values (0-3 for prayers, 0-N for others)
export const PRAYER_SCORE_VALUES = [0, 1, 2, 3] as const;
export type PrayerScore = typeof PRAYER_SCORE_VALUES[number];

export const SCORE_LABELS: Record<PrayerScore, string> = {
  0: 'tidak dilaksanakan',
  1: 'berjamaah',
  2: 'sendiri',
  3: 'berjamaah + tepat waktu',
} as const;

// Default activities for SDJ v1
export const DEFAULT_ACTIVITIES: ActivityId[] = [
  { type: 'prayer', id: 'subuh', displayName: 'Sholat Subuh' },
  { type: 'prayer', id: 'zuhur', displayName: 'Sholat Zuhur' },
  { type: 'prayer', id: 'ashar', displayName: 'Sholat Ashar' },
  { type: 'prayer', id: 'maghrib', displayName: 'Sholat Maghrib' },
  { type: 'prayer', id: 'isya', displayName: 'Sholat Isya' },
];

/**
 * Validate if a score is valid for a prayer
 */
export function isValidPrayerScore(score: number): score is PrayerScore {
  return PRAYER_SCORE_VALUES.includes(score as PrayerScore);
}

/**
 * Get prayer by ID
 */
export function getPrayerById(id: string): ActivityId | undefined {
  return DEFAULT_ACTIVITIES.find(a => a.id === id && a.type === 'prayer');
}

/**
 * Get all default prayers
 */
export function getAllPrayers(): ActivityId[] {
  return DEFAULT_ACTIVITIES.filter(a => a.type === 'prayer');
}

/**
 * Get activity display name
 */
export function getActivityDisplayName(type: ActivityType, id: string): string {
  const activity = DEFAULT_ACTIVITIES.find(a => a.type === type && a.id === id);
  return activity?.displayName ?? `${type}:${id}`;
}
