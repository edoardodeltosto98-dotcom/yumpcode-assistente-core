import { Module } from '@nestjs/common';
import { ClerkWebhookController } from './clerk-webhook.controller.js';

@Module({
  controllers: [ClerkWebhookController],
})
export class WebhooksModule {}
