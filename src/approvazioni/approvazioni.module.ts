import { Module } from '@nestjs/common';
import { CalendarModule } from '../calendar/calendar.module.js';
import { GoogleCalendarService } from '../calendar/google-calendar.service.js';
import { ApprovazioniController } from './approvazioni.controller.js';
import { ApprovazioniService } from './approvazioni.service.js';
import { NumeriController } from './numeri.controller.js';
import { EsecuzioneWorker } from './esecuzione.worker.js';
import {
  ESECUTORI_AZIONE,
  creaEsecutoreEventoCalendario,
  creaEsecutoreTestFallisce,
  esecutoreTest,
  type EsecutoreAzione,
} from './esecutori.js';

// Fase 8: approvazioni, esecuzione e registro azioni. Gli esecutori veri si
// aggiungono qui sotto. Quelli di prova ("test", "test-fallisce") non vengono
// registrati in produzione.
@Module({
  imports: [CalendarModule],
  controllers: [ApprovazioniController, NumeriController],
  providers: [
    ApprovazioniService,
    EsecuzioneWorker,
    {
      provide: ESECUTORI_AZIONE,
      inject: [GoogleCalendarService],
      useFactory: (calendar: GoogleCalendarService): EsecutoreAzione[] => {
        const veri = [creaEsecutoreEventoCalendario(calendar)];
        if (process.env.NODE_ENV === 'production') return veri;
        return [...veri, esecutoreTest, creaEsecutoreTestFallisce()];
      },
    },
  ],
  exports: [ApprovazioniService],
})
export class ApprovazioniModule {}
