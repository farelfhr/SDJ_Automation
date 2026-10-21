import { createHmac, randomBytes } from 'node:crypto';

export function normalizeInbound(event, context, accountId) {
  if (context.channelId !== 'whatsapp' || context.accountId !== accountId) return null;
  if (event.isGroup !== false || !context.senderId || !context.conversationId || !context.messageId)
    return null;
  if (event.messageId && event.messageId !== context.messageId) return null;
  if (event.senderId && event.senderId !== context.senderId) return null;
  // The host's WhatsApp adapter must filter fromMe/history before invoking this hook (G0).
  // Never invent timestamps/IDs or extract actor identity from message text.
  if (
    !Number.isFinite(event.timestamp) ||
    event.timestamp < 1000000000000 ||
    event.timestamp > Date.now() + 60000
  )
    return null;
  if (typeof event.content !== 'string' || !event.content.trim() || event.content.length > 1000)
    return null;
  return {
    version: 1,
    event_id: context.messageId,
    channel: 'whatsapp',
    channel_account_id: accountId,
    sender_id: context.senderId,
    // OpenClaw 2026.10.3 before_dispatch may expose the bot recipient as conversationId.
    // For an authenticated WhatsApp DM, the verified sender is the reply destination.
    // The pinned WhatsApp adapter supplies E.164/JID/LID here; no body text is consulted.
    conversation_id: context.senderId,
    is_direct: true,
    is_from_bot: false,
    sent_at: new Date(event.timestamp).toISOString(),
    text: event.content,
  };
}

export function createBridge(options) {
  const base = new URL(options.apiBaseUrl);
  if (
    !['http:', 'https:'].includes(base.protocol) ||
    (base.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))
  )
    throw new Error('BRIDGE_HTTPS_REQUIRED');
  if (base.username || base.password || base.pathname !== '/' || base.search || base.hash)
    throw new Error('BRIDGE_ORIGIN_REQUIRED');
  if (!/^[a-f0-9]{64}$/i.test(options.key)) throw new Error('BRIDGE_KEY_INVALID');
  const request = options.request ?? fetch;
  async function post(path, body) {
    const raw = JSON.stringify(body),
      timestamp = String(Math.floor(Date.now() / 1000)),
      nonce = randomBytes(18).toString('hex');
    const signature = createHmac('sha256', Buffer.from(options.key, 'hex'))
      .update(timestamp + '\n' + nonce + '\n' + raw)
      .digest('hex');
    const response = await request(new URL(path, base), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-sdj-key-id': options.keyId,
        'x-sdj-timestamp': timestamp,
        'x-sdj-nonce': nonce,
        'x-sdj-signature': signature,
      },
      body: raw,
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) throw new Error('BRIDGE_API_REJECTED');
    return response.json();
  }
  return {
    async inbound(event, context) {
      if (context.channelId !== 'whatsapp') return;
      // This gateway is dedicated to SDJ. Missing metadata never falls through to an agent.
      const payload = normalizeInbound(event, context, options.accountId);
      if (!payload) return { handled: true };
      try {
        await post('/internal/v1/channel-events', payload);
      } catch {
        options.report?.('BRIDGE_INGRESS_UNCONFIRMED');
        return {
          handled: true,
          text: '**Pesanmu belum dapat dipastikan**\n\nAku belum bisa mengonfirmasi penerimaan pesan ini.\n\n> Periksa status koneksi sebelum mencatat kembali.',
        };
      }
      return { handled: true };
    },
    async deliverOne(send) {
      const result = await post('/internal/v1/deliveries/claim', {
        channel_account_id: options.accountId,
      });
      const d = result?.delivery;
      if (!d) return false;
      if (
        typeof d.id !== 'string' ||
        typeof d.lease_token !== 'string' ||
        typeof d.conversation_id !== 'string' ||
        typeof d.text !== 'string'
      )
        throw new Error('BRIDGE_DELIVERY_INVALID');
      let remote;
      try {
        remote = await send(d.conversation_id, d.text);
      } catch {
        await post('/internal/v1/deliveries/' + encodeURIComponent(d.id) + '/nack', {
          channel_account_id: options.accountId,
          lease_token: d.lease_token,
          delivery_unknown: true,
        });
        return true;
      }
      if (typeof remote !== 'string' || !remote) {
        await post('/internal/v1/deliveries/' + encodeURIComponent(d.id) + '/nack', {
          channel_account_id: options.accountId,
          lease_token: d.lease_token,
          delivery_unknown: true,
        });
        return true;
      }
      await post('/internal/v1/deliveries/' + encodeURIComponent(d.id) + '/ack', {
        channel_account_id: options.accountId,
        lease_token: d.lease_token,
        remote_message_id: remote,
      });
      return true;
    },
  };
}

/** @param {import('openclaw/plugin-sdk/core').OpenClawPluginApi} api */
export function register(api) {
  const config = api.pluginConfig ?? {};
  const bridge = createBridge({
    ...config,
    key: process.env[config.keyEnv] ?? '',
    report: (code) => api.logger.warn(code),
  });
  api.on('before_dispatch', (event, ctx) => bridge.inbound(event, ctx), { priority: 1000 });
  let timer,
    busy = false,
    stopping = false;
  api.registerService({
    id: 'sdj-outbox',
    start: () => {
      stopping = false;
      timer = setInterval(async () => {
        if (busy || stopping) return;
        busy = true;
        try {
          const adapter = await api.runtime.channel.outbound.loadAdapter('whatsapp');
          if (!adapter?.sendText) throw new Error('WHATSAPP_ADAPTER_UNAVAILABLE');
          await bridge.deliverOne(async (to, text) => {
            const sent = await adapter.sendText({
              cfg: api.config,
              accountId: config.accountId,
              to,
              text: formatForGateway(text),
              signal: AbortSignal.timeout(10000),
            });
            return sent.messageId;
          });
        } catch {
          api.logger.warn('BRIDGE_DELIVERY_CHECK_FAILED');
        } finally {
          busy = false;
        }
      }, config.pollIntervalMs ?? 2000);
      timer.unref();
    },
    stop: () => {
      stopping = true;
      clearInterval(timer);
    },
  });
}
export default { id: 'sdj-bridge', name: 'SDJ channel bridge', register };

/** The installed adapter converts CommonMark to WhatsApp. Preserve our native bold across that boundary. */
export function formatForGateway(text) {
  return text.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '**$1**');
}
