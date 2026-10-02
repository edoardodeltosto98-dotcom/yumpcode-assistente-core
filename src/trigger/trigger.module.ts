import { Module } from '@nestjs/common';
import { TriggerController } from './trigger.controller.js';
import { TriggerService } from './trigger.service.js';
import { RegoleFiltroService } from './regole-filtro.service.js';

@Module({
  controllers: [TriggerController],
  providers: [TriggerService, RegoleFiltroService],
  exports: [TriggerService],
})
export class TriggerModule {}
