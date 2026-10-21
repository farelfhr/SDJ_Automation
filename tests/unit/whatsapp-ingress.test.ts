import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
// @ts-expect-error Version-pinned ESM deployment patch has no declaration file.
import * as ingressPatch from '../../scripts/patch-whatsapp-ingress.mjs';
const { patchIngressSource, sdjAdmitWhatsAppContent } = ingressPatch;

const upstream = readFileSync(
  new URL('../fixtures/openclaw-2026.10.3-ingress.txt', import.meta.url),
  'utf8'
);
type Message = {
  key: { remoteJid: string; id: string; fromMe?: boolean };
  message?: { conversation: string };
  messageStubType?: number;
};
const key = { remoteJid: 'synthetic@lid', id: 'synthetic-first-message' };
const content = (value: Message['message']) => Boolean(value?.conversation);
const real: Message = { key, message: { conversation: 'daftar' } };
const stub: Message = { key, messageStubType: 2 };

function adapter(
  source: string,
  resolution: () => Promise<string | null> = async () => '+620000000000'
) {
  const completed = new Set<string>();
  const delivered: Message[] = [];
  const diagnostics: string[] = [];
  const context = {
    createHash,
    process: { stderr: { write: (value: string) => diagnostics.push(value) } },
    hasInboundUserContent: content,
    isJidGroup$1: (jid: string) => jid.endsWith('@g.us'),
    isRecentOutboundMessage: () => false,
    checkInboundAccessControl: async (value: { group: boolean; isFromMe: boolean }) => ({
      allowed: !value.group && !value.isFromMe,
    }),
    rememberBaileysMessage: () => {},
    nextReceiveOrder: 0,
    resolveApprovalReaction: async () => false,
    inboundLogger: { warn: () => {}, error: () => {} },
    inboundConsoleLog: { error: () => {} },
    formatError: () => 'synthetic-error',
    shouldSkipStaleAppend: () => false,
    shouldSkipRecentOutboundEcho: () => false,
    createWhatsAppDurableInboundMessageId: ({ remoteJid, id }: Message['key']) =>
      `${remoteJid}:${id}`,
    preparedInboundByDurableId: new Map(),
    createDeferred: () => {
      let resolve!: (value: unknown) => void;
      const promise = new Promise((done) => {
        resolve = done;
      });
      return { resolve, promise };
    },
    // Model the native completion contract: normalization null consumes the ID;
    // decrypted redelivery with the same ID then returns "completed".
    durableInboundMonitor: {
      admit: async ({ message }: { message: Message }) => {
        const id = `${message.key.remoteJid}:${message.key.id}`;
        if (completed.has(id)) return { kind: 'durable', queueResult: { kind: 'completed' } };
        completed.add(id);
        if (content(message.message)) delivered.push(message);
        return { kind: 'durable', queueResult: { kind: 'accepted' } };
      },
    },
    normalizeInboundMessage: async (message: Message) => (content(message.message) ? {} : null),
    maybeMarkNonSelfChatReadReceipt: async () => {},
    buildReadReceiptTarget: () => ({}),
    socketSession: { resolveInboundJid: resolution, self: {} },
  };
  const runtime = runInNewContext(
    `${source}\n({handleMessagesUpsert, normalizer: createWhatsAppInboundMessageNormalizer({
      socketSession, groupMetadata: {get: async () => ({})}, accountId: 'synthetic', parseTimestampSeconds: () => undefined,
      logVerbose: () => {}
    })})`,
    context
  ) as {
    handleMessagesUpsert: (upsert: { type: string; messages: Message[] }) => Promise<void>;
    normalizer: {
      normalize: (message: Message) => Promise<{ from: string; senderE164: string } | null>;
    };
  };
  return { ...runtime, delivered, completed, diagnostics };
}

describe('WhatsApp first-contact ingress', () => {
  it('reproduces upstream placeholder consumption, then accepts decrypted redelivery exactly once', async () => {
    const previous = adapter(upstream);
    await previous.handleMessagesUpsert({ type: 'notify', messages: [stub] });
    await previous.handleMessagesUpsert({ type: 'notify', messages: [real] });
    expect(previous.delivered).toHaveLength(0);

    const fixed = adapter(patchIngressSource(upstream));
    await fixed.handleMessagesUpsert({ type: 'notify', messages: [stub] });
    expect(fixed.completed.size).toBe(0);
    await fixed.handleMessagesUpsert({ type: 'notify', messages: [real] });
    await fixed.handleMessagesUpsert({ type: 'append', messages: [real] });
    expect(fixed.delivered).toEqual([real]);
    expect(fixed.diagnostics).toHaveLength(1);
    expect(JSON.parse(fixed.diagnostics[0]!)).toEqual({
      code: 'SDJ_WHATSAPP_CONTENT_PENDING',
      eventKey: createHash('sha256').update(`${key.remoteJid}\n${key.id}`).digest('hex'),
    });
    expect(fixed.diagnostics.join('')).not.toContain(key.remoteJid);
    expect(fixed.diagnostics.join('')).not.toContain('daftar');
  });

  it('keeps unresolved identity retryable and never treats a LID as a phone number', async () => {
    let ready = false;
    const fixed = adapter(patchIngressSource(upstream), async () =>
      ready ? '+620000000000' : null
    );
    await expect(fixed.normalizer.normalize(real)).rejects.toThrow(
      'SDJ_WHATSAPP_IDENTITY_UNRESOLVED'
    );
    ready = true;
    expect(await fixed.normalizer.normalize(real)).toMatchObject({
      from: '+620000000000',
      senderE164: '+620000000000',
    });
  });

  it('preserves group and outbound rejection, and ignores protocol-only envelopes', async () => {
    const fixed = adapter(patchIngressSource(upstream));
    expect(await fixed.normalizer.normalize({ ...real, key: { ...key, fromMe: true } })).toBeNull();
    expect(
      await fixed.normalizer.normalize({ ...real, key: { ...key, remoteJid: 'synthetic@g.us' } })
    ).toBeNull();
    expect(sdjAdmitWhatsAppContent({ key }, content, () => {})).toBe(false);
    await fixed.handleMessagesUpsert({ type: 'history', messages: [real] });
    expect(fixed.delivered).toHaveLength(0);
  });

  it('refuses changed upstream anchors instead of applying a partial patch', () => {
    expect(() =>
      patchIngressSource(upstream.replace('if (!from) return null;', 'return null;'))
    ).toThrow('WHATSAPP_PATCH_ANCHOR_MISMATCH');
  });
});
