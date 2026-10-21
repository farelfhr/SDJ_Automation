import { describe, it, expect } from 'vitest';
// @ts-expect-error Local JavaScript launcher has no declaration file.
import * as openclawConfig from '../../scripts/openclaw-config.mjs';
const { enablePublicWhatsAppDM, enableSdjBridgeHooks, assertSdjBridgeLoaded } = openclawConfig;

describe('Akses DM publik OpenClaw', () => {
  it('memberi bridge izin pesan tanpa memberikan izin injeksi prompt atau mengganti credential', () => {
    const source = {
      plugins: { entries: { 'sdj-bridge': { config: { keyEnv: 'SYNTHETIC_KEY' } } } },
    };
    const configured = enableSdjBridgeHooks(structuredClone(source));
    expect(configured.plugins.entries['sdj-bridge']).toEqual({
      enabled: true,
      hooks: { allowConversationAccess: true, allowPromptInjection: false },
      config: source.plugins.entries['sdj-bridge'].config,
    });
    expect(enableSdjBridgeHooks(structuredClone(configured))).toEqual(configured);
  });

  it('menghentikan startup jika bridge ditolak loader atau hook/outbox tidak terdaftar', () => {
    const ready = {
      plugin: { id: 'sdj-bridge', enabled: true, status: 'loaded' },
      typedHooks: [{ name: 'before_dispatch', priority: 1000 }],
      services: ['sdj-outbox'],
      policy: { allowConversationAccess: true },
    };
    expect(() => assertSdjBridgeLoaded(ready)).not.toThrow();
    for (const snapshot of [
      {},
      { ...ready, plugin: { ...ready.plugin, status: 'error' } },
      { ...ready, typedHooks: [] },
      { ...ready, services: [] },
      { ...ready, policy: { allowConversationAccess: false } },
    ])
      expect(() => assertSdjBridgeLoaded(snapshot)).toThrow('SDJ_BRIDGE_NOT_READY');
    expect(() =>
      assertSdjBridgeLoaded({
        ...ready,
        diagnostics: [{ pluginId: 'sdj-bridge', level: 'error' }],
      })
    ).toThrow('SDJ_BRIDGE_NOT_READY');
  });
  it('memigrasikan konfigurasi lama dan override akun tanpa mengubah credential atau owner', () => {
    const source = {
      gateway: { auth: { token: 'synthetic-token' } },
      commands: {
        ownerAllowFrom: ['synthetic-operator'],
        allowFrom: { telegram: ['synthetic-owner'] },
      },
      channels: {
        whatsapp: {
          dmPolicy: 'pairing',
          accounts: {
            'synthetic-bot': {
              dmPolicy: 'allowlist',
              allowFrom: ['synthetic-sender'],
              authDir: 'synthetic-session',
            },
          },
        },
      },
    };
    const migrated = enablePublicWhatsAppDM(structuredClone(source), 'synthetic-bot');
    expect(migrated.channels.whatsapp).toMatchObject({
      dmPolicy: 'open',
      allowFrom: ['*'],
      groupPolicy: 'disabled',
      accounts: {
        'synthetic-bot': {
          dmPolicy: 'open',
          allowFrom: ['*'],
          groupPolicy: 'disabled',
          authDir: 'synthetic-session',
        },
      },
    });
    expect(migrated.gateway).toEqual(source.gateway);
    expect(migrated.commands.ownerAllowFrom).toEqual(source.commands.ownerAllowFrom);
    expect(migrated.commands.allowFrom).toEqual({ whatsapp: [], telegram: ['synthetic-owner'] });
    expect(enablePublicWhatsAppDM(structuredClone(migrated), 'synthetic-bot')).toEqual(migrated);
  });
});
