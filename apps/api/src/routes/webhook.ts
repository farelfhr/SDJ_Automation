/**
 * Webhook routes for WhatsApp/OpenClaw integration
 */

import type { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { verifyHMAC } from '@sdj/infrastructure';
import { ProcessMessageUseCase } from '@sdj/application';
import { getConfig } from '@sdj/config';
import {
  PgUserRepository,
  PgChannelIdentityRepository,
  PgMutationRepository,
  PgInboundMessageRepository,
  PgTrackerConnectionRepository,
} from '@sdj/infrastructure';
import { WhatsAppChannelGateway } from '@sdj/infrastructure';
import { SimpleIntentInterpreter, AIRouter } from '@sdj/infrastructure';
import { FakeTrackerGateway } from '@sdj/infrastructure';

export const webhookRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const config = getConfig();

  // Initialize repositories
  const userRepo = new PgUserRepository();
  const channelIdentityRepo = new PgChannelIdentityRepository();
  const mutationRepo = new PgMutationRepository();
  const inboundMessageRepo = new PgInboundMessageRepository();
  const trackerConnectionRepo = new PgTrackerConnectionRepository();

  // Initialize gateways
  const channelGateway = new WhatsAppChannelGateway({
    webhookSecret: config.openclaw.webhookSecret,
    apiKey: config.openclaw.apiKey,
    instanceId: config.openclaw.instanceId,
  });

  // Initialize AI router
  const aiRouter = new AIRouter({
    groq: {
      apiKey: config.groq.apiKey,
      baseUrl: config.groq.baseUrl,
      model: config.groq.model,
      maxTokens: config.groq.maxTokens,
      temperature: config.groq.temperature,
    },
    gemini: {
      apiKey: config.gemini.apiKey,
      baseUrl: config.gemini.baseUrl,
      model: config.gemini.model,
      maxTokens: config.gemini.maxTokens,
      temperature: config.gemini.temperature,
    },
    glm: {
      apiKey: config.glm.apiKey,
      baseUrl: config.glm.baseUrl,
      model: config.glm.model,
      maxTokens: config.glm.maxTokens,
      temperature: config.glm.temperature,
    },
    enableAI: config.ai.enableAI,
  });

  // Initialize intent interpreter
  const intentInterpreter = new SimpleIntentInterpreter(aiRouter, config.ai.enableAI);

  // Initialize tracker gateway (use fake for now)
  const trackerGateway = new FakeTrackerGateway();

  // Initialize use case
  const processMessageUseCase = new ProcessMessageUseCase(
    intentInterpreter,
    channelGateway,
    mutationRepo,
    trackerConnectionRepo,
    inboundMessageRepo,
    trackerGateway
  );

  // Webhook verification endpoint
  app.post('/verify', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { challenge?: string };

    if (body.challenge) {
      return reply.send({ challenge: body.challenge });
    }

    return reply.status(400).send({ error: 'Missing challenge' });
  });

  // Message webhook endpoint
  app.post('/message', async (request: FastifyRequest, reply: FastifyReply) => {
    // Verify HMAC signature
    const signature = request.headers['x-signature'] as string;
    if (signature && !verifyHMAC(JSON.stringify(request.body), signature, config.openclaw.webhookSecret)) {
      app.log.warn('Invalid webhook signature');
      return reply.status(401).send({ error: 'Invalid signature' });
    }

    const payload = request.body as {
      messageId?: string;
      senderId?: string;
      senderName?: string;
      phoneNumber?: string;
      content?: string;
      timestamp?: string;
      type?: string;
    };

    // Ignore non-message events
    if (payload.type && payload.type !== 'message') {
      return reply.send({ received: true, ignored: true });
    }

    if (!payload.senderId || !payload.content) {
      return reply.status(400).send({ error: 'Missing required fields' });
    }

    try {
      // Get user ID from sender
      const userId = await channelIdentityRepo.getUserIdBySenderId(payload.senderId, 'whatsapp');

      if (!userId) {
        app.log.warn(`Unknown sender: ${payload.senderId}`);
        return reply.send({ received: true, response: 'Sender not registered' });
      }

      // Get user
      const user = await userRepo.getById(userId);
      if (!user) {
        app.log.error(`User not found: ${userId}`);
        return reply.status(500).send({ error: 'User not found' });
      }

      // Process message
      const result = await processMessageUseCase.execute({
        message: {
          id: payload.messageId ?? crypto.randomUUID(),
          channelType: 'whatsapp',
          senderId: payload.senderId,
          senderName: payload.senderName,
          phoneNumber: payload.phoneNumber,
          content: payload.content,
          timestamp: payload.timestamp ?? new Date().toISOString(),
        },
        userId,
        user,
      });

      app.log.info(`Processed message from ${payload.senderId}: ${result.value?.action ?? 'unknown'}`);

      return reply.send({
        received: true,
        response: result.value?.response ?? '',
        action: result.value?.action ?? 'unknown',
      });

    } catch (error) {
      app.log.error('Error processing message:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
};
