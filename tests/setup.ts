/**
 * Test setup file
 */

import { beforeAll, afterAll, afterEach } from 'vitest';

// Set test environment
process.env['NODE_ENV'] = 'test';
process.env['DATABASE_URL'] = 'postgresql://postgres:postgres@localhost:5432/sdj_assistant_test';

// Increase timeout for integration tests
beforeAll(() => {
  // Global setup
});

afterAll(() => {
  // Global teardown
});

afterEach(() => {
  // Reset mocks between tests
});
