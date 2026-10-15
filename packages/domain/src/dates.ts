/**
 * Date Resolution
 *
 * Handles natural language date parsing for Indonesian language.
 */

export interface DateResolution {
  readonly date: Date;
  readonly anchor: 'today' | 'yesterday' | 'tomorrow' | 'explicit';
  readonly precision: 'day' | 'week' | 'month';
  readonly description: string;
}

export interface DateContext {
  readonly now: Date;
  readonly timezone: string;
}

/**
 * Indonesian day names
 */
const DAYS_INDONESIAN: Record<string, number> = {
  'senin': 1,
  'selasa': 2,
  'rabu': 3,
  'kamis': 4,
  'jumat': 5,
  'jumaat': 5,
  'sabtu': 6,
  'ahad': 0,
  'minggu': 0,
  'sunday': 0,
  'monday': 1,
  'tuesday': 2,
  'wednesday': 3,
  'thursday': 4,
  'friday': 5,
  'saturday': 6,
};

/**
 * Indonesian month names
 */
const MONTHS_INDONESIAN: Record<string, number> = {
  'januari': 0,
  'februari': 1,
  'maret': 2,
  'april': 3,
  'mei': 4,
  'juni': 5,
  'juli': 6,
  'agustus': 7,
  'september': 8,
  'oktober': 9,
  'november': 10,
  'desember': 11,
  'january': 0,
  'february': 1,
  'march': 2,
  'june': 5,
  'july': 6,
  'august': 7,
  'october': 9,
  'december': 11,
};

/**
 * Default date context using current time
 */
export function createDefaultDateContext(): DateContext {
  return {
    now: new Date(),
    timezone: 'Asia/Jakarta',
  };
}

/**
 * Reset time to midnight in local timezone
 */
function toMidnight(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Calculate days between two dates
 */
export function daysBetween(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((toMidnight(a).getTime() - toMidnight(b).getTime()) / msPerDay);
}

/**
 * Resolve relative date expressions
 */
export function resolveRelativeDate(
  text: string,
  context: DateContext = createDefaultDateContext()
): DateResolution | null {
  const normalized = text.toLowerCase().trim();
  const today = toMidnight(context.now);

  // Explicit keywords
  if (normalized === 'hari ini' || normalized === 'today' || normalized === 'sekarang') {
    return {
      date: today,
      anchor: 'today',
      precision: 'day',
      description: 'hari ini',
    };
  }

  if (normalized === 'kemarin' || normalized === 'yesterday') {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return {
      date: yesterday,
      anchor: 'yesterday',
      precision: 'day',
      description: 'kemarin',
    };
  }

  if (normalized === 'besok' || normalized === 'tomorrow') {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return {
      date: tomorrow,
      anchor: 'tomorrow',
      precision: 'day',
      description: 'besok',
    };
  }

  if (normalized === 'lusa' || normalized === 'day after tomorrow') {
    const lusa = new Date(today);
    lusa.setDate(lusa.getDate() + 2);
    return {
      date: lusa,
      anchor: 'explicit',
      precision: 'day',
      description: 'lusa',
    };
  }

  // Parse "kemarin X hari" or "X hari lalu"
  const daysAgoMatch = normalized.match(/kemarin\s+(\d+)\s*hari/i) ||
                        normalized.match(/(\d+)\s*hari\s+yang\s+lalu/i) ||
                        normalized.match(/(\d+)\s*days?\s+ago/i);
  if (daysAgoMatch) {
    const days = parseInt(daysAgoMatch[1] ?? '0', 10);
    const target = new Date(today);
    target.setDate(target.getDate() - days);
    return {
      date: target,
      anchor: 'explicit',
      precision: 'day',
      description: `${days} hari yang lalu`,
    };
  }

  // Parse "X hari lagi"
  const daysLaterMatch = normalized.match(/(\d+)\s*hari\s+lagi/i) ||
                          normalized.match(/in\s+(\d+)\s*days?/i);
  if (daysLaterMatch) {
    const days = parseInt(daysLaterMatch[1] ?? '0', 10);
    const target = new Date(today);
    target.setDate(target.getDate() + days);
    return {
      date: target,
      anchor: 'explicit',
      precision: 'day',
      description: `${days} hari lagi`,
    };
  }

  return null;
}

/**
 * Parse explicit date format: YYYY-MM-DD or DD/MM/YYYY
 */
export function parseExplicitDate(text: string): DateResolution | null {
  const normalized = text.toLowerCase().trim();

  // ISO format: 2026-10-15
  const isoMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(date.getTime())) {
      return {
        date: toMidnight(date),
        anchor: 'explicit',
        precision: 'day',
        description: date.toLocaleDateString('id-ID', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
      };
    }
  }

  // Indonesian format: 15 Oktober 2026 or 15/10/2026
  const indonesianMatch = normalized.match(/^(\d{1,2})\s+(\w+)\s+(\d{4})$/);
  if (indonesianMatch) {
    const [, day, monthStr, year] = indonesianMatch;
    const monthNum = MONTHS_INDONESIAN[monthStr.toLowerCase()];
    if (monthNum !== undefined) {
      const date = new Date(parseInt(year), monthNum, parseInt(day));
      if (!isNaN(date.getTime())) {
        return {
          date: toMidnight(date),
          anchor: 'explicit',
          precision: 'day',
          description: date.toLocaleDateString('id-ID', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
        };
      }
    }
  }

  // Slash format: 15/10/2026 or 15-10-2026
  const slashMatch = normalized.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    // Assume DD/MM/YYYY
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(date.getTime())) {
      return {
        date: toMidnight(date),
        anchor: 'explicit',
        precision: 'day',
        description: date.toLocaleDateString('id-ID', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
      };
    }
  }

  return null;
}

/**
 * Main date resolver function
 */
export function resolveDate(
  text: string,
  context: DateContext = createDefaultDateContext()
): DateResolution | null {
  // Try relative first
  const relative = resolveRelativeDate(text, context);
  if (relative) return relative;

  // Try explicit
  const explicit = parseExplicitDate(text);
  if (explicit) return explicit;

  return null;
}

/**
 * Format date for display
 */
export function formatDateId(date: Date): string {
  return date.toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format date short
 */
export function formatDateShort(date: Date): string {
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Get ISO date string (YYYY-MM-DD)
 */
export function toISODateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
