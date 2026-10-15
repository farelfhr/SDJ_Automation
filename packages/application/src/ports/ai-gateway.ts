/**
 * AI Gateway Port
 *
 * Interface for AI interpretation services.
 */

import type { AIInterpretationResponse } from '@sdj/contracts';

/**
 * AI request options
 */
export interface AIRequestOptions {
  readonly userId: string;
  readonly messageId: string;
  readonly timeout?: number;
  readonly model?: string;
}

/**
 * AI gateway interface
 */
export interface AIGateway {
  /**
   * Interpret a message using AI
   */
  interpret(
    text: string,
    options: AIRequestOptions
  ): Promise<AIInterpretationResponse>;

  /**
   * Check if AI is available
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get remaining quota for user
   */
  getRemainingQuota(userId: string): Promise<{
    perMinute: number;
    perDay: number;
  }>;

  /**
   * Reserve quota for request
   */
  reserveQuota(userId: string, tokens: number): Promise<boolean>;

  /**
   * Release reserved quota
   */
  releaseQuota(userId: string, tokens: number): Promise<void>;
}
