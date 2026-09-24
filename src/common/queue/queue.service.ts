import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue, QueueEvents } from 'bullmq';
import {
  AZIONI_QUEUE_TOKEN,
  DEFAULT_JOB_OPTIONS,
  ERRORI_QUEUE_TOKEN,
  QUEUE_EVENTS_TOKEN,
} from './queue.constants.js';

// Punto d'ingresso unico per aggiungere lavori alla coda "azioni" e per
// pianificare job ricorrenti (scadenze, preventivi in stallo). I job che
// esauriscono i retry (vedi DEFAULT_JOB_OPTIONS) vengono spostati nella
// coda "errori" (dead-letter), cosi' non spariscono e restano ispezionabili.
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @Inject(AZIONI_QUEUE_TOKEN) private readonly azioniQueue: Queue,
    @Inject(ERRORI_QUEUE_TOKEN) private readonly erroriQueue: Queue,
    @Inject(QUEUE_EVENTS_TOKEN) private readonly azioniQueueEvents: QueueEvents,
  ) {
    // Quando un job in "azioni" fallisce definitivamente (tutti i retry
    // esauriti), lo spostiamo nella coda "errori" per non perderlo.
    this.azioniQueueEvents.on('failed', async ({ jobId, failedReason }) => {
      const job = await this.azioniQueue.getJob(jobId);
      if (!job) return;
      const esauriti = job.attemptsMade >= (job.opts.attempts ?? 1);
      if (!esauriti) return;

      this.logger.warn(`Job ${jobId} spostato in dead-letter: ${failedReason}`);
      await this.erroriQueue.add(
        'azione-fallita',
        { jobOriginale: job.name, dati: job.data, motivo: failedReason },
        { removeOnComplete: false, removeOnFail: false },
      );
    });
  }

  // Aggiunge un'azione da eseguire/approvare. Usa i retry con backoff
  // esponenziale di default, sovrascrivibili passando opts.
  async aggiungiAzione(nome: string, dati: Record<string, unknown>, opts?: Parameters<Queue['add']>[2]) {
    return this.azioniQueue.add(nome, dati, { ...DEFAULT_JOB_OPTIONS, ...opts });
  }

  // Pianifica un job ricorrente (es. controllo scadenze ogni notte,
  // preventivi in stallo ogni ora). `pattern` è un'espressione cron.
  async pianificaRicorrente(nome: string, pattern: string, dati: Record<string, unknown> = {}) {
    return this.azioniQueue.upsertJobScheduler(
      nome,
      { pattern },
      { name: nome, data: dati, opts: DEFAULT_JOB_OPTIONS },
    );
  }

  async onModuleDestroy() {
    await this.azioniQueueEvents.close();
    await this.azioniQueue.close();
    await this.erroriQueue.close();
  }
}
