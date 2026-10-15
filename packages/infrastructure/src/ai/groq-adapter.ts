/**
 * Groq Adapter
 *
 * AI adapter for Groq API (Llama models).
 */

import { BaseAIAdapter, type AIAdapterConfig, type AIRequest, type AIResponse } from './base-adapter.js';

export interface GroqConfig extends AIAdapterConfig {}

export class GroqAdapter extends BaseAIAdapter {
  readonly provider = 'groq' as const;

  constructor(config: GroqConfig) {
    super(config);
  }

  async request(req: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: req.model ?? this.config.model,
        messages: req.messages,
        max_tokens: req.maxTokens ?? this.config.maxTokens,
        temperature: req.temperature ?? this.config.temperature,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Groq API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      id: string;
      model: string;
      choices: Array<{
        message: { content: string };
        finish_reason: string;
      }>;
      usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
    };

    const choice = data.choices[0];
    if (!choice) {
      throw new Error('No response choices from Groq');
    }

    return {
      content: choice.message.content,
      model: data.model,
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
      totalTokens: data.usage.total_tokens,
    };
  }
}
