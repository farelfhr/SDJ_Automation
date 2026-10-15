/**
 * Date resolution tests
 */

import { describe, it, expect } from 'vitest';
import { resolveDate, parseExplicitDate, toISODateString, daysBetween, formatDateShort } from '@sdj/domain';

describe('Date Resolution', () => {
  describe('resolveDate', () => {
    it('should resolve "hari ini"', () => {
      const result = resolveDate('hari ini');

      expect(result).not.toBeNull();
      expect(result?.anchor).toBe('today');
      expect(result?.description).toBe('hari ini');
    });

    it('should resolve "kemarin"', () => {
      const result = resolveDate('kemarin');

      expect(result).not.toBeNull();
      expect(result?.anchor).toBe('yesterday');
    });

    it('should resolve "besok"', () => {
      const result = resolveDate('besok');

      expect(result).not.toBeNull();
      expect(result?.anchor).toBe('tomorrow');
    });

    it('should resolve "kemarin 3 hari"', () => {
      const result = resolveDate('kemarin 3 hari');

      expect(result).not.toBeNull();
      expect(result?.description).toContain('3 hari');
    });

    it('should return null for unrecognized text', () => {
      const result = resolveDate('sebulan yang lalu');

      expect(result).toBeNull();
    });
  });

  describe('parseExplicitDate', () => {
    it('should parse ISO format', () => {
      const result = parseExplicitDate('2026-10-15');

      expect(result).not.toBeNull();
      expect(result?.anchor).toBe('explicit');
    });

    it('should parse Indonesian format', () => {
      const result = parseExplicitDate('15 Oktober 2026');

      expect(result).not.toBeNull();
      expect(result?.anchor).toBe('explicit');
    });

    it('should parse slash format', () => {
      const result = parseExplicitDate('15/10/2026');

      expect(result).not.toBeNull();
    });
  });

  describe('toISODateString', () => {
    it('should format date as ISO string', () => {
      const date = new Date('2026-10-15T00:00:00.000Z');
      const result = toISODateString(date);

      expect(result).toBe('2026-10-15');
    });
  });

  describe('daysBetween', () => {
    it('should calculate days between dates', () => {
      const date1 = new Date('2026-10-01');
      const date2 = new Date('2026-10-05');

      const result = daysBetween(date1, date2);

      expect(result).toBe(4);
    });

    it('should return negative for reversed dates', () => {
      const date1 = new Date('2026-10-05');
      const date2 = new Date('2026-10-01');

      const result = daysBetween(date1, date2);

      expect(result).toBe(-4);
    });
  });
});
