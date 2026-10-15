/**
 * AI Router tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIRouter } from '@sdj/infrastructure';

describe('AI Router', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should be available when adapters configured', async () => {
    const router = new AIRouter({
      groq: {
        apiKey: 'test-key',
        baseUrl: 'https://api.groq.com/openai/v1',
        model: 'llama-3.3-70b-versatile',
        maxTokens: 1024,
        temperature: 0.1,
      },
      gemini: {
        apiKey: 'test-key',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        model: 'gemini-2.0-flash',
        maxTokens: 1024,
        temperature: 0.1,
      },
      glm: {
        apiKey: 'test-key',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        model: 'glm-4-flash',
        maxTokens: 1024,
        temperature: 0.1,
      },
      enableAI: true,
    });

    const available = await router.isAvailable();
    expect(available).toBe(true);
  });

  it('should not be available when no adapters configured', async () => {
    const router = new AIRouter({
      groq: {
        apiKey: '',
        baseUrl: 'https://api.groq.com/openai/v1',
        model: 'llama-3.3-70b-versatile',
        maxTokens: 1024,
        temperature: 0.1,
      },
      gemini: {
        apiKey: '',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        model: 'gemini-2.0-flash',
        maxTokens: 1024,
        temperature: 0.1,
      },
      glm: {
        apiKey: '',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        model: 'glm-4-flash',
        maxTokens: 1024,
        temperature: 0.1,
      },
      enableAI: true,
    });

    const available = await router.isAvailable();
    expect(available).toBe(false);
  });
});
