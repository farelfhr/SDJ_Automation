/**
 * User Onboarding Use Case
 *
 * Handles new user registration and setup.
 */

import { ok, type Result } from '@sdj/domain';
import type { UserRepository, ChannelIdentityRepository } from '../ports/index.js';
import type { User, ChannelIdentity, ChannelType } from '@sdj/domain';

export interface OnboardingInput {
  phoneNumber: string;
  displayName?: string;
  senderId: string;
  channelType: ChannelType;
}

export interface OnboardingOutput {
  readonly userId: string;
  readonly channelIdentityId: string;
  readonly nextStep: 'verify_phone' | 'link_google_sheet' | 'complete';
}

/**
 * User onboarding use case
 */
export class OnboardingUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly channelIdentityRepository: ChannelIdentityRepository
  ) {}

  async execute(input: OnboardingInput): Promise<Result<OnboardingOutput>> {
    const { phoneNumber, displayName, senderId, channelType } = input;

    // Check if sender already has identity
    const existingIdentity = await this.channelIdentityRepository.getBySenderId(senderId, channelType);
    if (existingIdentity) {
      return ok({
        userId: existingIdentity.userId,
        channelIdentityId: existingIdentity.id,
        nextStep: 'complete',
      });
    }

    // Create new user
    const user = await this.userRepository.create({
      id: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'PENDING',
      timezone: 'Asia/Jakarta',
      language: 'id',
      consentGiven: false,
      displayName,
      phoneNumber,
    });

    // Create channel identity
    const identity = await this.channelIdentityRepository.create({
      id: crypto.randomUUID(),
      userId: user.id,
      channelType,
      senderId,
      senderName: displayName,
      phoneNumber,
      isVerified: false,
      createdAt: new Date(),
    });

    return ok({
      userId: user.id,
      channelIdentityId: identity.id,
      nextStep: 'verify_phone',
    });
  }
}
