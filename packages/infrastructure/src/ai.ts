import { z } from 'zod';
import {
  ACTIVITIES,
  DomainError,
  rejectTargetOverride,
  validateValue,
  type ActorContext,
  type CommandProposal,
  type InterpretationContext,
} from '@sdj/domain';
import { AIResponseEnvelopeSchema, CommandProposalSchema } from '@sdj/contracts';
import type { AIAdapter, AIState, AITarget, IntentInterpreter, AIUsage } from '@sdj/application';
import { Database } from './db.js';
import { intentPrompt } from './intent-prompt.js';
export class ProviderFailure extends Error {
  constructor(
    readonly category:
      | 'rate_limit'
      | 'authentication'
      | 'configuration'
      | 'network'
      | 'timeout'
      | 'invalid_output'
      | 'refusal'
      | 'credits',
    readonly retryAfterMs = 60000
  ) {
    super(category);
  }
}
export class PgAIState implements AIState {
  constructor(private readonly db: Database) {}
  async reserve(
    userId: string,
    targetIds: readonly string[],
    _now: Date
  ): Promise<{ targetId: string; attemptId: string } | null> {
    const attemptId = crypto.randomUUID();
    return this.db.tenant({ userId }, async (client) => {
      const result = await client.query<{ id: string | null }>(
        'SELECT sdj.reserve_ai($1,$2) AS id',
        [targetIds, attemptId]
      );
      const targetId = result.rows[0]?.id;
      return targetId ? { targetId, attemptId } : null;
    });
  }
  async settle(
    attemptId: string,
    result: {
      ok: boolean;
      error?: string;
      blockedUntil?: Date;
      disable?: boolean;
      tokens?: number;
      durationMs?: number;
    }
  ): Promise<void> {
    // The actor is captured by the per-message state wrapper below, never by output from a provider.
    const userId = this.actors.get(attemptId);
    if (!userId) throw new Error('ATTEMPT_ACTOR_MISSING');
    await this.db.tenant({ userId }, async (client) => {
      await client.query('SELECT sdj.settle_ai($1,$2,$3,$4,$5,$6)', [
        attemptId,
        result.ok,
        result.error ?? null,
        result.blockedUntil ?? null,
        result.disable ?? false,
        result.tokens ?? null,
      ]);
      await client.query('UPDATE sdj.provider_attempts SET duration_ms=$2 WHERE id=$1', [
        attemptId,
        result.durationMs ?? null,
      ]);
    });
    this.actors.delete(attemptId);
  }
  private readonly actors = new Map<string, string>();
  scoped(): AIState {
    return {
      reserve: async (userId, targets, now) => {
        const r = await this.reserve(userId, targets, now);
        if (r) this.actors.set(r.attemptId, userId);
        return r;
      },
      settle: (attemptId, result) => this.settle(attemptId, result),
    };
  }
}
export class AIRouter implements IntentInterpreter {
  constructor(
    private readonly targets: readonly AITarget[],
    private readonly state: AIState,
    private readonly adapter: AIAdapter,
    private readonly now: () => Date = () => new Date(),
    private readonly enabled = true
  ) {}
  async interpret(
    text: string,
    actor: ActorContext,
    commandId: string,
    context?: InterpretationContext
  ): Promise<CommandProposal> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(
          new DomainError(
            'AI_UNAVAILABLE',
            'Aku belum berhasil memahami pesanmu tepat waktu. Catatanmu belum berubah.\n\n> Coba “zuhur 3” atau “rekap hari ini”.'
          )
        );
      }, 12000);
    });
    try {
      return await Promise.race([
        this.interpretWithinBudget(text, actor, commandId, context, controller.signal),
        deadline,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  private async interpretWithinBudget(
    text: string,
    actor: ActorContext,
    _commandId: string,
    context: InterpretationContext | undefined,
    deadlineSignal: AbortSignal
  ): Promise<CommandProposal> {
    rejectTargetOverride(text);
    if (!this.enabled)
      throw new DomainError(
        'AI_UNAVAILABLE',
        'Pemahaman bahasa bebas belum aktif. Gunakan format seperti “zuhur 3”. Pesan belum mengubah tracker.'
      );
    const priority = ['groq', 'gemini', 'openrouter', 'nvidia'];
    const eligible = this.targets
      .filter((t) => t.enabled)
      .sort((a, b) => priority.indexOf(a.provider) - priority.indexOf(b.provider));
    const tried = new Set<string>();
    const started = performance.now();
    for (let attempt = 0; attempt < 2 && performance.now() - started < 12000; attempt++) {
      // Database enforces ordered priority, shared quota and cooldown; never retry a target in this message.
      const reservation = await reserveBeforeDeadline(
        this.state,
        12000 - (performance.now() - started),
        actor.userId,
        eligible.filter((t) => !tried.has(t.id)).map((t) => t.id),
        this.now()
      );
      if (!reservation) break;
      const target = eligible.find((t) => t.id === reservation.targetId);
      if (!target || tried.has(reservation.targetId)) {
        await this.state.settle(reservation.attemptId, { ok: false, error: 'already_tried' });
        break;
      }
      tried.add(target.id);
      const attemptStarted = performance.now();
      let usage: AIUsage | undefined;
      try {
        const remaining = Math.max(
          1,
          Math.min(6000, target.timeoutMs ?? 6000, 12000 - (performance.now() - started))
        );
        const proposal = CommandProposalSchema.parse(
          await this.adapter.interpret(
            target,
            text,
            AbortSignal.any([deadlineSignal, AbortSignal.timeout(Math.floor(remaining))]),
            context,
            (value) => {
              usage = value;
            }
          )
        );
        if (proposal.action === 'set_activities')
          for (const item of proposal.items) validateValue(item.activity_id, item.value);
        await this.state.settle(reservation.attemptId, {
          ok: true,
          ...(usage?.totalTokens !== null && usage?.totalTokens !== undefined
            ? { tokens: usage.totalTokens }
            : {}),
          durationMs: Math.round(performance.now() - attemptStarted),
        });
        return proposal;
      } catch (error) {
        if (error instanceof DomainError) {
          await this.state.settle(reservation.attemptId, {
            ok: false,
            error: 'semantic_invalid',
            durationMs: Math.round(performance.now() - attemptStarted),
          });
          throw error;
        }
        const failure =
          error instanceof ProviderFailure
            ? error
            : error instanceof z.ZodError
              ? new ProviderFailure('invalid_output', 1000)
              : new ProviderFailure('network', 5000);
        await this.state.settle(reservation.attemptId, {
          ok: false,
          durationMs: Math.round(performance.now() - attemptStarted),
          ...(usage?.totalTokens !== null && usage?.totalTokens !== undefined
            ? { tokens: usage.totalTokens }
            : {}),
          error: failure.category,
          blockedUntil: new Date(this.now().getTime() + failure.retryAfterMs),
          disable: ['authentication', 'configuration'].includes(failure.category),
        });
        if (failure.category === 'refusal') break;
      }
    }
    throw new DomainError(
      'AI_UNAVAILABLE',
      tried.size === 0
        ? 'Aku belum bisa memahami bahasa bebas saat ini. Catatanmu belum berubah.\n\n> Coba “subuh 3, tilawah 2 halaman” atau “rekap hari ini”.'
        : 'Aku belum berhasil memahami pesanmu. Catatanmu belum berubah.\n\n> Coba “zuhur 3” atau kirim ulang instruksinya dengan lebih singkat.'
    );
  }
}
const valueSchema = { anyOf: [{ type: 'number' }, { type: 'boolean' }, { type: 'null' }] };
const dateSchema = {
  anyOf: [
    {
      type: 'object',
      properties: { kind: { type: 'string', enum: ['today'] } },
      required: ['kind'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: { kind: { type: 'string', enum: ['yesterday'] } },
      required: ['kind'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['days_ago'] },
        days: { type: 'integer', minimum: 1, maximum: 31 },
      },
      required: ['kind', 'days'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: { kind: { type: 'string', enum: ['explicit'] }, date: { type: 'string' } },
      required: ['kind', 'date'],
      additionalProperties: false,
    },
    { type: 'null' },
  ],
};
export const AI_JSON_SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: [
        'set_activities',
        'daily_summary',
        'monthly_summary',
        'clarify',
        'unsupported',
        'help',
        'connection_status',
        'undo_last',
        'connect',
        'disconnect',
        'delete_account',
        'confirm_pending',
        'cancel_pending',
        'reminder_on',
        'reminder_off',
        'reminder_status',
        'refresh_profile',
        'format_summary',
      ],
    },
    continues_pending: { type: 'boolean' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          activity_id: {
            anyOf: [{ type: 'string', enum: ACTIVITIES.map((a) => a.id) }, { type: 'null' }],
          },
          date_reference: dateSchema,
          value: valueSchema,
        },
        required: ['activity_id', 'date_reference', 'value'],
        additionalProperties: false,
      },
    },
    date_reference: dateSchema,
    missing: { type: 'array', items: { type: 'string', enum: ['activity', 'date', 'value'] } },
  },
  required: ['action', 'items', 'date_reference', 'missing', 'continues_pending'],
  additionalProperties: false,
};
export function normalizeAIResponse(
  raw: unknown,
  context?: InterpretationContext
): CommandProposal {
  const response = AIResponseEnvelopeSchema.parse(raw);
  if (response.continues_pending && !context?.pending) {
    if (response.action !== 'clarify') throw new ProviderFailure('invalid_output', 1000);
    response.continues_pending = false;
  }
  if (!['set_activities', 'clarify'].includes(response.action) && response.continues_pending)
    throw new ProviderFailure('invalid_output');
  if (
    !['set_activities', 'daily_summary', 'monthly_summary', 'clarify'].includes(response.action)
  ) {
    if (response.items.length || response.missing.length || response.date_reference !== null)
      throw new ProviderFailure('invalid_output');
    return CommandProposalSchema.parse({ schema_version: 2, action: response.action });
  }
  if (response.action === 'daily_summary' || response.action === 'monthly_summary')
    return CommandProposalSchema.parse({
      schema_version: 2,
      action: response.action,
      date_reference: response.date_reference,
    });
  if (response.action === 'clarify')
    return CommandProposalSchema.parse({
      schema_version: 2,
      action: response.action,
      items: response.items,
      missing: response.missing,
      ...(response.continues_pending ? { continues_pending: true } : {}),
    });
  if (
    response.items.some(
      (i) => i.activity_id === null || i.date_reference === null || i.value === null
    )
  ) {
    const missing: ('activity' | 'date' | 'value')[] = [];
    if (response.items.some((i) => i.activity_id === null)) missing.push('activity');
    if (response.items.some((i) => i.date_reference === null)) missing.push('date');
    if (response.items.some((i) => i.value === null)) missing.push('value');
    return CommandProposalSchema.parse({
      schema_version: 2,
      action: 'clarify',
      items: response.items,
      missing,
      ...(response.continues_pending ? { continues_pending: true } : {}),
    });
  }
  return CommandProposalSchema.parse({
    schema_version: 2,
    action: 'set_activities',
    items: response.items,
    ...(response.continues_pending ? { continues_pending: true } : {}),
  });
}
export class HTTPAIAdapter implements AIAdapter {
  constructor(private readonly request: typeof fetch = fetch) {}
  async interpret(
    target: AITarget,
    text: string,
    signal: AbortSignal,
    context?: InterpretationContext,
    reportUsage?: (usage: AIUsage) => void
  ): Promise<CommandProposal> {
    const expected =
      target.provider === 'groq'
        ? 'https://api.groq.com/openai/v1'
        : target.provider === 'nvidia'
          ? 'https://integrate.api.nvidia.com/v1'
          : target.provider === 'openrouter'
            ? 'https://openrouter.ai/api/v1'
            : 'https://generativelanguage.googleapis.com/v1beta';
    if (target.baseUrl !== expected) throw new ProviderFailure('configuration');
    // Keep this integration free even if an environment value is changed accidentally.
    if (
      target.provider === 'openrouter' &&
      target.model !== 'openrouter/free' &&
      !/^[a-zA-Z0-9._/-]+:free$/.test(target.model)
    )
      throw new ProviderFailure('configuration');
    const system = intentPrompt();
    const userInput = JSON.stringify({ message: text, context: context ?? null });
    const isGemini = target.provider === 'gemini';
    const url = isGemini
      ? `${target.baseUrl}/models/${encodeURIComponent(target.model)}:generateContent`
      : `${target.baseUrl}/chat/completions`;
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (isGemini) headers['x-goog-api-key'] = target.apiKey;
    else headers['authorization'] = 'Bearer ' + target.apiKey;
    if (target.provider === 'openrouter') headers['X-Title'] = 'SDJ Assistant';
    const body = isGemini
      ? {
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: userInput }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json',
            responseJsonSchema: AI_JSON_SCHEMA,
          },
        }
      : {
          model: target.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: userInput },
          ],
          temperature: 0,
          max_tokens: 2048,
          stream: false,
          ...(target.provider === 'groq' ? { max_tokens: 4096, reasoning_effort: 'low' } : {}),
          ...(target.provider === 'openrouter'
            ? {
                provider: {
                  require_parameters: true,
                  data_collection: 'deny',
                  max_price: { prompt: 0, completion: 0 },
                },
              }
            : {}),
          ...(['groq', 'openrouter'].includes(target.provider)
            ? {
                response_format: {
                  type: 'json_schema',
                  json_schema: { name: 'sdj_intent_v2', strict: true, schema: AI_JSON_SCHEMA },
                },
              }
            : { response_format: { type: 'json_object' } }),
        };
    let response: Response;
    try {
      response = await this.request(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      });
    } catch {
      throw new ProviderFailure(signal.aborted ? 'timeout' : 'network', 5000);
    }
    // Some OpenAI-compatible endpoints return error envelopes with HTTP 200.
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      if (signal.aborted) throw new ProviderFailure('timeout', 5000);
      if (response.ok) throw new ProviderFailure('invalid_output', 1000);
    }
    const envelope = z
      .object({
        error: z.object({
          code: z.union([z.string(), z.number()]).optional(),
          metadata: z.object({ limit_source: z.string().optional() }).optional(),
        }),
      })
      .safeParse(payload);
    const providerCode = envelope.success ? String(envelope.data.error.code ?? '') : '';
    const httpCode =
      response.ok && /^\d{3}$/.test(providerCode) ? Number(providerCode) : response.status;
    if (!response.ok || envelope.success) {
      const retry = response.headers.get('retry-after');
      let retryMs = retry ? Number(retry) * 1000 : 60000;
      if (!Number.isFinite(retryMs)) retryMs = Math.max(1000, Date.parse(retry ?? '') - Date.now());
      if (!Number.isFinite(retryMs)) retryMs = 60000;
      if (httpCode === 429)
        throw new ProviderFailure('rate_limit', Math.min(86400000, Math.max(1000, retryMs)));
      if (
        ['json_validate_failed', 'json_validation_failed', 'tool_use_failed'].includes(providerCode)
      )
        throw new ProviderFailure('invalid_output', 1000);
      if (['content_filter', 'moderation_blocked'].includes(providerCode))
        throw new ProviderFailure('refusal');
      if (envelope.success && envelope.data.error.metadata?.limit_source?.startsWith('openrouter_'))
        throw new ProviderFailure('credits', 60000);
      if (httpCode === 402) throw new ProviderFailure('credits', 60000);
      if ([401, 403].includes(httpCode)) throw new ProviderFailure('authentication');
      if ([400, 404, 422].includes(httpCode)) throw new ProviderFailure('configuration');
      throw new ProviderFailure('network', 5000);
    }
    const metrics = z
      .object({
        usage: z
          .object({
            prompt_tokens: z.number().int().nonnegative().optional(),
            completion_tokens: z.number().int().nonnegative().optional(),
            total_tokens: z.number().int().nonnegative().optional(),
          })
          .optional(),
        usageMetadata: z
          .object({
            promptTokenCount: z.number().int().nonnegative().optional(),
            candidatesTokenCount: z.number().int().nonnegative().optional(),
            totalTokenCount: z.number().int().nonnegative().optional(),
          })
          .optional(),
      })
      .safeParse(payload);
    const m = metrics.success ? metrics.data : undefined;
    reportUsage?.({
      inputTokens: m?.usage?.prompt_tokens ?? m?.usageMetadata?.promptTokenCount ?? null,
      outputTokens: m?.usage?.completion_tokens ?? m?.usageMetadata?.candidatesTokenCount ?? null,
      totalTokens: m?.usage?.total_tokens ?? m?.usageMetadata?.totalTokenCount ?? null,
    });
    try {
      let content: string;
      if (isGemini) {
        const r = z
          .object({
            candidates: z
              .array(
                z.object({
                  finishReason: z.string().optional(),
                  content: z
                    .object({ parts: z.array(z.object({ text: z.string().optional() })) })
                    .optional(),
                })
              )
              .optional(),
            promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
          })
          .parse(payload);
        const candidate = r.candidates?.[0];
        if (
          r.promptFeedback?.blockReason ||
          ['SAFETY', 'PROHIBITED_CONTENT'].includes(candidate?.finishReason ?? '')
        )
          throw new ProviderFailure('refusal');
        if (candidate?.finishReason === 'MAX_TOKENS')
          throw new ProviderFailure('invalid_output', 1000);
        content = candidate?.content?.parts.map((p) => p.text ?? '').join('') ?? '';
      } else {
        const r = z
          .object({
            choices: z.array(
              z.object({
                finish_reason: z.string().nullable().optional(),
                message: z.object({
                  content: z.string().nullable(),
                  refusal: z.string().nullable().optional(),
                }),
              })
            ),
          })
          .parse(payload);
        if (r.choices[0]?.message.refusal) throw new ProviderFailure('refusal');
        if (r.choices[0]?.finish_reason === 'content_filter') throw new ProviderFailure('refusal');
        if (['length', 'error'].includes(r.choices[0]?.finish_reason ?? ''))
          throw new ProviderFailure('invalid_output', 1000);
        content = r.choices[0]?.message.content ?? '';
      }
      return normalizeAIResponse(JSON.parse(content), context);
    } catch (error) {
      if (error instanceof ProviderFailure) throw error;
      throw new ProviderFailure('invalid_output', 1000);
    }
  }
}
export function targetsFromEnvironment(enabled: boolean): AITarget[] {
  return [
    {
      id: 'groq',
      provider: 'groq' as const,
      baseUrl: 'https://api.groq.com/openai/v1',
      model: process.env['GROQ_MODEL_V2'] ?? 'openai/gpt-oss-20b',
      apiKey: process.env['GROQ_API_KEY'] ?? '',
      quotaOwner: process.env['GROQ_QUOTA_OWNER'] ?? 'groq-default',
    },
    {
      id: 'gemini',
      provider: 'gemini' as const,
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      model: process.env['GEMINI_MODEL_V2'] ?? 'gemini-3.5-flash-lite',
      apiKey: process.env['GEMINI_API_KEY'] ?? '',
      quotaOwner: process.env['GEMINI_QUOTA_OWNER'] ?? 'gemini-default',
    },
    {
      id: 'openrouter',
      provider: 'openrouter' as const,
      baseUrl: 'https://openrouter.ai/api/v1',
      model: process.env['OPENROUTER_MODEL'] ?? 'openrouter/free',
      apiKey: process.env['OPENROUTER_API_KEY'] ?? '',
      quotaOwner: process.env['OPENROUTER_QUOTA_OWNER'] ?? 'openrouter-default',
    },
    {
      id: 'nvidia',
      provider: 'nvidia' as const,
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      model: process.env['NVIDIA_MODEL'] ?? '',
      apiKey: process.env['NVIDIA_API_KEY'] ?? process.env['GLM_API_KEY'] ?? '',
      quotaOwner: process.env['NVIDIA_QUOTA_OWNER'] ?? 'nvidia-default',
    },
  ].map((t) => ({
    ...t,
    enabled: enabled && !!t.apiKey && !!t.model,
    timeoutMs: 6000,
    requestsPerMinute: Number(
      process.env[t.id.toUpperCase() + '_LOCAL_RPM'] ?? (t.id === 'openrouter' ? 5 : 1)
    ),
    requestsPerDay: Number(process.env[t.id.toUpperCase() + '_LOCAL_RPD'] ?? 50),
  }));
}

async function reserveBeforeDeadline(
  state: AIState,
  budgetMs: number,
  userId: string,
  targets: readonly string[],
  now: Date
): Promise<{ targetId: string; attemptId: string } | null> {
  if (budgetMs <= 0) return null;
  return new Promise((resolve, reject) => {
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      resolve(null);
    }, Math.floor(budgetMs));
    state.reserve(userId, targets, now).then(
      (reservation) => {
        clearTimeout(timer);
        if (expired) {
          if (reservation)
            void state
              .settle(reservation.attemptId, { ok: false, error: 'deadline' })
              .catch(() => process.stderr.write('AI_LATE_SETTLEMENT_FAILED\n'));
        } else resolve(reservation);
      },
      (error) => {
        clearTimeout(timer);
        if (!expired) reject(error);
      }
    );
  });
}
