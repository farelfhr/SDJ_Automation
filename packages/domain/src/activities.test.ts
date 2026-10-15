/**
 * Activity tests
 */

import { describe, it, expect } from 'vitest';
import { getPrayerById, isValidPrayerScore, getAllPrayers, getActivityDisplayName } from '@sdj/domain';

describe('Activities', () => {
  describe('getPrayerById', () => {
    it('should return prayer by id', () => {
      const prayer = getPrayerById('subuh');

      expect(prayer).not.toBeUndefined();
      expect(prayer?.type).toBe('prayer');
      expect(prayer?.id).toBe('subuh');
    });

    it('should return undefined for invalid id', () => {
      const prayer = getPrayerById('invalid');

      expect(prayer).toBeUndefined();
    });
  });

  describe('isValidPrayerScore', () => {
    it('should return true for valid scores', () => {
      expect(isValidPrayerScore(0)).toBe(true);
      expect(isValidPrayerScore(1)).toBe(true);
      expect(isValidPrayerScore(2)).toBe(true);
      expect(isValidPrayerScore(3)).toBe(true);
    });

    it('should return false for invalid scores', () => {
      expect(isValidPrayerScore(-1)).toBe(false);
      expect(isValidPrayerScore(4)).toBe(false);
      expect(isValidPrayerScore(1.5)).toBe(false);
    });
  });

  describe('getAllPrayers', () => {
    it('should return all 5 prayers', () => {
      const prayers = getAllPrayers();

      expect(prayers).toHaveLength(5);
      expect(prayers.map(p => p.id)).toEqual(['subuh', 'zuhur', 'ashar', 'maghrib', 'isya']);
    });
  });

  describe('getActivityDisplayName', () => {
    it('should return display name for known activity', () => {
      const name = getActivityDisplayName('prayer', 'subuh');

      expect(name).toBe('Sholat Subuh');
    });
  });
});
