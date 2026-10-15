/**
 * Tracker Gateway Port
 *
 * Interface for reading and writing to the user's tracker (Google Sheets).
 */

import type { ActivityId, DateResolution } from '@sdj/domain';

/**
 * Cell value in the tracker
 */
export interface TrackerCell {
  readonly row: number;
  readonly column: number;
  readonly value: number | null;
}

/**
 * Day's activity scores
 */
export interface DayActivityScores {
  readonly date: DateResolution;
  readonly activities: ReadonlyArray<{
    readonly activityId: ActivityId;
    readonly score: number | null;
    readonly cell: TrackerCell;
  }>;
}

/**
 * Tracker connection info
 */
export interface TrackerInfo {
  readonly spreadsheetId: string;
  readonly spreadsheetName: string;
  readonly sheetName: string;
  readonly lastSyncAt: Date | null;
}

/**
 * Tracker gateway interface
 */
export interface TrackerGateway {
  /**
   * Read a cell value
   */
  readCell(spreadsheetId: string, sheetName: string, row: number, column: number): Promise<number | null>;

  /**
   * Write a cell value
   */
  writeCell(
    spreadsheetId: string,
    sheetName: string,
    row: number,
    column: number,
    value: number
  ): Promise<void>;

  /**
   * Read a day's activity scores
   */
  readDayActivities(
    spreadsheetId: string,
    sheetName: string,
    date: DateResolution,
    activityBindings: ReadonlyArray<ActivityBinding>
  ): Promise<DayActivityScores>;

  /**
   * Write a score to the tracker
   */
  writeScore(
    spreadsheetId: string,
    sheetName: string,
    activityBinding: ActivityBinding,
    date: DateResolution,
    score: number
  ): Promise<void>;

  /**
   * Validate tracker structure
   */
  validateTracker(spreadsheetId: string, sheetName: string): Promise<TrackerValidationResult>;

  /**
   * Get tracker info
   */
  getTrackerInfo(spreadsheetId: string): Promise<TrackerInfo>;
}

/**
 * Activity binding (row/column mapping)
 */
export interface ActivityBinding {
  readonly activityId: ActivityId;
  readonly rowOffset: number;
  readonly columnOffset: number;
}

/**
 * Tracker validation result
 */
export interface TrackerValidationResult {
  readonly valid: boolean;
  readonly errors: string[];
  readonly warnings: string[];
  readonly activityBindings: ActivityBinding[];
  readonly dateColumnIndex: number;
  readonly firstActivityRow: number;
}
