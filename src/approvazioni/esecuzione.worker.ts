import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { UnrecoverableError, Worker, type Job } from 'bullmq';
import { AzioniRepository } from '../common/database/repositories/azioni.repository.js';
import { ClientiRepository } from '../common/database/repositories/clienti.repository.js';
import { QUEUE_AZIONI } from '../common/queue/queue.constants.js';
import { getRedisConnectionOptions } from '../common/queue/redis-connection.js';
import type { DatiJob } from '../common/queue/queue.service.js';
import { JOB_ESEGUI_AZIONE } from './approvazioni.service.js';
import { ESECUTORI_AZIONE, ErroreDefinitivo, type EsecutoreAzione } from './esecutori.js';

export { ErroreDefinitivo };

// Esegue le azioni approvate. Prende i job "esegui-azione" dalla coda
// "azioni", ricontrolla tutto al momento dell'esecuzione (l'azione e' ancora
// approvata? l'interruttore del cliente e' ancora acceso?) e chiama
// l'esecutore del tipo giusto. Errori temporanei: BullMQ ritenta con backoff;
// tentativi esauriti o errore definitivo: l'azione passa a "fallita".
@Injectable()
export class EsecuzioneWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EsecuzioneWorker.name);
  private worker?: Worker;
  private readonly esecutori: Map<string, EsecutoreAzione>;

  constructor(
    private readonly azioni: AzioniRepository,
    private readonly clienti: ClientiRepository,
    @Inject(ESECUTORI_AZIONE) esecutori: EsecutoreAzione[],
  ) {
    this.esecutori = new Map(esecutori.map((e) => [e.tipo, e]));
  }

  onModuleInit() {
    // Nei test (vitest) non apriamo connessioni Redis vere.
    if (process.env.VITEST || process.env.DISABILITA_WORKER === '1') return;
    this.worker = new Worker(QUEUE_AZIONI, (job) => this.elabora(job), {
      connection: getRedisConnectionOptions(),
      concurrency: 5,
    });
    this.worker.on('failed', (job, err) => {
      if (job) void this.gestisciFallimento(job, err);
    });
    this.worker.on('error', (err) => this.logger.error(`Worker azioni: ${err.message}`));
  }

  async elabora(job: Job<DatiJob>): Promise<void> {
    if (job.name !== JOB_ESEGUI_AZIONE) return; // altri tipi di job: non nostri
    const { clienteId } = job.data;
    const azioneId = String(job.data.azioneId ?? '');

    const azione = await this.azioni.trovaPerId(clienteId, azioneId);
    if (!azione) throw new ErroreDefinitivo('Azione non trovata per questo cliente.');
    // Gia' eseguita, rifiutata o tornata indietro: niente da fare (idempotente).
    if (azione.stato !== 'approvata') return;

    const cliente = await this.clienti.trovaPerId(clienteId);
    if (!cliente?.interruttore_attivo) {
      throw new ErroreDefinitivo('Interruttore generale spento al momento dell\'esecuzione.');
    }

    const esecutore = this.esecutori.get(azione.tipo);
    if (!esecutore) throw new ErroreDefinitivo(`Nessun esecutore disponibile per il tipo "${azione.tipo}".`);

    const risultato = await esecutore.esegui(azione);
    if (risultato) await this.azioni.salvaRisultato(clienteId, azione.id, risultato);
    await this.azioni.cambiaStato(clienteId, azione.id, ['approvata'], 'eseguita', 'sistema', { eseguita: true, errore: null });
    this.logger.log(`Azione ${azione.id} (cliente ${clienteId}) eseguita.`);
  }

  async gestisciFallimento(job: Job<DatiJob>, err: Error): Promise<void> {
    if (job.name !== JOB_ESEGUI_AZIONE) return;
    const definitivo = err instanceof UnrecoverableError;
    const esauriti = job.attemptsMade >= (job.opts.attempts ?? 1);
    if (!definitivo && !esauriti) return; // BullMQ ritentera'

    await this.azioni.cambiaStato(job.data.clienteId, String(job.data.azioneId), ['approvata'], 'fallita', 'sistema', {
      errore: err.message,
    });
    this.logger.warn(`Azione ${job.data.azioneId} (cliente ${job.data.clienteId}) fallita: ${err.message}`);
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}
