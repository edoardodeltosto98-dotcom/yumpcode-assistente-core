import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ClienteCorrente } from '../common/auth/decorators.js';
import { AzioniRepository } from '../common/database/repositories/azioni.repository.js';
import type { Cliente } from '../common/database/repositories/clienti.repository.js';
import { FUSO, calcolaNumeri, meseCorrente, mesePrecedente, meseValido } from './numeri.js';

// Numeri del mese per il cruscotto (Fase 9). Tutti i membri possono leggerli.
@Controller('numeri')
export class NumeriController {
  constructor(private readonly azioni: AzioniRepository) {}

  // GET /numeri?mese=2026-10  (senza "mese": il mese corrente, ora italiana)
  @Get()
  async numeri(@ClienteCorrente() cliente: Cliente, @Query('mese') mese?: string) {
    const corrente = meseCorrente();
    const scelto = mese ?? corrente;
    if (!meseValido(scelto)) throw new BadRequestException('"mese" deve essere nel formato AAAA-MM.');
    const precedente = mesePrecedente(scelto);
    const righe = await this.azioni.contaPerMese(cliente.id, [scelto, precedente], FUSO);
    return {
      ok: true,
      meseCorrente: corrente,
      mese: calcolaNumeri(scelto, righe),
      precedente: calcolaNumeri(precedente, righe),
    };
  }
}
