import { Module } from '@nestjs/common';
import { TriggerController } from './trigger.controller.js';
import { TriggerService } from './trigger.service.js';
import { RegoleFiltroService } from './regole-filtro.service.js';
import { ScadenzeController } from '../scadenze/scadenze.controller.js';

@Module({
  controllers: [TriggerController, ScadenzeController],
  providers: [TriggerService, RegoleFiltroService],
  exports: [TriggerService],
})
export class TriggerModule {}
