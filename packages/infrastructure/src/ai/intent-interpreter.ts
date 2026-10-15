/**
 * Intent Interpreter Implementation
 */

import type { IntentInterpreter } from '@sdj/application';
import type { ParseResult, CommandProposal } from '@sdj/domain';
import { parseCommand } from '@sdj/domain';
import { AIRouter } from './router.js';

export class SimpleIntentInterpreter implements IntentInterpreter {
  private readonly aiRouter: AIRouter | null;
  private readonly enableAI: boolean;

  constructor(aiRouter: AIRouter | null, enableAI: boolean = true) {
    this.aiRouter = aiRouter;
    this.enableAI = enableAI;
  }

  parse(text: string): ParseResult {
    return parseCommand(text);
  }

  async interpretWithAI(text: string, userId: string): Promise<ParseResult> {
    if (!this.enableAI || !this.aiRouter) {
      return parseCommand(text);
    }

    try {
      const aiResponse = await this.aiRouter.interpret(text, {
        userId,
        messageId: crypto.randomUUID(),
      });

      // Convert AI response to ParseResult
      const proposal = this.convertAIResponse(aiResponse, text);
      return {
        proposal,
        confidence: aiResponse.confidence,
        parsedParts: {},
      };
    } catch (error) {
      console.error('AI interpretation failed:', error);
      return parseCommand(text);
    }
  }

  needsAIInterpretation(text: string): boolean {
    const result = parseCommand(text);
    return result.confidence < 1.0 || result.proposal.requiresAI;
  }

  private convertAIResponse(
    aiResponse: {
      action: string;
      activity?: { type: string; id: string; displayName?: string };
      score?: number;
      date?: { anchor: string; description: string; explicitDate?: string };
      confidence: number;
    },
    rawText: string
  ): CommandProposal {
    // Import command creators dynamically to avoid circular deps
    const { createSetScoreCommand, createQueryCommand, createRecapCommand, createUndoCommand, createHelpCommand, createStatusCommand, createUnknownCommand } = require('@sdj/domain');

    switch (aiResponse.action) {
      case 'SET_SCORE':
        if (aiResponse.activity && aiResponse.score !== undefined && aiResponse.date) {
          const activityId = {
            type: aiResponse.activity.type,
            id: aiResponse.activity.id,
            displayName: aiResponse.activity.displayName ?? aiResponse.activity.id,
          };
          const dateResolution = {
            date: aiResponse.date.explicitDate ? new Date(aiResponse.date.explicitDate) : new Date(),
            anchor: aiResponse.date.anchor as 'today' | 'yesterday' | 'tomorrow' | 'explicit',
            precision: 'day' as const,
            description: aiResponse.date.description,
          };
          return createSetScoreCommand(activityId, aiResponse.score, dateResolution, rawText, aiResponse.confidence);
        }
        break;

      case 'QUERY':
        if (aiResponse.activity && aiResponse.date) {
          const activityId = {
            type: aiResponse.activity.type,
            id: aiResponse.activity.id,
            displayName: aiResponse.activity.displayName ?? aiResponse.activity.id,
          };
          const dateResolution = {
            date: aiResponse.date.explicitDate ? new Date(aiResponse.date.explicitDate) : new Date(),
            anchor: aiResponse.date.anchor as 'today' | 'yesterday' | 'tomorrow' | 'explicit',
            precision: 'day' as const,
            description: aiResponse.date.description,
          };
          return createQueryCommand(activityId, dateResolution, rawText);
        }
        break;

      case 'RECAP':
        if (aiResponse.date) {
          const dateResolution = {
            date: aiResponse.date.explicitDate ? new Date(aiResponse.date.explicitDate) : new Date(),
            anchor: aiResponse.date.anchor as 'today' | 'yesterday' | 'tomorrow' | 'explicit',
            precision: 'day' as const,
            description: aiResponse.date.description,
          };
          return createRecapCommand(dateResolution, rawText);
        }
        return createRecapCommand({
          date: new Date(),
          anchor: 'today',
          precision: 'day',
          description: 'hari ini',
        }, rawText);

      case 'UNDO':
        return createUndoCommand(rawText);

      case 'HELP':
        return createHelpCommand();

      case 'STATUS':
        return createStatusCommand();
    }

    return createUnknownCommand(rawText, true, aiResponse.confidence);
  }
}
