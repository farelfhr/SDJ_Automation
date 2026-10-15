/**
 * Base AI Adapter
 *
 * Abstract base class for AI provider adapters.
 */

import type { AIInterpretationResponse } from '@sdj/contracts';

export interface AIAdapterConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

export interface AIRequest {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AIResponse {
  content: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export abstract class BaseAIAdapter {
  abstract readonly provider: string;

  constructor(protected readonly config: AIAdapterConfig) {}

  abstract request(req: AIRequest): Promise<AIResponse>;

  async interpret(
    text: string,
    options?: { timeout?: number }
  ): Promise<AIInterpretationResponse> {
    const systemPrompt = this.getSystemPrompt();
    const userPrompt = this.getUserPrompt(text);

    const response = await this.request({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      model: this.config.model,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
    });

    return this.parseResponse(response.content);
  }

  protected getSystemPrompt(): string {
    return `Kamu adalah asisten SDJ (Spiritual Development Journey) yang membantu mencatat aktivitas spiritual via WhatsApp.

Analisis pesan pengguna dan ekstrak informasi berikut:
- action: SET_SCORE, QUERY, RECAP, UNDO, HELP, STATUS, atau UNKNOWN
- activity: { type: "prayer", id: "subuh|zuhur|ashar|maghrib|isya" } jika relevan
- score: angka 0-3 untuk sholat (0=tidak, 1=berjamaah, 2=sendiri, 3=tepat+waktu)
- date: { anchor: "today"|"yesterday"|"tomorrow"|"explicit", description: "deskripsi", explicitDate: "YYYY-MM-DD" }

BALAS HANYA DENGAN JSON TANPA MARKDOWN:
{"action": "...", "activity": {...}, "score": ..., "date": {...}, "confidence": 0.0-1.0, "reasoning": "..."}`;
  }

  protected getUserPrompt(text: string): string {
    return `Pesan: "${text}"`;
  }

  protected parseResponse(content: string): AIInterpretationResponse {
    try {
      // Try to extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          action: parsed.action ?? 'UNKNOWN',
          activity: parsed.activity,
          score: parsed.score,
          date: parsed.date,
          confidence: parsed.confidence ?? 0.5,
          reasoning: parsed.reasoning,
        };
      }
    } catch {
      // Fall through to default
    }

    return {
      action: 'UNKNOWN',
      confidence: 0,
      reasoning: 'Gagal parse response AI',
    };
  }
}
