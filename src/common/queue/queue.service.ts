import { HttpException, HttpStatus, Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue, QueueEvents } from 'bullmq';
import type { Redis } from 'ioredis';
import {
  AZIONI_QUEUE_TOKEN,
  DEFAULT_JOB_OPTIONS,
  ERRORI_QUEUE_TOKEN,
  QUEUE_EVENTS_TOKEN,
} from './queue.constants.js';

// Dati minimi di ogni job: il cliente a cui appartiene. Multi-tenant: un job
// senza cliente non puo' esistere, cosi' chi lo esegue sa sempre per conto
// di chi lavora (e puo' controllare interruttore e regole di quel cliente).
export type DatiJob = { clienteId: string } & Record<string, unknown>;

// Quanti job al minuto puo' accodare un singolo cliente. Protegge gli altri
// clienti da uno che per errore (o per un loop) riempie la coda condivisa.
const QUOTA_DEFAULT_PER_MINUTO = 60;

export class QuotaSuperataError extends HttpException {
  constructor(clienteId: string, quota: number) {
    super(
      `Troppe azioni accodate per il cliente ${clienteId}: massimo ${quota} al minuto. Riprova tra poco.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

// Punto d'ingresso unico per aggiungere lavori alla coda "azioni" e per
// pianificare job ricorrenti (scadenze, preventivi in stallo). I job che
// esauriscono i retry (vedi DEFAULT_JOB_OPTIONS) vengono spostati nella
// coda "errori" (dead-letter), cosi' non spariscono e restano ispezionabili.
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly quotaPerMinuto = Number(process.env.QUOTA_AZIONI_PER_MINUTO) || QUOTA_DEFAULT_PER_MINUTO;

  constructor(
    @Inject(AZIONI_QUEUE_TOKEN) private readonly azioniQueue: Queue,
    @Inject(ERRORI_QUEUE_TOKEN) private readonly erroriQueue: Queue,
    @Inject(QUEUE_EVENTS_TOKEN) private readonly azioniQueueEvents: QueueEvents,
  ) {
    // Quando un job in "azioni" fallisce definitivamente (tutti i retry
    // esauriti), lo spostiamo nella coda "errori" per non perderlo. Il
    // clienteId resta nei dati, cosi' gli errori si possono filtrare per cliente.
    this.azioniQueueEvents.on('failed', async ({ jobId, failedReason }) => {
      const job = await this.azioniQueue.getJob(jobId);
      if (!job) return;
      const esauriti = job.attemptsMade >= (job.opts.attempts ?? 1);
      if (!esauriti) return;

      this.logger.warn(`Job ${jobId} (cliente ${job.data?.clienteId ?? '?'}) spostato in dead-letter: ${failedReason}`);
      await this.erroriQueue.add(
        'azione-fallita',
        { clienteId: job.data?.clienteId, jobOriginale: job.name, dati: job.data, motivo: failedReason },
        { removeOnComplete: false, removeOnFail: false },
      );
    });
  }

  // Aggiunge un'azione da eseguire/approvare per un cliente. Usa i retry con
  // backoff esponenziale di default, sovrascrivibili passando opts.
  // Se viene passato opts.jobId, gli viene anteposto il cliente: due clienti
  // con lo stesso id logico (es. "fattura-12") non si scontrano.
  async aggiungiAzione(clienteId: string, nome: string, dati: Record<string, unknown> = {}, opts?: Parameters<Queue['add']>[2]) {
    this.richiediCliente(clienteId);
    await this.verificaQuota(clienteId);
    const jobId = opts?.jobId ? `${clienteId}:${opts.jobId}` : undefined;
    const datiJob: DatiJob = { ...dati, clienteId };
    return this.azioniQueue.add(nome, datiJob, { ...DEFAULT_JOB_OPTIONS, ...opts, ...(jobId ? { jobId } : {}) });
  }

  // Pianifica un job ricorrente per UN cliente (es. "controlla le sue
  // scadenze ogni notte"). Il nome dello scheduler include il cliente:
  // senza, due clienti con lo stesso nome si sovrascriverebbero a vicenda.
  // `pattern` e' un'espressione cron.
  async pianificaRicorrente(clienteId: string, nome: string, pattern: string, dati: Record<string, unknown> = {}) {
    this.richiediCliente(clienteId);
    const datiJob: DatiJob = { ...dati, clienteId };
    return this.azioniQueue.upsertJobScheduler(
      QueueService.nomeScheduler(clienteId, nome),
      { pattern },
      { name: nome, data: datiJob, opts: DEFAULT_JOB_OPTIONS },
    );
  }

  async rimuoviRicorrente(clienteId: string, nome: string) {
    this.richiediCliente(clienteId);
    return this.azioniQueue.removeJobScheduler(QueueService.nomeScheduler(clienteId, nome));
  }

  // Job ricorrente di sistema, non legato a un cliente (es. un giro notturno
  // che poi accoda un job per ogni cliente attivo con aggiungiAzione).
  async pianificaRicorrenteDiSistema(nome: string, pattern: string, dati: Record<string, unknown> = {}) {
    return this.azioniQueue.upsertJobScheduler(
      `sistema:${nome}`,
      { pattern },
      { name: nome, data: { ...dati, sistema: true }, opts: DEFAULT_JOB_OPTIONS },
    );
  }

  static nomeScheduler(clienteId: string, nome: string): string {
    return `cliente:${clienteId}:${nome}`;
  }

  private richiediCliente(clienteId: string) {
    if (!clienteId) throw new Error('clienteId obbligatorio per accodare un job (multi-tenant).');
  }

  // Contatore per cliente e per minuto su Redis (stessa connessione della
  // coda, nessun client in piu'). La chiave scade da sola dopo 2 minuti.
  private async verificaQuota(clienteId: string) {
    const minuto = Math.floor(Date.now() / 60_000);
    const chiave = `yumpcode:quota-azioni:${clienteId}:${minuto}`;
    // Il tipo esposto da BullMQ e' minimo, ma a runtime e' un client ioredis.
    const redis = (await this.azioniQueue.client) as unknown as Redis;
    const conteggio = await redis.incr(chiave);
    if (conteggio === 1) await redis.expire(chiave, 120);
    if (conteggio > this.quotaPerMinuto) {
      this.logger.warn(`Quota azioni superata per il cliente ${clienteId} (${conteggio}/${this.quotaPerMinuto} al minuto).`);
      throw new QuotaSuperataError(clienteId, this.quotaPerMinuto);
    }
  }

  async onModuleDestroy() {
    await this.azioniQueueEvents.close();
    await this.azioniQueue.close();
    await this.erroriQueue.close();
  }
}
