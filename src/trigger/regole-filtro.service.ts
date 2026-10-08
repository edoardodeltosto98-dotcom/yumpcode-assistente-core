import { Injectable } from '@nestjs/common';
import { ClientiRepository } from '../common/database/repositories/clienti.repository.js';
import { RegoleRepository } from '../common/database/repositories/regole.repository.js';
import { AzioniRepository } from '../common/database/repositories/azioni.repository.js';
import { FUSO } from '../approvazioni/numeri.js';

export interface EsitoFiltro {
  consentito: boolean;
  motivo?: string;
}

// Applica i filtri della regola PRIMA che una richiesta arrivi al motore
// AI (Fase 7, punto 3): interruttore generale del cliente, regola
// attiva, contatto non in lista esclusioni, fascia oraria, tetto
// giornaliero di azioni. Nessuna di queste verifiche tocca il modello:
// un contatto escluso non deve nemmeno arrivarci vicino.
@Injectable()
export class RegoleFiltroService {
  constructor(
    private readonly clienti: ClientiRepository,
    private readonly regole: RegoleRepository,
    private readonly azioni: AzioniRepository,
  ) {}

  async valuta(clienteId: string, processo: string, contatto?: string): Promise<EsitoFiltro> {
    const cliente = await this.clienti.trovaPerId(clienteId);
    if (!cliente) {
      return { consentito: false, motivo: 'Cliente non trovato.' };
    }
    if (!cliente.interruttore_attivo) {
      return { consentito: false, motivo: 'Interruttore generale spento per questo cliente.' };
    }

    const regola = await this.regole.trova(clienteId, processo);
    if (!regola) {
      return { consentito: false, motivo: `Nessuna regola configurata per il processo "${processo}".` };
    }
    if (!regola.attiva) {
      return { consentito: false, motivo: `Regola "${processo}" disattivata per questo cliente.` };
    }

    const condizione = regola.condizione_trigger;

    if (contatto && condizione.contattiEsclusi.includes(contatto.toLowerCase())) {
      return { consentito: false, motivo: `Contatto "${contatto}" in lista esclusioni.` };
    }

    if (!this.dentroFasciaOraria(condizione.fasciaOrariaInizio, condizione.fasciaOrariaFine)) {
      return {
        consentito: false,
        motivo: `Fuori fascia oraria consentita (${condizione.fasciaOrariaInizio}-${condizione.fasciaOrariaFine}).`,
      };
    }

    const azioniOggi = await this.azioni.contaOggi(clienteId, processo);
    if (azioniOggi >= condizione.maxAzioniGiorno) {
      return {
        consentito: false,
        motivo: `Tetto giornaliero raggiunto (${azioniOggi}/${condizione.maxAzioniGiorno}).`,
      };
    }

    return { consentito: true };
  }

  // Confronta ore/minuti correnti IN ITALIA (non del server, che online gira
  // in UTC) con la fascia della regola, gestendo anche una fascia che
  // attraversa la mezzanotte (es. 22:00-06:00).
  private dentroFasciaOraria(inizio: string, fine: string, adesso = new Date()): boolean {
    const minutiOra = minutiInItalia(adesso);
    const minutiInizio = this.aMinuti(inizio);
    const minutiFine = this.aMinuti(fine);

    if (minutiInizio <= minutiFine) {
      return minutiOra >= minutiInizio && minutiOra <= minutiFine;
    }
    return minutiOra >= minutiInizio || minutiOra <= minutiFine;
  }

  private aMinuti(orario: string): number {
    const [ore, minuti] = orario.split(':').map(Number);
    return ore * 60 + minuti;
  }
}

// Minuti trascorsi dalla mezzanotte, ora italiana (ora legale compresa).
export function minutiInItalia(adesso: Date): number {
  const parti = new Intl.DateTimeFormat('en-GB', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(adesso);
  const valore = (tipo: string) => Number(parti.find((p) => p.type === tipo)?.value ?? 0);
  return valore('hour') * 60 + valore('minute');
}
