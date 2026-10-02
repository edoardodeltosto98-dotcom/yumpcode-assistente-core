import { Injectable, Logger } from '@nestjs/common';
import { AzioniRepository, type Azione } from '../common/database/repositories/azioni.repository.js';
import { RegoleFiltroService } from './regole-filtro.service.js';

export interface RichiestaAzione {
  clienteId: string;
  processo: string;
  // Identifica il record a cui si riferisce l'azione (es. id fattura,
  // id preventivo): entra nella chiave di idempotenza.
  recordRiferimento: string;
  tipo: string;
  contatto?: string;
  testo?: string;
  // Dati che servono all'esecutore (es. { evento: { titolo, inizio, fine } }).
  dettagli?: Record<string, unknown>;
}

export type RisultatoTrigger =
  | { creata: true; azione: Azione }
  | { creata: false; motivo: string };

// Punto d'ingresso unico per qualunque trigger (a evento o a tempo, Fase
// 7 punto 1): valuta i filtri della regola, calcola la chiave di
// idempotenza e scrive nel registro azioni solo se non e' un duplicato
// dello stesso giorno. Nessun processo deve scrivere in "azioni"
// direttamente: passa sempre da qui, altrimenti i filtri si possono
// aggirare per errore.
@Injectable()
export class TriggerService {
  private readonly logger = new Logger(TriggerService.name);

  constructor(
    private readonly filtro: RegoleFiltroService,
    private readonly azioni: AzioniRepository,
  ) {}

  async valuta(richiesta: RichiestaAzione): Promise<RisultatoTrigger> {
    const esito = await this.filtro.valuta(richiesta.clienteId, richiesta.processo, richiesta.contatto);
    if (!esito.consentito) {
      this.logger.log(
        `Azione filtrata: cliente ${richiesta.clienteId}, processo ${richiesta.processo} — ${esito.motivo}`,
      );
      return { creata: false, motivo: esito.motivo ?? 'Non consentito.' };
    }

    const chiave = this.chiaveIdempotenza(richiesta);
    const azione = await this.azioni.creaSeNuova({
      clienteId: richiesta.clienteId,
      processo: richiesta.processo,
      recordRiferimento: richiesta.recordRiferimento,
      chiaveIdempotenza: chiave,
      tipo: richiesta.tipo,
      testo: richiesta.testo,
      dettagli: richiesta.dettagli,
    });

    if (!azione) {
      return { creata: false, motivo: 'Azione gia registrata oggi per questo record (duplicato).' };
    }

    return { creata: true, azione };
  }

  // cliente + record + tipo + giorno: la stessa combinazione non genera
  // mai due azioni nello stesso giorno, anche se il job che la produce
  // viene rieseguito per un errore di rete (Fase 7, punto 4).
  private chiaveIdempotenza(richiesta: RichiestaAzione): string {
    const giorno = new Date().toISOString().slice(0, 10);
    return [richiesta.clienteId, richiesta.recordRiferimento, richiesta.tipo, giorno].join(':');
  }
}
