import { QueueService, QuotaSuperataError } from './queue.service.js';

function creaServizio(quota?: number) {
  if (quota) process.env.QUOTA_AZIONI_PER_MINUTO = String(quota);
  const contatori = new Map<string, number>();
  const redis = {
    incr: vi.fn(async (k: string) => {
      const v = (contatori.get(k) ?? 0) + 1;
      contatori.set(k, v);
      return v;
    }),
    expire: vi.fn(async () => 1),
  };
  const azioniQueue = {
    add: vi.fn(async (nome: string, dati: unknown, opts: unknown) => ({ nome, dati, opts })),
    upsertJobScheduler: vi.fn(async () => ({})),
    removeJobScheduler: vi.fn(async () => true),
    client: Promise.resolve(redis),
    close: vi.fn(),
  };
  const erroriQueue = { add: vi.fn(), close: vi.fn() };
  const eventi = { on: vi.fn(), close: vi.fn() };
  const servizio = new QueueService(azioniQueue as never, erroriQueue as never, eventi as never);
  delete process.env.QUOTA_AZIONI_PER_MINUTO;
  return { servizio, azioniQueue, redis };
}

describe('QueueService (multi-tenant)', () => {
  it('mette sempre il clienteId nei dati del job', async () => {
    const { servizio, azioniQueue } = creaServizio();
    await servizio.aggiungiAzione('cliente-1', 'sollecito', { fattura: 'F12' });
    expect(azioniQueue.add).toHaveBeenCalledWith(
      'sollecito',
      { fattura: 'F12', clienteId: 'cliente-1' },
      expect.objectContaining({ attempts: 5 }),
    );
  });

  it('non permette di sovrascrivere il clienteId dai dati', async () => {
    const { servizio, azioniQueue } = creaServizio();
    await servizio.aggiungiAzione('cliente-1', 'sollecito', { clienteId: 'cliente-altrui' });
    expect(azioniQueue.add.mock.calls[0][1]).toMatchObject({ clienteId: 'cliente-1' });
  });

  it('antepone il cliente al jobId, cosi\' due clienti non si scontrano', async () => {
    const { servizio, azioniQueue } = creaServizio();
    await servizio.aggiungiAzione('cliente-1', 'sollecito', {}, { jobId: 'fattura-12' });
    await servizio.aggiungiAzione('cliente-2', 'sollecito', {}, { jobId: 'fattura-12' });
    expect(azioniQueue.add.mock.calls[0][2]).toMatchObject({ jobId: 'cliente-1:fattura-12' });
    expect(azioniQueue.add.mock.calls[1][2]).toMatchObject({ jobId: 'cliente-2:fattura-12' });
  });

  it('rifiuta un job senza cliente', async () => {
    const { servizio } = creaServizio();
    await expect(servizio.aggiungiAzione('', 'sollecito')).rejects.toThrow('clienteId obbligatorio');
  });

  it('blocca un cliente oltre la quota al minuto, senza toccare gli altri', async () => {
    const { servizio, azioniQueue } = creaServizio(2);
    await servizio.aggiungiAzione('cliente-1', 'a');
    await servizio.aggiungiAzione('cliente-1', 'b');
    await expect(servizio.aggiungiAzione('cliente-1', 'c')).rejects.toThrow(QuotaSuperataError);
    await expect(servizio.aggiungiAzione('cliente-2', 'a')).resolves.toBeDefined();
    expect(azioniQueue.add).toHaveBeenCalledTimes(3);
  });

  it('usa nomi di scheduler diversi per clienti diversi con lo stesso processo', async () => {
    const { servizio, azioniQueue } = creaServizio();
    await servizio.pianificaRicorrente('cliente-1', 'controllo-scadenze', '0 2 * * *');
    await servizio.pianificaRicorrente('cliente-2', 'controllo-scadenze', '0 2 * * *');
    const nomi = azioniQueue.upsertJobScheduler.mock.calls.map((c: unknown[]) => c[0]);
    expect(nomi).toEqual(['cliente:cliente-1:controllo-scadenze', 'cliente:cliente-2:controllo-scadenze']);
    expect(azioniQueue.upsertJobScheduler.mock.calls[0][2]).toMatchObject({ data: { clienteId: 'cliente-1' } });
  });
});
