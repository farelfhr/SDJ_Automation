import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
// Runtime source is dependency-free so the host never imports backend credentials.
// @ts-expect-error The plugin is a native ESM module loaded directly by OpenClaw.
// prettier-ignore
import { createBridge, normalizeInbound, formatForGateway } from '../../packages/openclaw-bridge/index.mjs';
const key = 'ab'.repeat(32),
  account = 'synthetic-bot';
const context = {
  channelId: 'whatsapp',
  accountId: account,
  senderId: 'synthetic-sender',
  conversationId: 'synthetic-dm',
  messageId: 'synthetic-message',
};
const event = {
  messageId: context.messageId,
  content: 'zuhur 3',
  isGroup: false,
  timestamp: Date.now(),
};
describe('OpenClaw bridge contract', () => {
  it('mengubah bold native sekali sebelum adapter CommonMark tanpa mengubah quote atau numbering', () => {
    const text = '*Catatanmu tersimpan*\n\n- Zuhur: *3/3*\n1. Langkah\n\n> Kirim batal';
    const result = formatForGateway(text);
    expect(result).toBe('**Catatanmu tersimpan**\n\n- Zuhur: **3/3**\n1. Langkah\n\n> Kirim batal');
    expect(formatForGateway(result)).toBe(result);
  });
  it('balasan DM menuju pengirim terverifikasi meski conversationId adalah akun bot', () => {
    const first = normalizeInbound(
      event,
      { ...context, conversationId: 'synthetic-bot-recipient' },
      account
    );
    const second = normalizeInbound(
      { ...event, senderId: 'synthetic-second' },
      { ...context, senderId: 'synthetic-second', conversationId: 'synthetic-bot-recipient' },
      account
    );
    expect(first.conversation_id).toBe('synthetic-sender');
    expect(second.conversation_id).toBe('synthetic-second');
    expect(first.conversation_id).not.toBe(second.conversation_id);
  });
  it('menolak metadata hilang, grup, timestamp palsu dan account lain', () => {
    expect(normalizeInbound(event, context, account)).toMatchObject({
      sender_id: context.senderId,
      event_id: context.messageId,
    });
    for (const [e, c] of [
      [{ ...event, isGroup: true }, context],
      [event, { ...context, senderId: undefined }],
      [{ ...event, timestamp: undefined }, context],
      [event, { ...context, accountId: 'other' }],
    ])
      expect(normalizeInbound(e, c, account)).toBeNull();
  });
  it('ingress menandatangani body asli dan menghentikan model default', async () => {
    let calls = 0;
    const bridge = createBridge({
      key,
      keyId: 'synthetic-key',
      accountId: account,
      apiBaseUrl: 'http://127.0.0.1:3000',
      request: async (input: URL, init: RequestInit) => {
        calls++;
        expect(input.pathname).toBe('/internal/v1/channel-events');
        const h = init.headers as Record<string, string>;
        const signature = createHmac('sha256', Buffer.from(key, 'hex'))
          .update(h['x-sdj-timestamp'] + '\n' + h['x-sdj-nonce'] + '\n' + init.body)
          .digest('hex');
        expect(h['x-sdj-signature']).toBe(signature);
        return Response.json({ accepted: true });
      },
    });
    expect(await bridge.inbound(event, context)).toEqual({ handled: true });
    expect(await bridge.inbound({ ...event, isGroup: true }, context)).toEqual({ handled: true });
    expect(calls).toBe(1);
  });
  it('delivery retry tidak memproses ulang command; timeout kirim menjadi unknown', async () => {
    const paths: string[] = [];
    const bridge = createBridge({
      key,
      keyId: 'synthetic-key',
      accountId: account,
      apiBaseUrl: 'http://localhost:3000',
      request: async (input: URL) => {
        paths.push(input.pathname);
        return Response.json(
          input.pathname.endsWith('/claim')
            ? {
                delivery: {
                  id: 'synthetic-id',
                  conversation_id: 'synthetic-dm',
                  text: 'synthetic reply',
                  lease_token: 'synthetic-lease-token',
                },
              }
            : { accepted: true }
        );
      },
    });
    await bridge.deliverOne(async () => {
      throw new Error('ambiguous timeout');
    });
    expect(paths).toEqual([
      '/internal/v1/deliveries/claim',
      '/internal/v1/deliveries/synthetic-id/nack',
    ]);
  });
  it('mengirim ke route outbox dan ack dengan id platform', async () => {
    let body: unknown;
    const bridge = createBridge({
      key,
      keyId: 'synthetic-key',
      accountId: account,
      apiBaseUrl: 'http://localhost:3000',
      request: async (input: URL, init: RequestInit) => {
        if (input.pathname.endsWith('/claim'))
          return Response.json({
            delivery: {
              id: 'synthetic-id',
              conversation_id: 'trusted-dm',
              text: 'synthetic reply',
              lease_token: 'synthetic-lease-token',
            },
          });
        body = JSON.parse(String(init.body));
        return Response.json({ accepted: true });
      },
    });
    await bridge.deliverOne(async (to: string, text: string) => {
      expect(to).toBe('trusted-dm');
      expect(text).toBe('synthetic reply');
      return 'remote-synthetic';
    });
    expect(body).toMatchObject({ remote_message_id: 'remote-synthetic' });
  });
  it('menolak HTTP non-loopback', () => {
    expect(() =>
      createBridge({ key, apiBaseUrl: 'http://example.com', accountId: account })
    ).toThrow('HTTPS_REQUIRED');
  });
});
