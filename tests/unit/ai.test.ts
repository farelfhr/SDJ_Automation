import { describe, it, expect, vi } from 'vitest';
import { AIRouter, HTTPAIAdapter, ProviderFailure, normalizeAIResponse } from '@sdj/infrastructure';
import type { AIState, AITarget } from '@sdj/application';
import { FakeClock } from '@sdj/testing';
const proposal = {
  schema_version: 2 as const,
  action: 'set_activities' as const,
  items: [{ activity_id: 'dzuhur' as const, date_reference: { kind: 'today' as const }, value: 3 }],
};
const actor = {
  userId: crypto.randomUUID(),
  identityId: crypto.randomUUID(),
  sourceMessageId: crypto.randomUUID(),
};
function setup() {
  const clock = new FakeClock(),
    blocked = new Set<string>(),
    attempts = new Map<string, string>();
  const state: AIState = {
    reserve: async (_user, targets) => {
      for (let i = 0; i < targets.length; i++) {
        const targetId = targets[i];
        if (targetId && !blocked.has(targetId)) {
          const attemptId = crypto.randomUUID();
          attempts.set(attemptId, targetId);
          return { targetId, attemptId };
        }
      }
      return null;
    },
    settle: async (id, result) => {
      if (!result.ok && result.blockedUntil) {
        const target = attempts.get(id);
        if (target) blocked.add(target);
      }
    },
  };
  const targets: AITarget[] = (['groq', 'gemini', 'nvidia'] as const).map((provider) => ({
    id: provider,
    provider,
    model: 'synthetic',
    apiKey: 'synthetic',
    baseUrl:
      provider === 'groq'
        ? 'https://api.groq.com/openai/v1'
        : provider === 'gemini'
          ? 'https://generativelanguage.googleapis.com/v1beta'
          : 'https://integrate.api.nvidia.com/v1',
    quotaOwner: provider,
    requestsPerMinute: 10,
    requestsPerDay: 50,
    enabled: true,
  }));
  return { clock, state, targets };
}
describe('Router intent AI', () => {
  it('output set dengan tanggal null meminta tanggal tanpa menebak atau dianggap outage', () => {
    expect(
      normalizeAIResponse({
        action: 'set_activities',
        items: [{ activity_id: 'subuh', value: 3, date_reference: null }],
        date_reference: null,
        missing: [],
        continues_pending: false,
      })
    ).toEqual({
      schema_version: 2,
      action: 'clarify',
      items: [{ activity_id: 'subuh', value: 3, date_reference: null }],
      missing: ['date'],
    });
  });
  it('progres bulanan tetap menjadi intent baca dengan tanggal acuan', () => {
    expect(
      normalizeAIResponse({
        action: 'monthly_summary',
        items: [],
        date_reference: { kind: 'today' },
        missing: [],
        continues_pending: false,
      })
    ).toEqual({ schema_version: 2, action: 'monthly_summary', date_reference: { kind: 'today' } });
  });
  it.each([
    'help',
    'connection_status',
    'connect',
    'disconnect',
    'delete_account',
    'undo_last',
    'confirm_pending',
    'cancel_pending',
  ] as const)('memahami intent sistem %s melalui kontrak AI', (action) => {
    expect(
      normalizeAIResponse({
        action,
        items: [],
        date_reference: null,
        missing: [],
        continues_pending: false,
      })
    ).toEqual({ schema_version: 2, action });
  });
  it('tidak membolehkan intent sistem menyembunyikan item penulisan', () => {
    expect(() =>
      normalizeAIResponse({
        action: 'delete_account',
        items: proposal.items,
        date_reference: null,
        missing: [],
        continues_pending: false,
      })
    ).toThrow();
  });
  it('meneruskan konteks klarifikasi tanpa identitas atau credential ke provider', async () => {
    const s = setup();
    const context = {
      localDate: '2026-10-16',
      pending: {
        localDate: '2026-10-15',
        mode: 'slots' as const,
        proposal: {
          schema_version: 2 as const,
          action: 'clarify' as const,
          items: [
            {
              activity_id: 'dzuhur' as const,
              date_reference: { kind: 'today' as const },
              value: null,
            },
          ],
          missing: ['value' as const],
        },
      },
    };
    const adapter = new HTTPAIAdapter(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      const input = JSON.parse(body.messages[1].content);
      expect(input).toEqual({ message: 'yang zuhur itu tiga aja', context });
      expect(body.messages[0].content).toContain('confirm_pending');
      expect(body.messages[1].content).not.toContain(actor.userId);
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                action: 'set_activities',
                items: proposal.items,
                date_reference: null,
                missing: [],
                continues_pending: true,
              }),
            },
          },
        ],
      });
    });
    expect(
      await adapter.interpret(
        s.targets[0]!,
        'yang zuhur itu tiga aja',
        new AbortController().signal,
        context
      )
    ).toMatchObject({ continues_pending: true });
  });
  it('mengutamakan provider cepat yang sehat antar pesan', async () => {
    const s = setup(),
      calls: string[] = [];
    const router = new AIRouter(
      s.targets,
      s.state,
      {
        interpret: async (target) => {
          calls.push(target.id);
          return proposal;
        },
      },
      () => s.clock.now()
    );
    for (let i = 0; i < 4; i++) await router.interpret('pesan bebas', actor, 'command');
    expect(calls).toEqual(['groq', 'groq', 'groq', 'groq']);
  });
  it('fallback melewati target cooldown dan tidak mengulang side effect', async () => {
    const s = setup(),
      calls: string[] = [];
    const router = new AIRouter(
      s.targets,
      s.state,
      {
        interpret: async (target) => {
          calls.push(target.id);
          if (target.id === 'groq') throw new ProviderFailure('rate_limit');
          return proposal;
        },
      },
      () => s.clock.now()
    );
    await router.interpret('pesan bebas', actor, 'command');
    await router.interpret('pesan kedua', actor, 'command');
    expect(calls).toHaveLength(3);
    expect(calls[0]).toBe('groq');
    expect(calls.slice(1).every((target) => target !== 'groq')).toBe(true);
  });
  it('semua provider gagal berhenti setelah dua panggilan', async () => {
    const s = setup();
    let count = 0;
    const router = new AIRouter(s.targets, s.state, {
      interpret: async () => {
        count++;
        throw new ProviderFailure('network');
      },
    });
    await expect(router.interpret('pesan bebas', actor, 'command')).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
    });
    expect(count).toBe(2);
  });
  it('safety refusal tidak dialihkan untuk menghindari penolakan', async () => {
    const s = setup();
    let count = 0;
    const router = new AIRouter(s.targets, s.state, {
      interpret: async () => {
        count++;
        throw new ProviderFailure('refusal');
      },
    });
    await expect(router.interpret('pesan bebas', actor, 'command')).rejects.toThrow();
    expect(count).toBe(1);
  });
  it('nilai semantik invalid tidak dicoba ulang sampai model setuju', async () => {
    const s = setup();
    let count = 0;
    const router = new AIRouter(s.targets, s.state, {
      interpret: async () => {
        count++;
        return {
          ...proposal,
          items: [{ activity_id: 'dzuhur', date_reference: { kind: 'today' }, value: 8 }],
        };
      },
    });
    await expect(router.interpret('pesan bebas', actor, 'command')).rejects.toMatchObject({
      code: 'VALUE_OUT_OF_RANGE',
    });
    expect(count).toBe(1);
  });
  it('unknown keys model ditolak dan tidak ada target sel dari AI', () => {
    expect(() =>
      normalizeAIResponse({
        action: 'set_activities',
        items: [
          { activity_id: 'dzuhur', date_reference: { kind: 'today' }, value: 3, user_id: 'other' },
        ],
        date_reference: null,
        missing: [],
      })
    ).toThrow();
  });
  it('HTTP adapter memakai endpoint provider terikat dan schema strict', async () => {
    const s = setup();
    const bodies: Record<string, unknown>[] = [];
    const adapter = new HTTPAIAdapter(async (input, init) => {
      expect(String(input)).toBe('https://api.groq.com/openai/v1/chat/completions');
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  action: 'set_activities',
                  items: proposal.items,
                  date_reference: null,
                  missing: [],
                }),
              },
            },
          ],
        })
      );
    });
    expect(
      await adapter.interpret(s.targets[0]!, 'sintetis', new AbortController().signal)
    ).toEqual(proposal);
    expect(bodies[0]).toHaveProperty('response_format.type', 'json_schema');
  });
});

