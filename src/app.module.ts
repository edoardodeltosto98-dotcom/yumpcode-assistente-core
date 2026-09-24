import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './common/database/database.module.js';
import { EncryptionModule } from './common/crypto/encryption.module.js';
import { LoggingInterceptor } from './common/logging/logging.interceptor.js';
import { QueueModule } from './common/queue/queue.module.js';

@Module({
  imports: [DatabaseModule, EncryptionModule, QueueModule],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
