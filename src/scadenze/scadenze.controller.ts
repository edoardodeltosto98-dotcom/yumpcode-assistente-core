import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ClienteCorrente, SoloAdmin } from '../common/auth/decorators.js';
import type { Cliente } from '../common/database/repositories/clienti.repository.js';
import { RegoleRepository } from '../common/database/repositories/regole.repository.js';
import { TriggerService } from '../trigger/trigger.service.js';
import { FUSO } from '../approvazioni/numeri.js';
import { PROCESSO_SCADENZE, TIPO_PROMEMORIA_SCADENZA, leggiScadenza } from './scadenza.js';

// Scadenze inserite a mano dal cruscotto. Ogni scadenza diventa subito una
// proposta dell'assistente ("promemoria-scadenza") da approvare: la scadenza
// vive dentro l'azione, quindi niente tabella nuova.
@Controller('scadenze')
export class ScadenzeController {
  constructor(
    private readonly trigger: TriggerService,
    private readonly regole: RegoleRepository,
  ) {}

  // POST /scadenze  body: { titolo, data: "AAAA-MM-GG", giorniPreavviso, note? }
  @Post()
  @SoloAdmin()
  async crea(@ClienteCorrente() cliente: Cliente, @Body() corpo: unknown) {
    const scadenza = leggiScadenza(corpo);
    if (typeof scadenza === 'string') throw new BadRequestException(scadenza);

    const oggi = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(new Date());
    if (scadenza.data < oggi) throw new BadRequestException('La data della scadenza e\' gia\' passata.');

    // Prima scadenza del cliente: creiamo la regola con valori adatti a un
    // inserimento manuale (a qualsiasi ora). Se esiste, valgono i suoi filtri.
    if (!(await this.regole.trova(cliente.id, PROCESSO_SCADENZE))) {
      await this.regole.salva(cliente.id, PROCESSO_SCADENZE, {
        fasciaOrariaInizio: '00:00',
        fasciaOrariaFine: '23:59',
        maxAzioniGiorno: 50,
      });
    }

    const risultato = await this.trigger.valuta({
      clienteId: cliente.id,
      processo: PROCESSO_SCADENZE,
      recordRiferimento: `scadenza-${randomUUID()}`,
      tipo: TIPO_PROMEMORIA_SCADENZA,
      dettagli: { scadenza },
    });
    return { ok: true, risultato };
  }
}
