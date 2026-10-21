import { describe, expect, it, vi } from 'vitest';
import type { AITarget, AIState } from '@sdj/application';
import { AIRouter, HTTPAIAdapter, ProviderFailure } from '@sdj/infrastructure';

const actor = {
  userId: 'synthetic-user',
  identityId: 'synthetic-identity',
  sourceMessageId: 'synthetic-message',
};
const result = {
  action: 'set_activities',
  items: [{ activity_id: 'subuh', date_reference: { kind: 'today' }, value: 3 }],
  date_reference: null,
  missing: [],
  continues_pending: false,
};
const target: AITarget = {
  id: 'openrouter',
  provider: 'openrouter',
  model: 'openrouter/free',
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKey: 'synthetic-key',
  enabled: true,
  quotaOwner: 'synthetic-bucket',
  requestsPerMinute: 5,
  requestsPerDay: 50,
  timeoutMs: 12000,
};
const success = () =>
  Response.json({
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result) } }],
  });

describe('OpenRouter dan pemulihan router AI', () => {
  it('mengirim schema terikat endpoint, hanya model gratis dan penyedia tanpa pengumpulan data', async () => {
    const request = vi.fn<typeof fetch>(async (url, init) => {
      expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer synthetic-key');
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        model: 'openrouter/free',
        stream: false,
        provider: {
          require_parameters: true,
          data_collection: 'deny',
          max_price: { prompt: 0, completion: 0 },
        },
        response_format: { type: 'json_schema', json_schema: { strict: true } },
      });
      expect(body).not.toHaveProperty('user');
      expect(body.messages[1].content).not.toContain(actor.userId);
      return success();
    });
    const proposal = await new HTTPAIAdapter(request).interpret(
      target,
      'pesan sintetis',
      new AbortController().signal
    );
    expect(proposal).toMatchObject({ action: 'set_activities', items: result.items });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each([
    'openai/gpt-oss-20b',
    'openrouter/auto',
    'openrouter/free,paid/model',
    'paid/model:free@paid',
  ])('menolak model berbayar atau campuran sebelum request: %s', async (model) => {
    const request = vi.fn(async () => success());
    await expect(
      new HTTPAIAdapter(request).interpret(
        { ...target, model },
        'sintetis',
        new AbortController().signal
      )
    ).rejects.toMatchObject({ category: 'configuration' });
    expect(request).not.toHaveBeenCalled();
  });
  it('tidak membocorkan key ke endpoint yang dipalsukan', async () => {
    const request = vi.fn(async () => success());
    await expect(
      new HTTPAIAdapter(request).interpret(
        { ...target, baseUrl: 'https://other.invalid' },
        'sintetis',
        new AbortController().signal
      )
    ).rejects.toMatchObject({ category: 'configuration' });
    expect(request).not.toHaveBeenCalled();
  });
  it.each(['json_validate_failed', 'json_validation_failed'])(
    'HTTP 400 %s menjadi invalid_output yang dapat pulih',
    async (code) => {
      const adapter = new HTTPAIAdapter(async () =>
        Response.json({ error: { code, message: 'synthetic' } }, { status: 400 })
      );
      await expect(
        adapter.interpret(target, 'sintetis', new AbortController().signal)
      ).rejects.toMatchObject({ category: 'invalid_output', retryAfterMs: 1000 });
    }
  );
  it('error envelope HTTP 200 tetap mengikuti Retry-After dan bukan output sukses', async () => {
    const adapter = new HTTPAIAdapter(async () =>
      Response.json({ error: { code: 429 } }, { headers: { 'retry-after': '12' } })
    );
    await expect(
      adapter.interpret(target, 'sintetis', new AbortController().signal)
    ).rejects.toMatchObject({ category: 'rate_limit', retryAfterMs: 12000 });
  });
  it('membedakan kredit, autentikasi, dan output terpotong', async () => {
    for (const [status, category] of [
      [402, 'credits'],
      [401, 'authentication'],
    ] as const) {
      const adapter = new HTTPAIAdapter(async () =>
        Response.json({ error: { code: status } }, { status })
      );
      await expect(
        adapter.interpret(target, 'sintetis', new AbortController().signal)
      ).rejects.toMatchObject({ category });
    }
    const adapter = new HTTPAIAdapter(async () =>
      Response.json({
        choices: [{ finish_reason: 'length', message: { content: JSON.stringify(result) } }],
      })
    );
    await expect(
      adapter.interpret(target, 'sintetis', new AbortController().signal)
    ).rejects.toMatchObject({ category: 'invalid_output' });
  });
  it('membedakan timeout dari kegagalan koneksi', async () => {
    const control = new AbortController();
    control.abort();
    const adapter = new HTTPAIAdapter(async () => {
      throw new Error('synthetic transport');
    });
    await expect(adapter.interpret(target, 'sintetis', control.signal)).rejects.toMatchObject({
      category: 'timeout',
    });
    await expect(
      adapter.interpret(target, 'sintetis', new AbortController().signal)
    ).rejects.toMatchObject({ category: 'network' });
  });
  it('fallback dibatasi dua percobaan dan kegagalan JSON tidak menonaktifkan bucket', async () => {
    const targets = ['groq', 'gemini', 'nvidia', 'openrouter'].map((id) => ({ ...target, id }));
    const settlements: Parameters<AIState['settle']>[1][] = [];
    const candidates: string[][] = [];
    const state: AIState = {
      reserve: async (_user, ids) => {
        candidates.push([...ids]);
        return ids[0] ? { targetId: ids[0], attemptId: crypto.randomUUID() } : null;
      },
      settle: async (_id, outcome) => {
        settlements.push(outcome);
      },
    };
    const calls: string[] = [];
    const router = new AIRouter(targets, state, {
      interpret: async (current) => {
        calls.push(current.id);
        if (current.id !== 'gemini') throw new ProviderFailure('invalid_output', 1000);
        return { schema_version: 2, action: 'help' };
      },
    });
    await expect(router.interpret('sintetis', actor, 'synthetic-command')).resolves.toMatchObject({
      action: 'help',
    });
    expect(calls).toEqual(['groq', 'gemini']);
    expect(settlements.slice(0, 1).every((outcome) => outcome.disable === false)).toBe(true);
    expect(candidates[1]).not.toContain('groq');
  });
  it('tidak memulai fallback baru setelah anggaran waktu total habis', async () => {
    let elapsed = 0;
    const timer = vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
    const reserve = vi.fn<AIState['reserve']>(async (_user, ids) =>
      ids[0] ? { targetId: ids[0], attemptId: 'synthetic' } : null
    );
    const adapter = vi.fn(async () => {
      elapsed = 12001;
      throw new ProviderFailure('timeout');
    });
    try {
      await expect(
        new AIRouter(
          [{ ...target, id: 'first' }, target],
          { reserve, settle: async () => {} },
          { interpret: adapter }
        ).interpret('sintetis', actor, 'synthetic')
      ).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
      expect(adapter).toHaveBeenCalledTimes(1);
    } finally {
      timer.mockRestore();
    }
  });
});
