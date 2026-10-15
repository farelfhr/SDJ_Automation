/**
 * Fake implementations for testing
 */

import type { User } from '@sdj/domain';
import type { ChannelIdentity } from '@sdj/domain';
import type { Mutation } from '@sdj/domain';
import type { InboundMessage } from '@sdj/contracts';

export class FakeUser implements Partial<User> {
  id = crypto.randomUUID();
  createdAt = new Date();
  updatedAt = new Date();
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DELETED' = 'ACTIVE';
  timezone = 'Asia/Jakarta';
  language = 'id';
  consentGiven = true;
  displayName = 'Test User';
  phoneNumber = '+6281234567890';
}

export class FakeChannelIdentity implements Partial<ChannelIdentity> {
  id = crypto.randomUUID();
  userId = crypto.randomUUID();
  channelType = 'whatsapp';
  senderId = 'test-sender-123';
  senderName = 'Test Sender';
  phoneNumber = '+6281234567890';
  isVerified = true;
  createdAt = new Date();
}

export class FakeMutation implements Partial<Mutation> {
  id = crypto.randomUUID();
  userId = crypto.randomUUID();
  type: 'SET_SCORE' | 'UNDO' | 'CORRECTION' = 'SET_SCORE';
  action = 'SET_SCORE';
  activityId = { type: 'prayer', id: 'subuh', displayName: 'Subuh' };
  targetDate = {
    date: new Date(),
    anchor: 'today' as const,
    precision: 'day' as const,
    description: 'hari ini',
  };
  newValue = 3;
  previousValue = undefined;
  status: 'PENDING' | 'APPLIED' | 'FAILED' | 'ROLLED_BACK' = 'APPLIED';
  createdAt = new Date();
  idempotencyKey = `fake-${crypto.randomUUID()}`;
  channelMessageId = 'fake-message-123';
}

export class FakeInboundMessage implements Partial<InboundMessage> {
  id = crypto.randomUUID();
  channelType = 'whatsapp';
  senderId = 'test-sender-123';
  senderName = 'Test Sender';
  content = 'subuh 3';
  timestamp = new Date().toISOString();
}

/**
 * In-memory store for testing
 */
export class InMemoryStore<T extends { id: string }> {
  private items = new Map<string, T>();

  async create(item: T): Promise<T> {
    this.items.set(item.id, item);
    return item;
  }

  async getById(id: string): Promise<T | null> {
    return this.items.get(id) ?? null;
  }

  async getAll(): Promise<T[]> {
    return Array.from(this.items.values());
  }

  async update(item: T): Promise<T> {
    this.items.set(item.id, item);
    return item;
  }

  async delete(id: string): Promise<void> {
    this.items.delete(id);
  }

  async clear(): Promise<void> {
    this.items.clear();
  }

  async find(predicate: (item: T) => boolean): Promise<T[]> {
    return Array.from(this.items.values()).filter(predicate);
  }
}