describe('Deadline dan usage interpretasi', () => {
  it('hard deadline tetap berlaku bila reservasi kuota lambat', async () => {
    vi.useFakeTimers();
    let release: ((r: { targetId: string; attemptId: string }) => void) | undefined;
    const settle = vi.fn(async () => {});
    const adapter = vi.fn(async () => proposal);
    const state: AIState = {
      reserve: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
      settle,
    };
    try {
      const pending = new AIRouter(setup().targets, state, { interpret: adapter }).interpret(
        'sintetis',
        actor,
        'synthetic'
      );
      const outcome = expect(pending).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
      await vi.advanceTimersByTimeAsync(12001);
      await outcome;
      release?.({ targetId: 'groq', attemptId: 'synthetic-late' });
      await vi.advanceTimersByTimeAsync(1);
      expect(adapter).not.toHaveBeenCalled();
      expect(settle).toHaveBeenCalledWith('synthetic-late', { ok: false, error: 'deadline' });
    } finally {
      vi.useRealTimers();
    }
  });
  it('usage total diteruskan ke settlement tanpa menyimpan isi pesan', async () => {
    const s = setup();
    const settle = vi.spyOn(s.state, 'settle');
    await new AIRouter(s.targets, s.state, {
      interpret: async (_target, _text, _signal, _context, usage) => {
        usage?.({ inputTokens: 120, outputTokens: 30, totalTokens: 150 });
        return proposal;
      },
    }).interpret('sintetis', actor, 'synthetic');
    expect(settle.mock.calls[0]?.[1]).toMatchObject({ ok: true, tokens: 150 });
    expect(settle.mock.calls[0]?.[1].durationMs).toBeGreaterThanOrEqual(0);
  });
});

it('klarifikasi baru tidak meminjam pending yang tidak ada dan usulan write palsu ditolak', () => {
  const base = {
    action: 'clarify',
    continues_pending: true,
    items: [{ activity_id: 'dzuhur', date_reference: { kind: 'today' }, value: null }],
    missing: ['value'],
    date_reference: null,
  };
  expect(normalizeAIResponse(base, { localDate: '2026-10-19' })).not.toHaveProperty(
    'continues_pending'
  );
  expect(() =>
    normalizeAIResponse(
      { ...base, action: 'set_activities', items: [{ ...base.items[0], value: 3 }], missing: [] },
      { localDate: '2026-10-19' }
    )
  ).toThrow(ProviderFailure);
});
