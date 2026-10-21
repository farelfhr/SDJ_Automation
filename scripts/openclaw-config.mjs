// Public DM admission is separate from Google/tracker authorization in the backend.
export function enablePublicWhatsAppDM(config, accountId) {
  if (!accountId) throw new Error('CHANNEL_ACCOUNT_ID_REQUIRED');
  config.channels ??= {};
  const whatsapp = (config.channels.whatsapp ??= {});
  whatsapp.dmPolicy = 'open';
  whatsapp.allowFrom = ['*'];
  whatsapp.groupPolicy = 'disabled';
  whatsapp.accounts ??= {};
  const account = (whatsapp.accounts[accountId] ??= { enabled: true });
  account.dmPolicy = 'open';
  account.allowFrom = ['*'];
  account.groupPolicy = 'disabled';
  config.session ??= {};
  config.session.dmScope = 'per-account-channel-peer';
  // Opening chat must not grant native gateway commands to every sender.
  config.commands ??= {};
  config.commands.allowFrom ??= {};
  config.commands.allowFrom.whatsapp = [];
  return config;
}

// This operator-owned bridge must read inbound messages to claim dispatch before the agent.
export function enableSdjBridgeHooks(config) {
  config.plugins ??= {};
  config.plugins.entries ??= {};
  const entry = (config.plugins.entries['sdj-bridge'] ??= {});
  entry.enabled = true;
  entry.hooks = { ...entry.hooks, allowConversationAccess: true, allowPromptInjection: false };
  return config;
}

export function assertSdjBridgeLoaded(snapshot) {
  const bridge = snapshot?.plugin;
  if (
    bridge?.id !== 'sdj-bridge' ||
    bridge.enabled !== true ||
    bridge.status !== 'loaded' ||
    !snapshot.typedHooks?.some((hook) => hook.name === 'before_dispatch') ||
    !snapshot.services?.includes('sdj-outbox') ||
    snapshot.policy?.allowConversationAccess !== true ||
    snapshot.diagnostics?.some(
      (entry) => entry.pluginId === 'sdj-bridge' && entry.level === 'error'
    )
  )
    throw new Error('SDJ_BRIDGE_NOT_READY');
}
