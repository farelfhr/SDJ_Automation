/**
 * User routes
 */

import type { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import {
  PgUserRepository,
  PgTrackerConnectionRepository,
  PgChannelIdentityRepository,
} from '@sdj/infrastructure';
import { OnboardingUseCase, GetRecapUseCase } from '@sdj/application';
import { FakeTrackerGateway } from '@sdj/infrastructure';

export const userRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Initialize repositories
  const userRepo = new PgUserRepository();
  const trackerConnectionRepo = new PgTrackerConnectionRepository();

  // Initialize use cases
  const onboardingUseCase = new OnboardingUseCase(userRepo, channelIdentityRepo);
  const getRecapUseCase = new GetRecapUseCase(trackerConnectionRepo, new FakeTrackerGateway());

  // Onboarding
  app.post<{
    Body: {
      phoneNumber: string;
      displayName?: string;
      senderId: string;
    };
  }>('/onboarding', async (request, reply) => {
    try {
      const { phoneNumber, displayName, senderId } = request.body;

      const result = await onboardingUseCase.execute({
        phoneNumber,
        displayName,
        senderId,
        channelType: 'whatsapp',
      });

      return reply.send({
        success: true,
        data: result.value,
      });
    } catch (error) {
      app.log.error('Onboarding error:', error);
      return reply.status(500).send({
        success: false,
        error: { code: 'ONBOARDING_ERROR', message: 'Failed to complete onboarding' },
      });
    }
  });

  // Get profile
  app.get<{
    Params: { userId: string };
  }>('/:userId', async (request, reply) => {
    try {
      const { userId } = request.params;

      const user = await userRepo.getById(userId);
      if (!user) {
        return reply.status(404).send({
          success: false,
          error: { code: 'USER_NOT_FOUND', message: 'User not found' },
        });
      }

      const trackerConnection = await trackerConnectionRepo.getActiveByUserId(userId);

      return reply.send({
        success: true,
        data: {
          id: user.id,
          displayName: user.displayName,
          timezone: user.timezone,
          consentGiven: user.consentGiven,
          googleConnected: false, // Would check google_connections
          trackerConnected: trackerConnection !== null,
          createdAt: user.createdAt,
        },
      });
    } catch (error) {
      app.log.error('Get profile error:', error);
      return reply.status(500).send({
        success: false,
        error: { code: 'PROFILE_ERROR', message: 'Failed to get profile' },
      });
    }
  });

  // Get recap
  app.get<{
    Params: { userId: string };
    Querystring: { date?: string };
  }>('/:userId/recap', async (request, reply) => {
    try {
      const { userId } = request.params;
      const { date } = request.query;

      const result = await getRecapUseCase.execute({ userId, date });

      return reply.send({
        success: true,
        data: result.value?.recap,
      });
    } catch (error) {
      app.log.error('Get recap error:', error);
      return reply.status(500).send({
        success: false,
        error: { code: 'RECAP_ERROR', message: 'Failed to get recap' },
      });
    }
  });

  // Grant consent
  app.post<{
    Params: { userId: string };
  }>('/:userId/consent', async (request, reply) => {
    try {
      const { userId } = request.params;

      await userRepo.grantConsent(userId);

      return reply.send({
        success: true,
        message: 'Consent granted',
      });
    } catch (error) {
      app.log.error('Grant consent error:', error);
      return reply.status(500).send({
        success: false,
        error: { code: 'CONSENT_ERROR', message: 'Failed to grant consent' },
      });
    }
  });
};
