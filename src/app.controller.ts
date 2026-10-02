import { Controller, Get, NotFoundException } from '@nestjs/common';
import { AppService } from './app.service.js';
import { Pubblico } from './common/auth/decorators.js';
import { ClientiRepository } from './common/database/repositories/clienti.repository.js';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly clientiRepository: ClientiRepository,
  ) {}

  @Get()
  @Pubblico()
  getHello(): string {
    return this.appService.getHello();
  }

  // Verifica end-to-end: crea un cliente di prova, lo rilegge, lo elimina.
  // Usato per confermare che assistente-core parla davvero con Supabase
  // (Fase 4), non solo che la app si avvia.
  // Pubblico solo in sviluppo: in produzione (NODE_ENV=production) non
  // esiste, perche' scrive nel database senza login.
  @Get('health/db')
  @Pubblico()
  async checkDatabase() {
    if (process.env.NODE_ENV === 'production') throw new NotFoundException();
    const prova = await this.clientiRepository.crea(
      'Cliente di prova (health check)',
      `health-check-${Date.now()}@example.invalid`,
    );
    const riletto = await this.clientiRepository.trovaPerId(prova.id);
    await this.clientiRepository.elimina(prova.id);
    return {
      ok: riletto !== null && riletto.id === prova.id,
      messaggio: 'Creato, riletto ed eliminato un cliente di prova su Supabase.',
    };
  }
}
