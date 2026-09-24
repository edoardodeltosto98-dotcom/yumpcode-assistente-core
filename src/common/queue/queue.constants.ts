// Nomi delle code BullMQ (Fase 4). Due code separate, come da guida:
// una per le azioni che l'assistente deve eseguire/proporre, una per
// gli errori/i job finiti in dead-letter dopo aver esaurito i retry.
export const QUEUE_AZIONI = 'azioni';
export const QUEUE_ERRORI = 'errori';

export const AZIONI_QUEUE_TOKEN = 'BULLMQ_QUEUE_AZIONI';
export const ERRORI_QUEUE_TOKEN = 'BULLMQ_QUEUE_ERRORI';
export const QUEUE_EVENTS_TOKEN = 'BULLMQ_QUEUE_EVENTS_AZIONI';

// Politica di retry di default per i job in coda "azioni": 5 tentativi,
// backoff esponenziale a partire da 5 secondi (5s, 10s, 20s, 40s, 80s).
export const DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: {
    type: 'exponential' as const,
    delay: 5000,
  },
  removeOnComplete: { age: 60 * 60 * 24 * 7 }, // 7 giorni
  removeOnFail: false, // resta in coda finche' non viene spostato in dead-letter
};
