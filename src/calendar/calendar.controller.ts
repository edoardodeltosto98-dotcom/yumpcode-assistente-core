import { Controller, Get, Query } from '@nestjs/common';
import { ClienteCorrente } from '../common/auth/decorators.js';
import type { Cliente } from '../common/database/repositories/clienti.repository.js';
import { GoogleCalendarService } from './google-calendar.service.js';

// Il cliente arriva dal token Clerk (organizzazione attiva), non piu' da
// ?clienteId=: ogni organizzazione vede solo il proprio calendario.
@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendar: GoogleCalendarService) {}

  // GET /calendar/eventi?giorni=7
  @Get('eventi')
  async eventi(@ClienteCorrente() cliente: Cliente, @Query('giorni') giorni?: string) {
    const numeroGiorni = giorni ? Number(giorni) : 7;
    const eventi = await this.calendar.elencaProssimiEventi(cliente.id, numeroGiorni);
    return { ok: true, eventi };
  }

  // Niente POST: gli eventi si creano solo da un'azione approvata (Fase 8,
  // esecutore "evento-calendario"), mai direttamente.
}
