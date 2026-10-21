import { createServer, request } from 'node:http';

const routes = new Map([
  ['/', ['GET']],
  ['/privacy', ['GET']],
  ['/terms', ['GET']],
  ['/connect', ['GET', 'HEAD']],
  ['/connect/entry.js', ['GET']],
  ['/connect/exchange', ['POST']],
  ['/connect/client.js', ['GET']],
  ['/connect/profile.js', ['GET']],
  ...[
    'rumah-kepemimpinan.png',
    'sdj-mascot.png',
    'jakarta-regular.ttf',
    'jakarta-bold.ttf',
    'jakarta-extra-bold.ttf',
    'onboarding.css',
  ].map((name) => ['/connect/assets/' + name, ['GET', 'HEAD']]),
  ['/connect/status', ['GET']],
  ['/connect/google/start', ['POST']],
  ['/connect/google/callback', ['GET']],
  ['/connect/picker', ['GET']],
  ['/connect/tabs', ['POST']],
  ['/connect/tracker', ['POST']],
  ['/connect/cancel', ['POST']],
]);

function headersForProxy(headers) {
  const excluded = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
    ...(headers.connection ?? '')
      .toLowerCase()
      .split(',')
      .map((name) => name.trim()),
  ]);
  return Object.fromEntries(Object.entries(headers).filter(([key]) => !excluded.has(key)));
}

export function createPublicProxy(apiPort) {
  return createServer({ requestTimeout: 30_000, headersTimeout: 15_000 }, (incoming, outgoing) => {
    const path = (incoming.url ?? '').split('?')[0];
    outgoing.setHeader('cache-control', 'no-store');
    outgoing.setHeader('referrer-policy', 'no-referrer');
    if (!routes.get(path)?.includes(incoming.method ?? '')) {
      outgoing.writeHead(404).end();
      incoming.resume();
      return;
    }
    const headers = headersForProxy(incoming.headers);
    headers.host = `127.0.0.1:${apiPort}`;
    const upstream = request(
      {
        hostname: '127.0.0.1',
        port: apiPort,
        method: incoming.method,
        path: incoming.url,
        headers,
        timeout: 30_000,
      },
      (response) => {
        outgoing.writeHead(response.statusCode ?? 502, headersForProxy(response.headers));
        response.on('error', () => outgoing.destroy());
        response.pipe(outgoing);
      }
    );
    upstream.on('timeout', () => upstream.destroy());
    upstream.on('error', () => {
      if (!outgoing.headersSent) outgoing.writeHead(502).end();
      else outgoing.destroy();
    });
    incoming.on('aborted', () => upstream.destroy());
    outgoing.on('close', () => {
      if (!outgoing.writableFinished) upstream.destroy();
    });
    incoming.pipe(upstream);
  });
}
