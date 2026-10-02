import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ApprovazioniModule } from './approvazioni/approvazioni.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AuthClerkModule } from './common/auth/auth-clerk.module.js';
import { CalendarModule } from './calendar/calendar.module.js';
import { DatabaseModule } from './common/database/database.module.js';
import { EncryptionModule } from './common/crypto/encryption.module.js';
import { LoggingInterceptor } from './common/logging/logging.interceptor.js';
import { QueueModule } from './common/queue/queue.module.js';
import { TriggerModule } from './trigger/trigger.module.js';
import { WebhooksModule } from './webhooks/webhooks.module.js';

@Module({
  imports: [DatabaseModule, EncryptionModule, AuthClerkModule, QueueModule, AuthModule, CalendarModule, TriggerModule, ApprovazioniModule, WebhooksModule],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
