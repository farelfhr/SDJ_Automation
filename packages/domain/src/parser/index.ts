/**
 * Command Parser
 *
 * Grammar-based parser for Indonesian command language.
 */

import {
  PRAYER_IDS,
  getPrayerById,
  isValidPrayerScore,
  type PrayerId,
  type PrayerScore,
} from '../activities.js';
import {
  resolveDate,
  createDefaultDateContext,
  type DateResolution,
} from '../dates.js';
import {
  createSetScoreCommand,
  createQueryCommand,
  createRecapCommand,
  createUndoCommand,
  createHelpCommand,
  createStatusCommand,
  createUnknownCommand,
  type CommandProposal,
} from '../commands.js';

/**
 * Parse result with confidence
 */
export interface ParseResult {
  readonly proposal: CommandProposal;
  readonly confidence: number;
  readonly parsedParts: {
    activity?: string;
    score?: number;
    date?: string;
  };
}

/**
 * Prayer name variations (Indonesian)
 */
const PRAYER_VARIATIONS: Record<string, PrayerId> = {
  'subuh': 'subuh',
  'shubuh': 'subuh',
  'shubuh': 'subuh',
  'pagi': 'subuh',
  'fajr': 'subuh',
  'dzuhur': 'zuhur',
  'zuhur': 'zuhur',
  'zhuhur': 'zuhur',
  'dhuha': 'zuhur',
  'dzhuhur': 'zuhur',
  'ashar': 'ashar',
  'asar': 'ashar',
  'maghrib': 'maghrib',
  'maghrib': 'maghrib',
  'isya': 'isya',
  'isya': 'isya',
  'isya\'': 'isya',
  'witir': 'isya',
  'witir': 'isya',
};

/**
 * Score keywords
 */
const SCORE_KEYWORDS: Record<PrayerScore, string[]> = {
  0: ['0', 'tidak', 'gak', 'ga', 'no', 'none', 'miss', 'lewat'],
  1: ['1', 'berjamaah', 'jamaah'],
  2: ['2', 'sendiri', 'solo'],
  3: ['3', 'tepat', 'cepat', 'on time', 'ontime', 'lancar'],
};

/**
 * Help keywords
 */
const HELP_KEYWORDS = ['bantuan', 'help', 'tolong', 'panduan', 'menu', 'usage', 'commands'];

/**
 * Status keywords
 */
const STATUS_KEYWORDS = ['status', 'koneksi', 'connected', 'link', 'akun'];

/**
 * Recap keywords
 */
const RECAP_KEYWORDS = ['rekap', 'ringkasan', 'summary', 'rangkuman', 'catatan hari'];

/**
 * Undo keywords
 */
const UNDO_KEYWORDS = ['batal', 'undo', 'cancel', 'hapus', 'delete', 'koreksi', 'revise'];

/**
 * Extract prayer from text
 */
function extractPrayer(text: string): PrayerId | null {
  const normalized = text.toLowerCase().trim();

  // Direct match
  if (PRAYER_IDS.includes(normalized as PrayerId)) {
    return normalized as PrayerId;
  }

  // Variation match
  for (const [variation, prayer] of Object.entries(PRAYER_VARIATIONS)) {
    if (normalized.includes(variation)) {
      return prayer;
    }
  }

  return null;
}

/**
 * Extract score from text
 */
function extractScore(text: string): PrayerScore | null {
  const normalized = text.toLowerCase().trim();

  // Direct number match
  const numMatch = normalized.match(/\b([0-3])\b/);
  if (numMatch) {
    const num = parseInt(numMatch[1] ?? '', 10);
    if (isValidPrayerScore(num)) {
      return num;
    }
  }

  // Keyword match
  for (const [score, keywords] of Object.entries(SCORE_KEYWORDS)) {
    for (const keyword of keywords) {
      if (normalized.includes(keyword)) {
        return parseInt(score, 10) as PrayerScore;
      }
    }
  }

  return null;
}

/**
 * Extract date from text
 */
function extractDate(text: string): DateResolution | null {
  const normalized = text.toLowerCase().trim();
  return resolveDate(normalized, createDefaultDateContext());
}

/**
 * Check if text is a help command
 */
