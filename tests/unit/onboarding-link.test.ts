import { describe, expect, it, vi } from 'vitest';
import { runInNewContext } from 'node:vm';
import { DomainError } from '@sdj/domain';
import { MemoryStore, FakeClock } from '@sdj/testing';
import type { BrowserOnboarding } from '@sdj/infrastructure';
import { createApp } from '../../apps/api/src/app.js';

const token = 'synthetic-link-with-enough-characters';
function setup(overrides: Partial<BrowserOnboarding> = {}) {
  const exchange = vi.fn(async (_token: string, _cookie?: string) => ({
    cookie: 'synthetic-bound-browser',
    csrf: 'synthetic-csrf',
  }));
  const app = createApp({
    store: new MemoryStore(new FakeClock()),
    onboarding: {
      exchange,
      session: async () => {
        throw new DomainError('ONBOARDING_EXPIRED', 'Sesi kedaluwarsa.');
      },
      checkCSRF: () => undefined,
      oauthStart: async () => 'https://accounts.google.com/synthetic',
      oauthCallback: async () => undefined,
      picker: async () => ({ accessToken: 'synthetic', apiKey: 'synthetic', appId: '123' }),
      tabs: async () => [],
      select: async () => undefined,
      cancel: async () => undefined,
      ...overrides,
    },
    channelKey: 'c'.repeat(64),
    channelKeyId: 'synthetic',
    channelAccountId: 'synthetic-bot',
    publicBaseUrl: 'https://app.synthetic.example',
  });
  return { app, exchange };
}

describe('Onboarding links in mobile browsers', () => {
  it('returns the detected configuration for review before DM activation', async () => {
    const configuration = {
      mode: 'adapted' as const,
      activityCount: 15,
      dateCount: 31,
      dateFrom: '2026-10-01',
      dateTo: '2026-10-31',
      repairedValidationCells: 2,
      resetInputCells: 1,
    };
    const select = vi.fn(async () => configuration);
    const { app } = setup({
      session: async () => ({
        id: crypto.randomUUID(),
        user_id: crypto.randomUUID(),
        identity_id: crypto.randomUUID(),
        source_message_id: crypto.randomUUID(),
        status: 'file_selection',
        expires_at: new Date(Date.now() + 600000),
        csrf_hash: null,
        oauth_state_hash: null,
        pkce_ciphertext: null,
        pending_google_connection_id: crypto.randomUUID(),
        pending_tracker_id: null,
        channel_challenge_hash: null,
        challenge_attempts: 0,
        ai_allowed: false,
      }),
      select,
    });
    const response = await app.inject({
      method: 'POST',
      url: '/connect/tracker',
      payload: { spreadsheet_id: 'synthetic-spreadsheet', sheet_id: 7, allow_ai: false },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ accepted: true, configuration });
    expect(select).toHaveBeenCalledTimes(1);
    await app.close();
  });
  it('does not consume tokens for previews, repeated GETs, or HEAD requests', async () => {
    const { app, exchange } = setup();
    for (const method of ['GET', 'GET', 'HEAD'] as const) {
      const response = await app.inject({ method, url: '/connect?token=' + token });
      expect(response.statusCode).toBe(200);
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(response.headers['cache-control']).toBe('no-store');
      if (method === 'GET') {
        expect(response.body).toContain('Lanjutkan');
        expect(response.body).not.toContain(token);
      }
    }
    expect(exchange).not.toHaveBeenCalled();
    await app.close();
  });

  it('requires same-origin explicit POST and passes the existing browser cookie for safe resume', async () => {
    const { app, exchange } = setup();
    for (const origin of ['', 'null', 'https://other.synthetic.example']) {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/connect/exchange',
            payload: { token },
            headers: { origin, 'x-sdj-onboarding': '1' },
          })
        ).statusCode
      ).toBe(403);
    }
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/connect/exchange',
          payload: { token },
          headers: { origin: 'https://app.synthetic.example' },
        })
      ).statusCode
    ).toBe(403);
    expect(exchange).not.toHaveBeenCalled();
    const response = await app.inject({
      method: 'POST',
      url: '/connect/exchange',
      payload: { token },
      headers: {
        origin: 'https://app.synthetic.example',
        'x-sdj-onboarding': '1',
        cookie: 'sdj_session=synthetic-existing-cookie',
      },
    });
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(exchange).toHaveBeenCalledWith(token, 'synthetic-existing-cookie');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ url: '/connect' });
    const cookies = response.headers['set-cookie'] as string[];
    expect(cookies[0]).toContain('HttpOnly; SameSite=Lax; Max-Age=600; Secure');
    expect(cookies[1]).toContain('SameSite=Strict; Max-Age=600; Secure');
    await app.close();
  });

  it('shows a useful recovery page for expired browser sessions while API errors remain JSON', async () => {
    const { app } = setup();
    const response = await app.inject('/connect');
    expect(response.statusCode).toBe(401);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('Kirim <strong>daftar</strong> satu kali');
    expect(response.body).toContain('browser yang sama');
    const status = await app.inject('/connect/status');
    expect(status.headers['content-type']).toContain('application/json');
    expect(status.json().error.code).toBe('ONBOARDING_EXPIRED');
    await app.close();
  });

  it('executes no exchange at script load and prevents duplicate clicks during exchange', async () => {
    const { app } = setup();
    const script = (await app.inject('/connect/entry.js')).body;
    const button = { disabled: false, onclick: async () => {} };
    const status = { textContent: '' };
    let finish!: (response: Response) => void;
    const result = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    const fetch = vi.fn(() => result);
    const replace = vi.fn();
    runInNewContext(script, {
      URLSearchParams,
      location: { search: '?token=' + token, replace },
      fetch,
      document: { querySelector: (selector: string) => (selector === '#begin' ? button : status) },
    });
    expect(fetch).not.toHaveBeenCalled();
    const first = button.onclick();
    await button.onclick();
    expect(fetch).toHaveBeenCalledTimes(1);
    finish(Response.json({ url: '/connect' }));
    await first;
    expect(replace).toHaveBeenCalledWith('/connect');
    await app.close();
  });
});
