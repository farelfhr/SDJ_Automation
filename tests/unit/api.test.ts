import { describe, it, expect } from 'vitest';
import { runInNewContext } from 'node:vm';
import { createApp } from '../../apps/api/src/app.js';
import { MemoryStore, FakeClock, syntheticEvent } from '@sdj/testing';
import { signRequest, type BrowserOnboarding, type BrowserSession } from '@sdj/infrastructure';
const onboarding: BrowserOnboarding = {
  exchange: async () => {
    throw new Error('unused');
  },
  session: async () => {
    throw new Error('unused');
  },
  checkCSRF: () => {
    throw new Error('unused');
  },
  oauthStart: async () => {
    throw new Error('unused');
  },
  oauthCallback: async () => {
    throw new Error('unused');
  },
  picker: async () => {
    throw new Error('unused');
  },
  tabs: async () => {
    throw new Error('unused');
  },
  select: async () => {
    throw new Error('unused');
  },
  cancel: async () => {
    throw new Error('unused');
  },
};
function setup() {
  const clock = new FakeClock(),
    store = new MemoryStore(clock),
    key = 'c'.repeat(64);
  const app = createApp({
    store,
    onboarding,
    channelKey: key,
    channelKeyId: 'main-v1',
    channelAccountId: 'synthetic-bot',
    publicBaseUrl: 'http://localhost:3000',
    now: () => clock.now(),
  });
  const headers = (raw: string, nonce = crypto.randomUUID()) => {
    const stamp = String(Math.floor(clock.now().getTime() / 1000));
    return {
      'content-type': 'application/json',
      'x-sdj-key-id': 'main-v1',
      'x-sdj-timestamp': stamp,
      'x-sdj-nonce': nonce,
      'x-sdj-signature': signRequest(key, stamp, nonce, raw),
    };
  };
  return { app, store, clock, headers };
}
describe('HTTP ingress terautentikasi', () => {
  it('menyediakan aset pendaftaran terpilih tanpa membuka file workspace lain', async () => {
    const s = setup();
    for (const [asset, type] of [
      ['onboarding.css', 'text/css'],
      ['sdj-mascot.png', 'image/png'],
      ['rumah-kepemimpinan.png', 'image/png'],
      ['jakarta-regular.ttf', 'font/ttf'],
    ]) {
      const response = await s.app.inject('/connect/assets/' + asset);
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain(type);
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(response.headers['content-security-policy']).toContain("font-src 'self'");
      expect(response.rawPayload.length).toBeGreaterThan(1000);
    }
    expect((await s.app.inject('/connect/assets/.env')).statusCode).toBe(404);
    expect((await s.app.inject('/connect/assets/unknown.png')).statusCode).toBe(404);
    const head = await s.app.inject({ method: 'HEAD', url: '/connect/assets/sdj-mascot.png' });
    expect(head.statusCode).toBe(200);
    expect(head.body).toBe('');
    expect(s.store.messages.size).toBe(0);
    await s.app.close();
  });
  it('menyediakan halaman branding publik dan informasi privasi tanpa sesi login', async () => {
    const s = setup();
    for (const [path, title] of [
      ['/', 'Catat aktivitas Anda'],
      ['/privacy', 'Kebijakan Privasi'],
      ['/terms', 'Ketentuan Penggunaan'],
    ] as const) {
      const response = await s.app.inject(path);
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(response.body).toContain(title);
      expect(response.body).toContain('href="/privacy"');
      expect(response.body).toContain('href="/terms"');
      expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    }
    expect(s.store.messages.size).toBe(0);
    await s.app.close();
  });
  it('browser setelah OAuth memulihkan izin AI dari sesi dan mengirim pilihan terkini', async () => {
    const s = setup();
    const script = (await s.app.inject('/connect/client.js')).body;
    type Element = {
      checked: boolean;
      textContent: string;
      hidden: boolean;
      className: string;
      disabled: boolean;
      setAttribute: (key: string, value: string) => void;
      removeAttribute: (key: string) => void;
      onclick?: () => Promise<void>;
    };
    const elements = new Map<string, Element>();
    const element = (selector: string): Element => {
      if (!elements.has(selector))
        elements.set(selector, {
          checked: false,
          textContent: '',
          hidden: false,
          className: '',
          disabled: false,
          setAttribute: () => {},
          removeAttribute: () => {},
        });
      return elements.get(selector)!;
    };
    const payloads: unknown[] = [];
    runInNewContext(script, {
      document: { querySelector: element, cookie: 'sdj_csrf=synthetic-csrf' },
      location: { assign: () => {} },
      fetch: async (path: string, init?: RequestInit) => {
        if (path === '/connect/status')
          return Response.json({ status: 'file_selection', ai_allowed: true });
        payloads.push(JSON.parse(String(init?.body)));
        return Response.json({ url: 'https://accounts.google.com/synthetic' });
      },
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(element('#ai').checked).toBe(true);
    expect(element('#status').textContent).toContain('Akun Google terhubung');
    expect(element('#google-panel').hidden).toBe(true);
    expect(element('#sheet-panel').hidden).toBe(false);
    element('#ai').checked = false;
    await element('#google').onclick?.();
    expect(payloads).toEqual([{ allow_ai: false }]);
    await s.app.close();
  });
  it('menerima callback Google dengan issuer resmi dan menolak issuer lain', async () => {
    const clock = new FakeClock(),
      store = new MemoryStore(clock);
    const state = 'synthetic-state-with-enough-characters';
    const session: BrowserSession = {
      id: crypto.randomUUID(),
      user_id: crypto.randomUUID(),
      identity_id: crypto.randomUUID(),
      source_message_id: crypto.randomUUID(),
      status: 'oauth_pending',
      expires_at: new Date(Date.now() + 600000),
      csrf_hash: null,
      oauth_state_hash: null,
      pkce_ciphertext: null,
      pending_google_connection_id: null,
      pending_tracker_id: null,
      channel_challenge_hash: null,
      challenge_attempts: 0,
      ai_allowed: false,
    };
    let calls = 0;
    const app = createApp({
      store,
      onboarding: {
        ...onboarding,
        session: async () => session,
        oauthCallback: async (s, receivedState, code) => {
          expect(s).toBe(session);
          expect(receivedState).toBe(state);
          expect(code).toBe('synthetic-code');
          calls++;
        },
      },
      channelKey: 'c'.repeat(64),
      channelKeyId: 'synthetic',
      channelAccountId: 'synthetic',
      publicBaseUrl: 'http://localhost:3000',
    });
    const query = new URLSearchParams({
      state,
      code: 'synthetic-code',
      iss: 'https://accounts.google.com',
      scope: 'openid https://www.googleapis.com/auth/drive.file',
      authuser: '0',
      prompt: 'consent',
    });
    const valid = await app.inject('/connect/google/callback?' + query);
    expect(valid.statusCode).toBe(302);
    expect(valid.headers.location).toBe('/connect');
    expect(calls).toBe(1);
    query.set('iss', 'https://untrusted.example');
    expect((await app.inject('/connect/google/callback?' + query)).statusCode).toBe(400);
    expect(calls).toBe(1);
    await app.close();
  });
  it('mengirim referrer hanya origin untuk Picker dan tidak membocorkan tautan onboarding', async () => {
    const s = setup();
    const result = await s.app.inject({ method: 'GET', url: '/connect/client.js' });
    expect(result.headers['referrer-policy']).toBe('strict-origin');
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.headers['content-security-policy']).toContain("frame-ancestors 'none'");
  });
  it('tanpa signature atau signature palsu ditolak sebelum menyimpan', async () => {
    const s = setup(),
      raw = JSON.stringify(syntheticEvent('zuhur 3'));
    expect(
      (
        await s.app.inject({
          method: 'POST',
          url: '/internal/v1/channel-events',
          payload: raw,
          headers: { 'content-type': 'application/json' },
        })
      ).statusCode
    ).toBe(401);
    const h = s.headers(raw);
    h['x-sdj-signature'] = '0'.repeat(64);
    expect(
      (
        await s.app.inject({
          method: 'POST',
          url: '/internal/v1/channel-events',
          payload: raw,
          headers: h,
        })
      ).statusCode
    ).toBe(401);
    expect(s.store.messages.size).toBe(0);
    await s.app.close();
  });
  it('ack 202 setelah persistence, duplicate 200, nonce replay 401', async () => {
    const s = setup(),
      raw = JSON.stringify(syntheticEvent('zuhur 3')),
      h = s.headers(raw);
    expect(
      (
        await s.app.inject({
          method: 'POST',
          url: '/internal/v1/channel-events',
          payload: raw,
          headers: h,
        })
      ).statusCode
    ).toBe(202);
    expect(s.store.messages.size).toBe(1);
    expect(s.store.jobs.size).toBe(1);
    expect(
      (
        await s.app.inject({
          method: 'POST',
          url: '/internal/v1/channel-events',
          payload: raw,
          headers: h,
        })
      ).statusCode
    ).toBe(401);
    expect(
      (
        await s.app.inject({
          method: 'POST',
          url: '/internal/v1/channel-events',
          payload: raw,
          headers: s.headers(raw),
        })
      ).statusCode
    ).toBe(200);
    await s.app.close();
  });
  it('scope akun, body spoofing, dan echo/group dibatasi', async () => {
    const s = setup();
    for (const [event, code] of [
      [{ ...syntheticEvent('x'), channel_account_id: 'other' }, 403],
      [{ ...syntheticEvent('x'), user_id: 'other' }, 400],
      [{ ...syntheticEvent('x'), is_from_bot: true }, 200],
      [{ ...syntheticEvent('x'), is_direct: false }, 200],
    ] as const) {
      const raw = JSON.stringify(event);
      expect(
        (
          await s.app.inject({
            method: 'POST',
            url: '/internal/v1/channel-events',
            payload: raw,
            headers: s.headers(raw),
          })
        ).statusCode
      ).toBe(code);
    }
    expect(s.store.messages.size).toBe(0);
    await s.app.close();
  });
  it('endpoint bypass lama tidak tersedia dan health tidak memanggil AI', async () => {
    const s = setup();
    expect((await s.app.inject('/api/users/other')).statusCode).toBe(404);
    expect((await s.app.inject('/health/live')).json()).toEqual({ status: 'ok' });
    expect((await s.app.inject('/health/ready')).statusCode).toBe(200);
    await s.app.close();
  });
});
