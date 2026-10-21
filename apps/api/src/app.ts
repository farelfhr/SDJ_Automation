import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import { DomainError } from '@sdj/domain';
import { ChannelEventSchema } from '@sdj/contracts';
import type { Store } from '@sdj/application';
import { safeEqual, signRequest, type BrowserOnboarding } from '@sdj/infrastructure';
import { homePage, privacyPage, termsPage } from './public-pages.js';
import { connectionPage, onboardingAssets } from './onboarding-ui.js';
import { clientScript } from './onboarding-client.js';
import {
  profilePage,
  profileScript,
  profileResultPage,
  connectionEntryPage,
  connectionExpiredPage,
  entryScript,
} from './onboarding-pages.js';
declare module 'fastify' {
  interface FastifyRequest {
    rawBody: string;
  }
}
export interface APIOptions {
  store: Store;
  onboarding: BrowserOnboarding;
  channelKey: string;
  channelKeyId: string;
  channelAccountId: string;
  publicBaseUrl: string;
  now?: () => Date;
}
function header(request: FastifyRequest, name: string): string {
  const value = request.headers[name];
  return typeof value === 'string' ? value : '';
}
function cookie(request: FastifyRequest, name: string): string {
  const segment = header(request, 'cookie')
    .split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith(name + '='));
  return segment?.slice(name.length + 1) ?? '';
}
export function createApp(options: APIOptions): FastifyInstance {
  const app = Fastify({ bodyLimit: 8192, logger: false, requestIdHeader: false });
  const now = options.now ?? (() => new Date());
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string', bodyLimit: 8192 },
    (request, body, done) => {
      const raw = typeof body === 'string' ? body : body.toString();
      request.rawBody = raw;
      try {
        done(null, JSON.parse(raw));
      } catch {
        done(new Error('INVALID_JSON'));
      }
    }
  );
  app.addHook('onSend', async (request, reply, payload) => {
    reply
      .header('x-content-type-options', 'nosniff')
      // Picker API key restrictions need the app origin. Only send origin, never onboarding tokens/query strings.
      .header('referrer-policy', 'strict-origin')
      .header('cache-control', 'no-store');
    if (
      request.url.startsWith('/connect') ||
      ['/', '/privacy', '/terms'].includes(request.url.split('?')[0] ?? '')
    )
      reply.header(
        'content-security-policy',
        "default-src 'self'; script-src 'self' https://apis.google.com https://*.gstatic.com; connect-src 'self' https://*.googleapis.com https://*.google.com; frame-src https://*.google.com; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' https://*.google.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
      );
    return payload;
  });
  app.addHook('preHandler', async (request, reply) => {
    if (!request.url.startsWith('/internal/v1/')) return;
    const key = header(request, 'x-sdj-key-id'),
      timestamp = header(request, 'x-sdj-timestamp'),
      nonce = header(request, 'x-sdj-nonce'),
      signature = header(request, 'x-sdj-signature');
    if (
      key !== options.channelKeyId ||
      !/^\d{10}$/.test(timestamp) ||
      Math.abs(now().getTime() - Number(timestamp) * 1000) > 60000 ||
      !/^[A-Za-z0-9_-]{16,128}$/.test(nonce) ||
      !/^[a-f0-9]{64}$/.test(signature) ||
      !safeEqual(
        signRequest(options.channelKey, timestamp, nonce, request.rawBody ?? ''),
        signature
      )
    ) {
      await reply.status(401).send({
        error: { code: 'CHANNEL_AUTH_INVALID', message: 'Autentikasi kanal tidak valid.' },
      });
      return;
    }
    try {
      if (!(await options.store.reserveNonce(key, nonce, new Date(now().getTime() + 300000))))
        await reply
          .status(401)
          .send({ error: { code: 'CHANNEL_REPLAY', message: 'Nonce sudah dipakai.' } });
    } catch {
      await reply
        .status(503)
        .send({ error: { code: 'DATABASE_UNAVAILABLE', message: 'Penyimpanan tidak tersedia.' } });
    }
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError) {
      void reply
        .status(400)
        .send({ error: { code: 'INPUT_INVALID', message: 'Format input tidak valid.' } });
      return;
    }
    if (error instanceof DomainError) {
      if (
        request.method === 'GET' &&
        ['/connect', '/connect/google/callback'].includes(request.url.split('?')[0] ?? '') &&
        ['ONBOARDING_EXPIRED', 'OAUTH_STATE_INVALID'].includes(error.code)
      ) {
        void reply.status(401).type('text/html; charset=utf-8').send(connectionExpiredPage());
        return;
      }
      void reply
        .status(error.code === 'ONBOARDING_EXPIRED' ? 401 : 400)
        .send({ error: { code: error.code, message: error.message } });
      return;
    }
    const info = z
      .object({ statusCode: z.number().optional(), message: z.string().optional() })
      .safeParse(error).data;
    void reply
      .status(info?.statusCode === 413 ? 413 : info?.message === 'INVALID_JSON' ? 400 : 503)
      .send({
        error: {
          code: info?.statusCode === 413 ? 'BODY_TOO_LARGE' : 'REQUEST_FAILED',
          message: 'Permintaan belum dapat diproses.',
        },
      });
  });
  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async (_request, reply) => {
    const ready = await options.store.health();
    return reply.status(ready ? 200 : 503).send({ status: ready ? 'ready' : 'unavailable' });
  });
  app.get('/', async (_request, reply) => reply.type('text/html; charset=utf-8').send(homePage()));
  app.get('/privacy', async (_request, reply) =>
    reply.type('text/html; charset=utf-8').send(privacyPage())
  );
  app.get('/terms', async (_request, reply) =>
    reply.type('text/html; charset=utf-8').send(termsPage())
  );
  app.post('/internal/v1/channel-events', async (request, reply) => {
    const event = ChannelEventSchema.parse(request.body);
    if (event.channel_account_id !== options.channelAccountId)
      return reply
        .status(403)
        .send({ error: { code: 'IDENTITY_SCOPE_INVALID', message: 'Akun kanal tidak sesuai.' } });
    if (!event.is_direct || event.is_from_bot) return reply.status(200).send({ ignored: true });
    const result = await options.store.ingest(event, now());
    if (result.collision)
      return reply
        .status(409)
        .send({ error: { code: 'DUPLICATE_EVENT_COLLISION', message: 'ID event bertabrakan.' } });
    return reply
      .status(result.duplicate ? 200 : 202)
      .send({ accepted: true, duplicate: result.duplicate });
  });
  const Account = z.object({ channel_account_id: z.string() }).strict();
  app.post('/internal/v1/deliveries/claim', async (request, reply) => {
    const body = Account.parse(request.body);
    if (body.channel_account_id !== options.channelAccountId)
      return reply.status(403).send({ error: { code: 'IDENTITY_SCOPE_INVALID' } });
    const delivery = await options.store.claimDelivery(body.channel_account_id);
    return {
      delivery: delivery
        ? {
            id: delivery.id,
            conversation_id: delivery.conversationId,
            text: delivery.body,
            lease_token: delivery.token,
          }
        : null,
    };
  });
  for (const action of ['ack', 'nack'] as const)
    app.post('/internal/v1/deliveries/:id/' + action, async (request, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = z
        .object({
          channel_account_id: z.string(),
          lease_token: z.string().min(16),
          remote_message_id: z.string().max(255).optional(),
          delivery_unknown: z.boolean().optional(),
        })
        .strict()
        .parse(request.body);
      if (body.channel_account_id !== options.channelAccountId)
        return reply.status(403).send({ error: { code: 'IDENTITY_SCOPE_INVALID' } });
      if (action === 'ack' && !body.remote_message_id)
        return reply.status(400).send({ error: { code: 'REMOTE_ID_REQUIRED' } });
      const ok =
        action === 'ack'
          ? await options.store.ackDelivery(
              body.channel_account_id,
              id,
              body.lease_token,
              body.remote_message_id ?? ''
            )
          : await options.store.nackDelivery(
              body.channel_account_id,
              id,
              body.lease_token,
              body.delivery_unknown ?? true
            );
      return reply.status(ok ? 200 : 409).send({ accepted: ok });
    });
  const browser = async (request: FastifyRequest, write = false) => {
    const session = await options.onboarding.session(cookie(request, 'sdj_session'));
    if (write) options.onboarding.checkCSRF(session, header(request, 'x-sdj-csrf'));
    return session;
  };
  for (const [name, asset] of onboardingAssets)
    app.get('/connect/assets/' + name, async (_request, reply) =>
      reply.type(asset.type).send(asset.body)
    );
  app.get('/connect', async (request, reply) => {
    const query = z
      .object({ token: z.string().min(20).max(200).optional() })
      .strict()
      .parse(request.query);
    if (query.token) {
      return reply.type('text/html; charset=utf-8').send(connectionEntryPage());
    }
    const session = await browser(request);
    return reply
      .type('text/html; charset=utf-8')
      .send(session.purpose === 'profile' ? profilePage() : connectionPage());
  });
  app.get('/connect/entry.js', async (_request, reply) =>
    reply.type('application/javascript').send(entryScript)
  );
  app.post('/connect/exchange', async (request, reply) => {
    if (
      header(request, 'origin') !== new URL(options.publicBaseUrl).origin ||
      header(request, 'x-sdj-onboarding') !== '1'
    )
      return reply.status(403).send({
        error: {
          code: 'ONBOARDING_ORIGIN_INVALID',
          message: 'Buka tautan dari WhatsApp di browser Anda.',
        },
      });
    const body = z
      .object({ token: z.string().regex(/^[A-Za-z0-9_-]{20,200}$/) })
      .strict()
      .parse(request.body);
    const result = await options.onboarding.exchange(body.token, cookie(request, 'sdj_session'));
    const secure = new URL(options.publicBaseUrl).protocol === 'https:' ? '; Secure' : '';
    reply.header('set-cookie', [
      `sdj_session=${result.cookie}; Path=/connect; HttpOnly; SameSite=Lax; Max-Age=600${secure}`,
      `sdj_csrf=${result.csrf}; Path=/connect; SameSite=Strict; Max-Age=600${secure}`,
    ]);
    return { url: '/connect' };
  });
  app.get('/connect/client.js', async (_request, reply) =>
    reply.type('application/javascript').send(clientScript)
  );
  app.get('/connect/profile.js', async (_request, reply) =>
    reply.type('application/javascript').send(profileScript)
  );
  app.get('/connect/status', async (request) => {
    const s = await browser(request);
    return { status: s.status, expires_at: s.expires_at.toISOString(), ai_allowed: s.ai_allowed };
  });
  app.post('/connect/google/start', async (request) => {
    const s = await browser(request, true);
    const body = z.object({ allow_ai: z.boolean() }).strict().parse(request.body);
    return { url: await options.onboarding.oauthStart(s, body.allow_ai) };
  });
  app.get('/connect/google/callback', async (request, reply) => {
    const s = await browser(request);
    const query = z
      .object({
        state: z.string().min(20).max(200),
        code: z.string().min(1).max(4096).optional(),
        error: z.string().max(150).optional(),
        error_description: z.string().max(1000).optional(),
        iss: z.literal('https://accounts.google.com').optional(),
        scope: z.string().optional(),
        authuser: z.string().optional(),
        prompt: z.string().optional(),
      })
      .strict()
      .parse(request.query);
    if (query.error) {
      if (!options.onboarding.oauthCancel)
        throw new DomainError(
          'OAUTH_STATE_INVALID',
          'Login Google tidak dapat dibatalkan dari sesi ini.'
        );
      await options.onboarding.oauthCancel(s, query.state);
      return reply.type('text/html; charset=utf-8').send(profileResultPage(false));
    }
    if (!query.code)
      throw new DomainError('OAUTH_STATE_INVALID', 'Kode login Google tidak tersedia.');
    await options.onboarding.oauthCallback(s, query.state, query.code);
    if (s.purpose === 'profile')
      return reply.type('text/html; charset=utf-8').send(profileResultPage(true));
    return reply.redirect('/connect');
  });
  app.get('/connect/picker', async (request) =>
    options.onboarding.picker(await browser(request, true))
  );
  app.post('/connect/tabs', async (request) => {
    const s = await browser(request, true);
    const body = z
      .object({ spreadsheet_id: z.string().regex(/^[A-Za-z0-9_-]{10,150}$/) })
      .strict()
      .parse(request.body);
    return { tabs: await options.onboarding.tabs(s, body.spreadsheet_id) };
  });
  app.post('/connect/tracker', async (request, reply) => {
    const s = await browser(request, true);
    const body = z
      .object({
        spreadsheet_id: z.string().regex(/^[A-Za-z0-9_-]{10,150}$/),
        sheet_id: z.number().int().nonnegative(),
        allow_ai: z.boolean().optional(),
        continuation_token: z.string().min(1).max(4096).optional(),
        repair_version: z.literal(1).optional(),
      })
      .strict()
      .parse(request.body);
    const configuration = await options.onboarding.select(
      s,
      body.spreadsheet_id,
      body.sheet_id,
      body.allow_ai,
      body.continuation_token
    );
    if (configuration && 'repairing' in configuration && body.repair_version !== 1)
      return reply.code(409).send({
        error: {
          code: 'CLIENT_UPDATE_REQUIRED',
          message:
            'Halaman penghubungan telah diperbarui. Muat ulang halaman ini untuk melanjutkan perbaikan otomatis.',
        },
      });
    if (configuration && 'repairing' in configuration)
      return reply.code(202).send({ accepted: false, ...configuration });
    return { accepted: true, ...(configuration ? { configuration } : {}) };
  });
  app.post('/connect/cancel', async (request) => {
    const s = await browser(request, true);
    await options.onboarding.cancel(s);
    return { cancelled: true };
  });
  return app;
}
