/**
 * AI Router
 *
 * Routes AI requests with fallback support.
 */

import type { AIGateway, AIRequestOptions } from '@sdj/application';
import type { AIInterpretationResponse } from '@sdj/contracts';
import { BaseAIAdapter, type AIAdapterConfig } from './base-adapter.js';
import { GroqAdapter } from './groq-adapter.js';
import { GeminiAdapter } from './gemini-adapter.js';
import { GLMAdapter } from './glm-adapter.js';

export interface AIConfig {
  groq: AIAdapterConfig;
  gemini: AIAdapterConfig & { apiKey: string };
  glm: AIAdapterConfig & { apiKey: string };
  enableAI: boolean;
}

export class AIRouter implements AIGateway {
  private adapters: BaseAIAdapter[];
  private currentIndex = 0;

  constructor(config: AIConfig) {
    this.adapters = [];

    // Add Groq adapter
    if (config.groq.apiKey) {
      this.adapters.push(new GroqAdapter(config.groq));
    }

    // Add Gemini adapter
    if (config.gemini.apiKey) {
      this.adapters.push(new GeminiAdapter(config.gemini));
    }

    // Add GLM adapter
    if (config.glm.apiKey) {
      this.adapters.push(new GLMAdapter(config.glm));
    }
  }

  async interpret(
    text: string,
    options: AIRequestOptions
  ): Promise<AIInterpretationResponse> {
    if (this.adapters.length === 0) {
      return {
        action: 'UNKNOWN',
        confidence: 0,
        reasoning: 'Tidak ada AI provider tersedia',
      };
    }

    let lastError: Error | null = null;

    // Try each adapter in rotation
    for (let i = 0; i < this.adapters.length; i++) {
      const index = (this.currentIndex + i) % this.adapters.length;
      const adapter = this.adapters[index];

      try {
        const result = await adapter.interpret(text);
        this.currentIndex = (index + 1) % this.adapters.length;
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`AI adapter ${adapter.provider} failed:`, lastError.message);
      }
    }

    // All adapters failed
    return {
      action: 'UNKNOWN',
      confidence: 0,
      reasoning: `Semua AI provider gagal: ${lastError?.message ?? 'Unknown error'}`,
    };
  }

  async isAvailable(): Promise<boolean> {
    return this.adapters.length > 0;
  }

  async getRemainingQuota(userId: string): Promise<{ perMinute: number; perDay: number }> {
    // TODO: Implement quota tracking
    return {
      perMinute: 5,
      perDay: 50,
    };
  }

  async reserveQuota(userId: string, tokens: number): Promise<boolean> {
    // TODO: Implement quota reservation
    return true;
  }

  async releaseQuota(userId: string, tokens: number): Promise<void> {
    // TODO: Implement quota release
  }
}
