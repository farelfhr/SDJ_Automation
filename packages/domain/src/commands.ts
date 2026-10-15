/**
 * Command Types
 *
 * Defines the command proposal structure after parsing.
 */

import type { ActivityId, PrayerScore } from './activities.js';
import type { DateResolution } from './dates.js';

// Command action types
export const COMMAND_ACTIONS = [
  'SET_SCORE',
  'QUERY',
  'RECAP',
  'UNDO',
  'HELP',
  'STATUS',
  'UNKNOWN',
] as const;
export type CommandAction = typeof COMMAND_ACTIONS[number];

// Command proposal - parsed intent
export interface CommandProposal {
  readonly action: CommandAction;
  readonly activityId?: ActivityId;
  readonly score?: PrayerScore;
  readonly date?: DateResolution;
  readonly rawText: string;
  readonly confidence: number;
  readonly requiresAI: boolean;
}

/**
 * Create a SET_SCORE command proposal
 */
export function createSetScoreCommand(
  activityId: ActivityId,
  score: PrayerScore,
  date: DateResolution,
  rawText: string,
  confidence: number = 1.0
): CommandProposal {
  return {
    action: 'SET_SCORE',
    activityId,
    score,
    date,
    rawText,
    confidence,
    requiresAI: false,
  };
}

/**
 * Create a QUERY command proposal
 */
export function createQueryCommand(
  activityId: ActivityId,
  date: DateResolution,
  rawText: string
): CommandProposal {
  return {
    action: 'QUERY',
    activityId,
    date,
    rawText,
    confidence: 1.0,
    requiresAI: false,
  };
}

/**
 * Create a RECAP command proposal
 */
export function createRecapCommand(
  date: DateResolution,
  rawText: string
): CommandProposal {
  return {
    action: 'RECAP',
    date,
    rawText,
    confidence: 1.0,
    requiresAI: false,
  };
}

/**
 * Create an UNDO command proposal
 */
export function createUndoCommand(rawText: string): CommandProposal {
  return {
    action: 'UNDO',
    rawText,
    confidence: 1.0,
    requiresAI: false,
  };
}

/**
 * Create a HELP command proposal
 */
export function createHelpCommand(): CommandProposal {
  return {
    action: 'HELP',
    rawText: 'bantuan',
    confidence: 1.0,
    requiresAI: false,
  };
}

/**
 * Create a STATUS command proposal
 */
export function createStatusCommand(): CommandProposal {
  return {
    action: 'STATUS',
    rawText: 'status',
    confidence: 1.0,
    requiresAI: false,
  };
}

/**
 * Create an UNKNOWN command proposal
 */
export function createUnknownCommand(
  rawText: string,
  requiresAI: boolean = false,
  confidence: number = 0.0
): CommandProposal {
  return {
    action: 'UNKNOWN',
    rawText,
    confidence,
    requiresAI,
  };
}

/**
 * Check if command is valid for processing
 */
export function isValidCommand(proposal: CommandProposal): boolean {
  switch (proposal.action) {
    case 'SET_SCORE':
      return (
        proposal.activityId !== undefined &&
        proposal.score !== undefined &&
        proposal.date !== undefined
      );
    case 'QUERY':
      return proposal.activityId !== undefined && proposal.date !== undefined;
    case 'RECAP':
      return proposal.date !== undefined;
    case 'UNDO':
    case 'HELP':
    case 'STATUS':
      return true;
    default:
      return false;
  }
}

/**
 * Get command action display name
 */
export function getActionDisplayName(action: CommandAction): string {
  const names: Record<CommandAction, string> = {
    SET_SCORE: 'Mencatat Skor',
    QUERY: 'Melihat Skor',
    RECAP: 'Ringkasan Harian',
    UNDO: 'Batalkan',
    HELP: 'Bantuan',
    STATUS: 'Status',
    UNKNOWN: 'Tidak Dikenal',
  };
  return names[action];
}
