/**
 * GLM Adapter
 *
 * AI adapter for Zhipu GLM-4 API.
 */

import { BaseAIAdapter, type AIAdapterConfig, type AIRequest, type AIResponse } from './base-adapter.js';

export interface GLMConfig extends AIAdapterConfig {
  apiKey: string;
}

export class GLMAdapter extends BaseAIAdapter {
  readonly provider = 'glm' as const;

  constructor(config: GLMConfig) {
    super(config);
  }

  async request(req: AIRequest): Promise<AIResponse> {
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: req.model ?? this.config.model,
        messages: req.messages.map(m => ({
          role: m.role === 'system' ? 'system' : m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        })),
        max_tokens: req.maxTokens ?? this.config.maxTokens,
        temperature: req.temperature ?? this.config.temperature,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GLM API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
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
      throw new Error('No response choices from GLM');
    }

    return {
      content: choice.message.content,
      model: req.model ?? this.config.model,
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
      totalTokens: data.usage.total_tokens,
    };
  }
}
