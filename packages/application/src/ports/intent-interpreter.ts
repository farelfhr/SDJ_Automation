/**
 * Intent Interpreter Port
 *
 * Interface for parsing and interpreting user intents.
 */

import type { CommandProposal, ParseResult } from '@sdj/domain';

/**
 * Intent interpreter interface
 */
export interface IntentInterpreter {
  /**
   * Parse raw text into a command proposal
   */
  parse(text: string): ParseResult;

  /**
   * Interpret using AI when simple parsing fails
   */
  interpretWithAI(text: string, userId: string): Promise<ParseResult>;

  /**
   * Check if text likely needs AI interpretation
   */
  needsAIInterpretation(text: string): boolean;
}

/**
 * Interpreter configuration
 */
export interface IntentInterpreterConfig {
  enableAI: boolean;
  fallbackToAI: boolean;
  minConfidenceForDirectUse: number;
}