function isHelpCommand(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  return HELP_KEYWORDS.some(k => normalized === k || normalized.includes(k));
}

/**
 * Check if text is a status command
 */
function isStatusCommand(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  return STATUS_KEYWORDS.some(k => normalized === k || normalized.includes(k));
}

/**
 * Check if text is a recap command
 */
function isRecapCommand(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  return RECAP_KEYWORDS.some(k => normalized === k || normalized.includes(k));
}

/**
 * Check if text is an undo command
 */
function isUndoCommand(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  return UNDO_KEYWORDS.some(k => normalized === k || normalized.includes(k));
}

/**
 * Main parser function
 */
export function parseCommand(text: string): ParseResult {
  const normalized = text.toLowerCase().trim();

  // Help command
  if (isHelpCommand(text)) {
    return {
      proposal: createHelpCommand(),
      confidence: 1.0,
      parsedParts: {},
    };
  }

  // Status command
  if (isStatusCommand(text)) {
    return {
      proposal: createStatusCommand(),
      confidence: 1.0,
      parsedParts: {},
    };
  }

  // Undo command
  if (isUndoCommand(text)) {
    return {
      proposal: createUndoCommand(text),
      confidence: 1.0,
      parsedParts: {},
    };
  }

  // Recap command
  if (isRecapCommand(text)) {
    const date = extractDate(text) ?? {
      date: new Date(),
      anchor: 'today' as const,
      precision: 'day' as const,
      description: 'hari ini',
    };
    return {
      proposal: createRecapCommand(date, text),
      confidence: 1.0,
      parsedParts: { date: date.description },
    };
  }

  // Extract components
  const prayer = extractPrayer(text);
  const score = extractScore(text);
  const date = extractDate(text);

  // Both prayer and score = SET_SCORE
  if (prayer && score !== null) {
    const activityId = getPrayerById(prayer);
    if (activityId) {
      const targetDate = date ?? {
        date: new Date(),
        anchor: 'today' as const,
        precision: 'day' as const,
        description: 'hari ini',
      };
      return {
        proposal: createSetScoreCommand(activityId, score, targetDate, text, 1.0),
        confidence: 1.0,
        parsedParts: {
          activity: prayer,
          score,
          date: targetDate.description,
        },
      };
    }
  }

  // Prayer only = QUERY
  if (prayer && score === null) {
    const activityId = getPrayerById(prayer);
    if (activityId) {
      const targetDate = date ?? {
        date: new Date(),
        anchor: 'today' as const,
        precision: 'day' as const,
        description: 'hari ini',
      };
      return {
        proposal: createQueryCommand(activityId, targetDate, text),
        confidence: 1.0,
        parsedParts: {
          activity: prayer,
          date: targetDate.description,
        },
      };
    }
  }

  // Couldn't parse - needs AI or unclear
  const confidence = prayer || score || date ? 0.5 : 0.0;
  const requiresAI = confidence < 1.0;

  return {
    proposal: createUnknownCommand(text, requiresAI, confidence),
    confidence,
    parsedParts: {
      activity: prayer ?? undefined,
      score: score ?? undefined,
      date: date?.description,
    },
  };
}

/**
 * Parse multiple commands from text (for combined commands)
 */
export function parseMultipleCommands(text: string): ParseResult[] {
  // Split by common separators
  const parts = text.split(/[,;]\s*|\s+dan\s+|\s+then\s+/i);
  return parts.map(part => parseCommand(part.trim())).filter(r => r.confidence > 0);
}

/**
 * Validate parsed command structure
 */
export function validateParsedCommand(result: ParseResult): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  switch (result.proposal.action) {
    case 'SET_SCORE':
      if (!result.proposal.activityId) {
        errors.push('Aktivitas tidak ditemukan');
      }
      if (result.proposal.score === undefined) {
        errors.push('Skor tidak ditemukan');
      }
      if (!result.proposal.date) {
        errors.push('Tanggal tidak ditemukan');
      }
      break;
    case 'QUERY':
      if (!result.proposal.activityId) {
        errors.push('Aktivitas tidak ditemukan');
      }
      break;
    case 'RECAP':
      if (!result.proposal.date) {
        errors.push('Tanggal tidak ditemukan');
      }
      break;
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
