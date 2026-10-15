/**
 * Gemini Adapter
 *
 * AI adapter for Google Gemini API.
 */

import { BaseAIAdapter, type AIAdapterConfig, type AIRequest, type AIResponse } from './base-adapter.js';

export interface GeminiConfig extends AIAdapterConfig {
  apiKey: string;
}

export class GeminiAdapter extends BaseAIAdapter {
  readonly provider = 'gemini' as const;

  constructor(config: GeminiConfig) {
    super(config);
  }

  async request(req: AIRequest): Promise<AIResponse> {
    const contents = req.messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const systemInstruction = req.messages.find(m => m.role === 'system')?.content ?? '';

    const response = await fetch(
      `${this.config.baseUrl}/models/${this.config.model}:generateContent?key=${this.config.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents,
          systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
          generationConfig: {
            maxOutputTokens: req.maxTokens ?? this.config.maxTokens,
            temperature: req.temperature ?? this.config.temperature,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }

    const data = await response.json() as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
        finishReason?: string;
      }>;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    };

    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text ?? '';

    return {
      content: text,
      model: this.config.model,
      promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
      completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      totalTokens: data.usageMetadata?.totalTokenCount ?? 0,
    };
  }

  protected getSystemPrompt(): string {
    return `Kamu adalah asisten SDJ (Spiritual Development Journey) yang membantu mencatat aktivitas spiritual via WhatsApp.

Analisis pesan pengguna dan ekstrak informasi berikut dalam format JSON:
- action: SET_SCORE, QUERY, RECAP, UNDO, HELP, STATUS, atau UNKNOWN
- activity: { type: "prayer", id: "subuh|zuhur|ashar|maghrib|isya" } jika relevan
- score: angka 0-3 untuk sholat (0=tidak, 1=berjamaah, 2=sendiri, 3=tepat+waktu)
- date: { anchor: "today"|"yesterday"|"tomorrow"|"explicit", description: "deskripsi", explicitDate: "YYYY-MM-DD" }
- confidence: nilai 0.0-1.0
- reasoning: penjelasan singkat

BALAS HANYA DENGAN JSON TANPA MARKDOWN.`;
  }
}
