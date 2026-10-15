/**
 * Parser tests
 */

import { describe, it, expect } from 'vitest';
import { parseCommand, parseMultipleCommands, validateParsedCommand } from '@sdj/domain';

describe('Command Parser', () => {
  describe('parseCommand', () => {
    it('should parse simple prayer score command', () => {
      const result = parseCommand('subuh 3');

      expect(result.proposal.action).toBe('SET_SCORE');
      expect(result.proposal.activityId?.id).toBe('subuh');
      expect(result.proposal.score).toBe(3);
      expect(result.confidence).toBe(1.0);
    });

    it('should parse prayer with comma', () => {
      const result = parseCommand('zuhur, 2');

      expect(result.proposal.action).toBe('SET_SCORE');
      expect(result.proposal.activityId?.id).toBe('zuhur');
      expect(result.proposal.score).toBe(2);
    });

    it('should parse yesterday command', () => {
      const result = parseCommand('ashar kemarin 1');

      expect(result.proposal.action).toBe('SET_SCORE');
      expect(result.proposal.activityId?.id).toBe('ashar');
      expect(result.proposal.score).toBe(1);
      expect(result.proposal.date?.anchor).toBe('yesterday');
    });

    it('should parse explicit date', () => {
      const result = parseCommand('maghrib 2026-10-15 3');

      expect(result.proposal.action).toBe('SET_SCORE');
      expect(result.proposal.date?.anchor).toBe('explicit');
    });

    it('should parse help command', () => {
      const result = parseCommand('bantuan');

      expect(result.proposal.action).toBe('HELP');
      expect(result.confidence).toBe(1.0);
    });

    it('should parse status command', () => {
      const result = parseCommand('status');

      expect(result.proposal.action).toBe('STATUS');
    });

    it('should parse recap command', () => {
      const result = parseCommand('rekap hari ini');

      expect(result.proposal.action).toBe('RECAP');
    });

    it('should parse undo command', () => {
      const result = parseCommand('batal');

      expect(result.proposal.action).toBe('UNDO');
    });

    it('should parse query command (prayer only)', () => {
      const result = parseCommand('isya');

      expect(result.proposal.action).toBe('QUERY');
      expect(result.proposal.activityId?.id).toBe('isya');
    });
  });

  describe('parseMultipleCommands', () => {
    it('should parse comma-separated commands', () => {
      const results = parseMultipleCommands('subuh 3, zuhur 2');

      expect(results.length).toBe(2);
      expect(results[0].proposal.activityId?.id).toBe('subuh');
      expect(results[1].proposal.activityId?.id).toBe('zuhur');
    });
  });

  describe('validateParsedCommand', () => {
    it('should validate SET_SCORE command', () => {
      const result = parseCommand('subuh 3');
      const validation = validateParsedCommand(result);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should invalidate incomplete command', () => {
      const result = parseCommand('subuh');
      const validation = validateParsedCommand(result);

      expect(validation.valid).toBe(true); // Query is valid
      expect(result.proposal.action).toBe('QUERY');
    });
  });
});
