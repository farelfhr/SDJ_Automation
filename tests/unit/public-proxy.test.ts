import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error Local JavaScript launcher has no declaration file.
import { createPublicProxy } from '../../scripts/public-proxy.mjs';

const servers: Server[] = [];
async function listen(server: Server): Promise<number> {
  servers.push(server);
  await new Promise<void>((accept) => server.listen(0, '127.0.0.1', accept));
  return (server.address() as AddressInfo).port;
}
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((accept) => {
          server.close(() => accept());
          server.closeAllConnections();
        })
    )
  );
});
describe('Public onboarding tunnel', () => {
  it('passes OAuth query/cookies and CSRF POST intact but keeps internal paths private', async () => {
    const received: { url: string; cookie: string; csrf: string; body: string }[] = [];
    const api = createServer(async (req, res) => {
      let body = '';
      for await (const chunk of req) body += chunk;
      received.push({
        url: req.url ?? '',
        cookie: req.headers.cookie ?? '',
        csrf: String(req.headers['x-sdj-csrf'] ?? ''),
        body,
      });
      res.setHeader('set-cookie', [
        'sdj_session=synthetic; Path=/connect; Secure; HttpOnly',
        'sdj_csrf=synthetic; Path=/connect; Secure',
      ]);
      res.writeHead(302, { location: '/connect' }).end();
    });
    const apiPort = await listen(api);
    const base = `http://127.0.0.1:${await listen(createPublicProxy(apiPort))}`;
    const callback = await fetch(`${base}/connect/google/callback?code=synthetic&state=synthetic`, {
      redirect: 'manual',
      headers: { cookie: 'sdj_session=synthetic' },
    });
    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toBe('/connect');
    expect(callback.headers.getSetCookie()).toHaveLength(2);
    const payload = JSON.stringify({ allow_ai: true });
    await fetch(`${base}/connect/google/start`, {
      method: 'POST',
      body: payload,
      headers: { 'content-type': 'application/json', 'x-sdj-csrf': 'synthetic' },
      redirect: 'manual',
    });
    expect(received).toEqual([
      {
        url: '/connect/google/callback?code=synthetic&state=synthetic',
        cookie: 'sdj_session=synthetic',
        csrf: '',
        body: '',
      },
      { url: '/connect/google/start', cookie: '', csrf: 'synthetic', body: payload },
    ]);
    for (const path of [
      '/internal/v1/channel-events',
      '/health/ready',
      '/connect/../internal/v1/channel-events',
      '/connect/%2e%2e/internal/v1/channel-events',
      '/connect%2f..%2finternal/v1/channel-events',
      '/connect/unknown',
    ]) {
      expect((await fetch(`${base}${path}`)).status).toBe(404);
    }
    expect((await fetch(`${base}/connect/status`, { method: 'POST' })).status).toBe(404);
    expect(received).toHaveLength(2);
    for (const path of ['/', '/privacy', '/terms']) {
      expect((await fetch(`${base}${path}`, { redirect: 'manual' })).status).toBe(302);
    }
    expect(received.slice(2).map((entry) => entry.url)).toEqual(['/', '/privacy', '/terms']);
    expect((await fetch(`${base}/privacy`, { method: 'POST' })).status).toBe(404);
    expect(received).toHaveLength(5);
    await fetch(`${base}/connect/entry.js`, { redirect: 'manual' });
    await fetch(`${base}/connect/exchange`, {
      method: 'POST',
      redirect: 'manual',
      body: JSON.stringify({ token: 'synthetic-token' }),
      headers: {
        'content-type': 'application/json',
        origin: 'https://synthetic.example',
        'x-sdj-onboarding': '1',
      },
    });
    expect(received.slice(5).map((entry) => entry.url)).toEqual([
      '/connect/entry.js',
      '/connect/exchange',
    ]);
    expect(
      (await fetch(`${base}/connect?token=synthetic`, { method: 'HEAD', redirect: 'manual' }))
        .status
    ).toBe(302);
    expect(received.at(-1)?.url).toBe('/connect?token=synthetic');
    expect((await fetch(`${base}/connect/exchange`)).status).toBe(404);
    for (const asset of [
      'onboarding.css',
      'sdj-mascot.png',
      'rumah-kepemimpinan.png',
      'jakarta-regular.ttf',
    ]) {
      expect((await fetch(`${base}/connect/assets/${asset}`, { redirect: 'manual' })).status).toBe(
        302
      );
    }
    expect((await fetch(`${base}/connect/assets/.env`)).status).toBe(404);
    expect((await fetch(`${base}/connect/assets/onboarding.css`, { method: 'POST' })).status).toBe(
      404
    );
    expect((await fetch(`${base}/connect/profile.js`, { redirect: 'manual' })).status).toBe(302);
    expect((await fetch(`${base}/connect/profile.js`, { method: 'POST' })).status).toBe(404);
  });
});
