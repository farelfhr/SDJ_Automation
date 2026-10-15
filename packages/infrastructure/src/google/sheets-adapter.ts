/**
 * Google Sheets Adapter
 *
 * Adapter for reading and writing to Google Sheets.
 */

import type { TrackerGateway, TrackerCell, DayActivityScores, TrackerValidationResult, ActivityBinding } from '@sdj/application';
import type { ActivityId, DateResolution } from '@sdj/domain';

export class GoogleSheetsAdapter implements TrackerGateway {
  private readonly accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  async readCell(
    spreadsheetId: string,
    sheetName: string,
    row: number,
    column: number
  ): Promise<number | null> {
    // In production, this would call Google Sheets API
    // For now, return null (no data)
    return null;
  }

  async writeCell(
    spreadsheetId: string,
    sheetName: string,
    row: number,
    column: number,
    value: number
  ): Promise<void> {
    // In production, this would call Google Sheets API
    console.log('Writing to Google Sheets:', {
      spreadsheetId,
      sheetName,
      row,
      column,
      value,
    });
  }

  async readDayActivities(
    spreadsheetId: string,
    sheetName: string,
    date: DateResolution,
    activityBindings: ReadonlyArray<ActivityBinding>
  ): Promise<DayActivityScores> {
    const activities = await Promise.all(
      activityBindings.map(async binding => {
        const score = await this.readCell(
          spreadsheetId,
          sheetName,
          date.date.getDate() + 2,
          binding.columnOffset + 2
        );
        return {
          activityId: binding.activityId,
          score,
          cell: {
            row: date.date.getDate() + 2,
            column: binding.columnOffset + 2,
            value: score,
          },
        };
      })
    );

    return {
      date,
      activities,
    };
  }

  async writeScore(
    spreadsheetId: string,
    sheetName: string,
    activityBinding: ActivityBinding,
    date: DateResolution,
    score: number
  ): Promise<void> {
    await this.writeCell(
      spreadsheetId,
      sheetName,
      date.date.getDate() + 2,
      activityBinding.columnOffset + 2,
      score
    );
  }

  async validateTracker(
    spreadsheetId: string,
    sheetName: string
  ): Promise<TrackerValidationResult> {
    // In production, this would validate the tracker structure
    return {
      valid: true,
      errors: [],
      warnings: [],
      activityBindings: [
        { activityId: { type: 'prayer', id: 'subuh', displayName: 'Subuh' }, rowOffset: 0, columnOffset: 0 },
        { activityId: { type: 'prayer', id: 'zuhur', displayName: 'Zuhur' }, rowOffset: 0, columnOffset: 1 },
        { activityId: { type: 'prayer', id: 'ashar', displayName: 'Ashar' }, rowOffset: 0, columnOffset: 2 },
        { activityId: { type: 'prayer', id: 'maghrib', displayName: 'Maghrib' }, rowOffset: 0, columnOffset: 3 },
        { activityId: { type: 'prayer', id: 'isya', displayName: 'Isya' }, rowOffset: 0, columnOffset: 4 },
      ],
      dateColumnIndex: 1,
      firstActivityRow: 2,
    };
  }

  async getTrackerInfo(spreadsheetId: string): Promise<{
    spreadsheetId: string;
    spreadsheetName: string;
    sheetName: string;
    lastSyncAt: Date | null;
  }> {
    return {
      spreadsheetId,
      spreadsheetName: 'SDJ Tracker',
      sheetName: 'Sheet1',
      lastSyncAt: null,
    };
  }
}

/**
 * Fake Tracker Gateway for testing
 */
export class FakeTrackerGateway implements TrackerGateway {
  private data: Map<string, number> = new Map();

  async readCell(
    spreadsheetId: string,
    sheetName: string,
    row: number,
    column: number
  ): Promise<number | null> {
    const key = `${spreadsheetId}:${sheetName}:${row}:${column}`;
    return this.data.get(key) ?? null;
  }

  async writeCell(
    spreadsheetId: string,
    sheetName: string,
    row: number,
    column: number,
    value: number
  ): Promise<void> {
    const key = `${spreadsheetId}:${sheetName}:${row}:${column}`;
    this.data.set(key, value);
  }

  async readDayActivities(
    spreadsheetId: string,
    sheetName: string,
    date: DateResolution,
    activityBindings: ReadonlyArray<ActivityBinding>
  ): Promise<DayActivityScores> {
    const activities = await Promise.all(
      activityBindings.map(async binding => {
        const score = await this.readCell(
          spreadsheetId,
          sheetName,
          date.date.getDate() + 2,
          binding.columnOffset + 2
        );
        return {
          activityId: binding.activityId,
          score,
          cell: {
            row: date.date.getDate() + 2,
            column: binding.columnOffset + 2,
            value: score,
          },
        };
      })
    );

    return { date, activities };
  }

  async writeScore(
    spreadsheetId: string,
    sheetName: string,
    activityBinding: ActivityBinding,
    date: DateResolution,
    score: number
  ): Promise<void> {
    await this.writeCell(
      spreadsheetId,
      sheetName,
      date.date.getDate() + 2,
      activityBinding.columnOffset + 2,
      score
    );
  }

  async validateTracker(
    spreadsheetId: string,
    sheetName: string
  ): Promise<TrackerValidationResult> {
    return {
      valid: true,
      errors: [],
      warnings: [],
      activityBindings: [
        { activityId: { type: 'prayer', id: 'subuh', displayName: 'Subuh' }, rowOffset: 0, columnOffset: 0 },
        { activityId: { type: 'prayer', id: 'zuhur', displayName: 'Zuhur' }, rowOffset: 0, columnOffset: 1 },
        { activityId: { type: 'prayer', id: 'ashar', displayName: 'Ashar' }, rowOffset: 0, columnOffset: 2 },
        { activityId: { type: 'prayer', id: 'maghrib', displayName: 'Maghrib' }, rowOffset: 0, columnOffset: 3 },
        { activityId: { type: 'prayer', id: 'isya', displayName: 'Isya' }, rowOffset: 0, columnOffset: 4 },
      ],
      dateColumnIndex: 1,
      firstActivityRow: 2,
    };
  }

  async getTrackerInfo(spreadsheetId: string): Promise<{
    spreadsheetId: string;
    spreadsheetName: string;
    sheetName: string;
    lastSyncAt: Date | null;
  }> {
    return {
      spreadsheetId,
      spreadsheetName: 'Test Tracker',
      sheetName: 'Sheet1',
      lastSyncAt: new Date(),
    };
  }

  clear(): void {
    this.data.clear();
  }
}
