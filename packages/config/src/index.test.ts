/**
 * Config tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Config', () => {
  beforeEach(() => {
    // Reset environment
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env['NODE_ENV'];
    delete process.env['DATABASE_URL'];
    delete process.env['GROQ_API_KEY'];
  });

  it('should load config from environment', async () => {
    process.env['NODE_ENV'] = 'test';
    process.env['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/test';
    process.env['GROQ_API_KEY'] = 'test-key';

    const { loadConfig } = await import('@sdj/config');
    const config = loadConfig();

    expect(config.nodeEnv).toBe('test');
    expect(config.database.url).toBe('postgresql://test:test@localhost:5432/test');
    expect(config.groq.apiKey).toBe('test-key');
  });

  it('should use defaults for missing env vars', async () => {
    const { loadConfig } = await import('@sdj/config');
    const config = loadConfig();

    expect(config.nodeEnv).toBe('development');
    expect(config.api.port).toBe(3000);
  });
});
