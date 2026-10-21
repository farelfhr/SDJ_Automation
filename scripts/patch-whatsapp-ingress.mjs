import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, statSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const monitorRelativePath = 'dist/.setup/monitor-B5DS4PDV.mjs';
const originalHash = '99d98dd499b75fcf01b7597015b8266f0f469d6eea6d4a5f615bfc102f51ba8d';
const digest = (value) => createHash('sha256').update(value).digest('hex');

// Baileys can emit a CIPHERTEXT placeholder and later decrypted content with the
// SAME message key. Only user content may reserve the durable deduplication key.
export function sdjAdmitWhatsAppContent(msg, hasContent, report) {
  if (hasContent(msg.message ?? undefined)) return true;
  if (msg.messageStubType !== undefined) report('CONTENT_PENDING', msg);
  return false;
}

const diagnosticSource = String.raw`function sdjReportWhatsAppIngress(reason, msg) {
  const remoteJid = msg.key?.remoteJid;
  const id = msg.key?.id;
  const eventKey =
    typeof remoteJid === 'string' && typeof id === 'string'
      ? createHash('sha256').update(remoteJid + '\n' + id).digest('hex')
      : undefined;
  // No phone, message body, push name, timestamp or transport error payload.
  process.stderr.write(JSON.stringify({ code: 'SDJ_WHATSAPP_' + reason, eventKey }) + '\n');
}`;

const additions = `// SDJ WhatsApp ingress patch v1 (OpenClaw 2026.10.3)\n${sdjAdmitWhatsAppContent.toString()}\n${diagnosticSource}\n`;
export const ingressPatchEdits = [
  [
    'function createWhatsAppInboundMessageNormalizer(options) {',
    `${additions}function createWhatsAppInboundMessageNormalizer(options) {`,
  ],
  [
    '\t\t\tif (approvalReactionResolved) continue;\n\t\t\tconst receivedAt = Date.now();',
    '\t\t\tif (approvalReactionResolved) continue;\n\t\t\tif (!sdjAdmitWhatsAppContent(msg, hasInboundUserContent, sdjReportWhatsAppIngress)) continue;\n\t\t\tconst receivedAt = Date.now();',
  ],
  [
    '\t\tif (!from) return null;',
    '\t\tif (!from) {\n\t\t\tsdjReportWhatsAppIngress("IDENTITY_UNRESOLVED", msg);\n\t\t\tthrow new Error("SDJ_WHATSAPP_IDENTITY_UNRESOLVED");\n\t\t}',
  ],
  [
    '\t\tif (!access.allowed) return null;',
    '\t\tif (!access.allowed) {\n\t\t\tif (!group && !msg.key?.fromMe) sdjReportWhatsAppIngress("ACCESS_DENIED", msg);\n\t\t\treturn null;\n\t\t}',
  ],
];

export function patchIngressSource(source) {
  let result = source;
  for (const [before, after] of ingressPatchEdits) {
    if (result.split(before).length !== 2) throw new Error('WHATSAPP_PATCH_ANCHOR_MISMATCH');
    result = result.replace(before, after);
  }
  return result;
}

function unpatchIngressSource(source) {
  let result = source;
  for (const [before, after] of [...ingressPatchEdits].reverse()) {
    if (result.split(after).length !== 2) throw new Error('WHATSAPP_PATCH_INVALID');
    result = result.replace(after, before);
  }
  return result;
}

export function ensureWhatsAppIngressPatch(home, { check = false } = {}) {
  const root = resolve(home, 'node_modules/@openclaw/whatsapp');
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  if (manifest.version !== '2026.10.3') throw new Error('WHATSAPP_PATCH_VERSION_MISMATCH');
  const filename = resolve(root, monitorRelativePath);
  const source = readFileSync(filename, 'utf8');
  if (digest(source) === originalHash) {
    if (check) throw new Error('WHATSAPP_INGRESS_PATCH_REQUIRED');
    const temporary = `${filename}.sdj-tmp`;
    writeFileSync(temporary, patchIngressSource(source), { mode: statSync(filename).mode & 0o777 });
    renameSync(temporary, filename);
    return 'applied';
  }
  if (digest(unpatchIngressSource(source)) !== originalHash)
    throw new Error('WHATSAPP_PATCH_SOURCE_MISMATCH');
  return 'verified';
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    const result = ensureWhatsAppIngressPatch(process.argv[2] ?? '.local/openclaw', {
      check: process.argv.includes('--check'),
    });
    process.stdout.write(`SDJ_WHATSAPP_INGRESS_PATCH_${result.toUpperCase()}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
