import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AzioniRepository, type Azione, type StatoAzione } from '../common/database/repositories/azioni.repository.js';
import { QueueService } from '../common/queue/queue.service.js';

export const JOB_ESEGUI_AZIONE = 'esegui-azione';

// Ciclo di vita di un'azione (Fase 8):
//
//   in_attesa --approva--> approvata --worker--> eseguita
//       |                      |  \
//       |                      |   `--tentativi esauriti--> fallita --riprova--> approvata
//       `--rifiuta--> rifiutata
//
// Ogni passaggio e' condizionato allo stato di partenza e al cliente, e
// lascia una riga nello storico (azioni_eventi).
@Injectable()
export class ApprovazioniService {
  private readonly logger = new Logger(ApprovazioniService.name);

  constructor(
    private readonly azioni: AzioniRepository,
    private readonly coda: QueueService,
  ) {}

  async approva(clienteId: string, azioneId: string, userId: string): Promise<Azione> {
    const azione = await this.transizione(clienteId, azioneId, ['in_attesa'], 'approvata', userId, { decisaDa: userId });
    await this.accodaOAnnulla(clienteId, azione, 'in_attesa', userId);
    return azione;
  }

  async rifiuta(clienteId: string, azioneId: string, userId: string, motivo?: string): Promise<Azione> {
    return this.transizione(clienteId, azioneId, ['in_attesa'], 'rifiutata', userId, {
      decisaDa: userId,
      motivo: motivo?.trim() || null,
    }, motivo?.trim() || undefined);
  }

  // Rimette in esecuzione un'azione fallita (es. dopo aver ricollegato Google).
  async riprova(clienteId: string, azioneId: string, userId: string): Promise<Azione> {
    const azione = await this.transizione(clienteId, azioneId, ['fallita'], 'approvata', userId, {
      decisaDa: userId,
      errore: null,
    }, 'Nuovo tentativo.');
    await this.accodaOAnnulla(clienteId, azione, 'fallita', userId);
    return azione;
  }

  private async transizione(
    clienteId: string,
    azioneId: string,
    da: StatoAzione[],
    a: StatoAzione,
    userId: string,
    campi: Parameters<AzioniRepository['cambiaStato']>[5],
    nota?: string,
  ): Promise<Azione> {
    const aggiornata = await this.azioni.cambiaStato(clienteId, azioneId, da, a, userId, campi, nota);
    if (aggiornata) return aggiornata;

    // Distinguiamo "non esiste (o e' di un altro cliente)" da "stato sbagliato".
    const attuale = await this.azioni.trovaPerId(clienteId, azioneId);
    if (!attuale) throw new NotFoundException('Azione non trovata.');
    throw new ConflictException(`Azione nello stato "${attuale.stato}": non si puo' portare a "${a}".`);
  }

  // Se la coda rifiuta (Redis giu', quota superata) l'azione torna allo stato
  // precedente, cosi' non resta "approvata" senza che nessuno la esegua.
  private async accodaOAnnulla(clienteId: string, azione: Azione, statoPrecedente: StatoAzione, userId: string) {
    try {
      await this.coda.aggiungiAzione(clienteId, JOB_ESEGUI_AZIONE, { azioneId: azione.id });
    } catch (err) {
      this.logger.error(`Accodamento fallito per l'azione ${azione.id}: ${(err as Error).message}`);
      await this.azioni.cambiaStato(clienteId, azione.id, ['approvata'], statoPrecedente, userId, {}, 'Annullata: impossibile metterla in coda.');
      throw err;
    }
  }
}
