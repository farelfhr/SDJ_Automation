/**
 * Get Recap Use Case
 *
 * Get daily recap of activities.
 */

import { ok, type Result } from '@sdj/domain';
import type { TrackerGateway, TrackerConnectionRepository } from '../ports/index.js';
import type { RecapResponse } from '@sdj/contracts';

export interface GetRecapInput {
  userId: string;
  date?: string; // ISO date string, defaults to today
}

export interface GetRecapOutput {
  readonly recap: RecapResponse;
}

/**
 * Get daily recap use case
 */
export class GetRecapUseCase {
  constructor(
    private readonly trackerConnectionRepository: TrackerConnectionRepository,
    private readonly trackerGateway: TrackerGateway
  ) {}

  async execute(input: GetRecapInput): Promise<Result<GetRecapOutput>> {
    const { userId, date: dateStr } = input;

    // Get tracker connection
    const connection = await this.trackerConnectionRepository.getActiveByUserId(userId);
    if (!connection) {
      return ok({
        recap: {
          date: dateStr ?? new Date().toISOString().split('T')[0],
          activities: [],
          totalScore: 0,
          maxScore: 15,
          summary: 'Tracker belum terhubung',
        },
      });
    }

    // Parse date
    const date = dateStr ? new Date(dateStr) : new Date();
    const prayers = ['subuh', 'zuhur', 'ashar', 'maghrib', 'isya'];
    const activities = [];
    let totalScore = 0;

    // Read each prayer score
    for (let i = 0; i < prayers.length; i++) {
      const score = await this.trackerGateway.readCell(
        connection.spreadsheetId,
        connection.sheetName,
        date.getDate() + 2,
        i + 2
      );

      activities.push({
        activityId: prayers[i],
        displayName: this.getPrayerDisplayName(prayers[i]),
        score: score ?? null,
        scoreLabel: score !== null ? this.getScoreLabel(score) : null,
      });

      if (score !== null) {
        totalScore += score;
      }
    }

    const summary = this.generateSummary(totalScore, activities.length);

    return ok({
      recap: {
        date: date.toISOString().split('T')[0],
        activities,
        totalScore,
        maxScore: 15,
        summary,
      },
    });
  }

  private getPrayerDisplayName(id: string): string {
    const names: Record<string, string> = {
      subuh: 'Sholat Subuh',
      zuhur: 'Sholat Zuhur',
      ashar: 'Sholat Ashar',
      maghrib: 'Sholat Maghrib',
      isya: 'Sholat Isya',
    };
    return names[id] ?? id;
  }

  private getScoreLabel(score: number): string {
    const labels: Record<number, string> = {
      0: 'tidak dilaksanakan',
      1: 'berjamaah',
      2: 'sendiri',
      3: 'tepat waktu + berjamaah',
    };
    return labels[score] ?? '';
  }

  private generateSummary(total: number, count: number): string {
    if (count === 0) return 'Belum ada data';
    if (total === 0) return 'Belum ada sholat yang dicatat';
    if (total >= 12) return 'Alhamdulillah, semangat! 💪';
    if (total >= 6) return 'Tetap semangat!';
    return 'Ayo tingkatkan!';
  }
}
