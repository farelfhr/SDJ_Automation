import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type { z } from 'zod';
export class CryptoBox {
  constructor(
    private readonly encryptionKey: string,
    private readonly lookupKey: string
  ) {
    if (!/^[a-f0-9]{64}$/i.test(encryptionKey) || !/^[a-f0-9]{64}$/i.test(lookupKey))
      throw new Error('CRYPTO_KEY_INVALID');
  }
  seal(value: unknown, context: string): Buffer {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', Buffer.from(this.encryptionKey, 'hex'), iv);
    cipher.setAAD(Buffer.from(context));
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), encrypted]);
  }
  open<T>(value: Buffer, context: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>): T {
    if (value[0] !== 1 || value.length < 30) throw new Error('CIPHERTEXT_INVALID');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      Buffer.from(this.encryptionKey, 'hex'),
      value.subarray(1, 13)
    );
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(value.subarray(13, 29));
    const plaintext = Buffer.concat([
      decipher.update(value.subarray(29)),
      decipher.final(),
    ]).toString('utf8');
    return schema.parse(JSON.parse(plaintext));
  }
  digest(value: string): Buffer {
    return createHmac('sha256', Buffer.from(this.lookupKey, 'hex')).update(value).digest();
  }
}
export function secureToken(): string {
  return randomBytes(32).toString('base64url');
}
export function safeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a),
    bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export function signRequest(secret: string, timestamp: string, nonce: string, raw: string): string {
  return createHmac('sha256', Buffer.from(secret, 'hex'))
    .update(timestamp + '\n' + nonce + '\n' + raw)
    .digest('hex');
}
