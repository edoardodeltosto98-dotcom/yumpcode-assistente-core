import { Global, Module } from '@nestjs/common';
import { Queue, QueueEvents } from 'bullmq';
import { getRedisConnectionOptions } from './redis-connection.js';
import {
  AZIONI_QUEUE_TOKEN,
  ERRORI_QUEUE_TOKEN,
  QUEUE_AZIONI,
  QUEUE_ERRORI,
  QUEUE_EVENTS_TOKEN,
} from './queue.constants.js';
import { QueueService } from './queue.service.js';

@Global()
@Module({
  providers: [
    {
      provide: AZIONI_QUEUE_TOKEN,
      useFactory: () => new Queue(QUEUE_AZIONI, { connection: getRedisConnectionOptions() }),
    },
    {
      provide: ERRORI_QUEUE_TOKEN,
      useFactory: () => new Queue(QUEUE_ERRORI, { connection: getRedisConnectionOptions() }),
    },
    {
      provide: QUEUE_EVENTS_TOKEN,
      useFactory: () => new QueueEvents(QUEUE_AZIONI, { connection: getRedisConnectionOptions() }),
    },
    QueueService,
  ],
  exports: [QueueService, AZIONI_QUEUE_TOKEN, ERRORI_QUEUE_TOKEN],
})
export class QueueModule {}
