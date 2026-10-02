import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { Azione } from '../common/database/repositories/azioni.repository.js';
import { ApprovazioniService, JOB_ESEGUI_AZIONE } from './approvazioni.service.js';
import { EsecuzioneWorker, ErroreDefinitivo } from './esecuzione.worker.js';

const azione = (stato: Azione['stato'], extra: Partial<Azione> = {}): Azione =>
  ({ id: 'a1', cliente_id: 'c1', tipo: 'test', stato, ...extra }) as Azione;

function repoFinto() {
  return {
    cambiaStato: vi.fn(),
    trovaPerId: vi.fn(),
  };
}

describe('ApprovazioniService', () => {
  it('approva: in_attesa -> approvata e accoda l\'esecuzione per quel cliente', async () => {
    const repo = repoFinto();
    repo.cambiaStato.mockResolvedValue(azione('approvata'));
    const coda = { aggiungiAzione: vi.fn().mockResolvedValue({}) };
    const s = new ApprovazioniService(repo as never, coda as never);

    await s.approva('c1', 'a1', 'user_1');

    expect(repo.cambiaStato).toHaveBeenCalledWith('c1', 'a1', ['in_attesa'], 'approvata', 'user_1', { decisaDa: 'user_1' }, undefined);
    expect(coda.aggiungiAzione).toHaveBeenCalledWith('c1', JOB_ESEGUI_AZIONE, { azioneId: 'a1' });
  });

  it('approva due volte: la seconda risponde 409 con lo stato attuale', async () => {
    const repo = repoFinto();
    repo.cambiaStato.mockResolvedValue(null);
    repo.trovaPerId.mockResolvedValue(azione('approvata'));
    const s = new ApprovazioniService(repo as never, { aggiungiAzione: vi.fn() } as never);
    await expect(s.approva('c1', 'a1', 'user_1')).rejects.toThrow(ConflictException);
  });

  it('azione di un altro cliente: 404, come se non esistesse', async () => {
    const repo = repoFinto();
    repo.cambiaStato.mockResolvedValue(null);
    repo.trovaPerId.mockResolvedValue(null);
    const s = new ApprovazioniService(repo as never, { aggiungiAzione: vi.fn() } as never);
    await expect(s.approva('c2', 'a1', 'user_x')).rejects.toThrow(NotFoundException);
  });

  it('se la coda rifiuta, l\'azione torna in_attesa (non resta approvata a vuoto)', async () => {
    const repo = repoFinto();
    repo.cambiaStato.mockResolvedValueOnce(azione('approvata')).mockResolvedValueOnce(azione('in_attesa'));
    const coda = { aggiungiAzione: vi.fn().mockRejectedValue(new Error('Redis giu')) };
    const s = new ApprovazioniService(repo as never, coda as never);

    await expect(s.approva('c1', 'a1', 'user_1')).rejects.toThrow('Redis giu');
    expect(repo.cambiaStato).toHaveBeenLastCalledWith('c1', 'a1', ['approvata'], 'in_attesa', 'user_1', {}, expect.any(String));
  });

  it('rifiuta salva motivo e chi ha deciso', async () => {
    const repo = repoFinto();
    repo.cambiaStato.mockResolvedValue(azione('rifiutata'));
    const s = new ApprovazioniService(repo as never, { aggiungiAzione: vi.fn() } as never);
    await s.rifiuta('c1', 'a1', 'user_1', '  cliente gia\' sollecitato  ');
    expect(repo.cambiaStato).toHaveBeenCalledWith(
      'c1', 'a1', ['in_attesa'], 'rifiutata', 'user_1',
      { decisaDa: 'user_1', motivo: 'cliente gia\' sollecitato' }, 'cliente gia\' sollecitato',
    );
  });

  it('riprova vale solo per le azioni fallite e azzera l\'errore', async () => {
    const repo = repoFinto();
    repo.cambiaStato.mockResolvedValue(azione('approvata'));
    const coda = { aggiungiAzione: vi.fn().mockResolvedValue({}) };
    const s = new ApprovazioniService(repo as never, coda as never);
    await s.riprova('c1', 'a1', 'user_1');
    expect(repo.cambiaStato.mock.calls[0].slice(2, 6)).toEqual([['fallita'], 'approvata', 'user_1', { decisaDa: 'user_1', errore: null }]);
    expect(coda.aggiungiAzione).toHaveBeenCalled();
  });
});

describe('EsecuzioneWorker', () => {
  const job = (extra: Partial<Job> = {}) =>
    ({ name: JOB_ESEGUI_AZIONE, data: { clienteId: 'c1', azioneId: 'a1' }, attemptsMade: 1, opts: { attempts: 5 }, ...extra }) as unknown as Job<never>;

  function crea(stato: Azione['stato'], interruttore = true, tipo = 'test') {
    const repo = repoFinto();
    repo.trovaPerId.mockResolvedValue(azione(stato, { tipo }));
    repo.cambiaStato.mockResolvedValue(azione('eseguita'));
    const clienti = { trovaPerId: vi.fn().mockResolvedValue({ id: 'c1', interruttore_attivo: interruttore }) };
    const esegui = vi.fn().mockResolvedValue(undefined);
    const w = new EsecuzioneWorker(repo as never, clienti as never, [{ tipo: 'test', esegui }]);
    return { w, repo, esegui };
  }

  it('esegue un\'azione approvata e la segna come eseguita', async () => {
    const { w, repo, esegui } = crea('approvata');
    await w.elabora(job());
    expect(esegui).toHaveBeenCalled();
    expect(repo.cambiaStato).toHaveBeenCalledWith('c1', 'a1', ['approvata'], 'eseguita', 'sistema', { eseguita: true, errore: null });
  });

  it('salva nei dettagli cio\' che l\'esecutore restituisce', async () => {
    const { w, repo, esegui } = crea('approvata');
    const salvaRisultato = vi.fn();
    Object.assign(repo, { salvaRisultato });
    esegui.mockResolvedValue({ link: 'https://cal/x' });
    await w.elabora(job());
    expect(salvaRisultato).toHaveBeenCalledWith('c1', 'a1', { link: 'https://cal/x' });
  });

  it('non riesegue un\'azione gia\' eseguita (idempotente)', async () => {
    const { w, esegui, repo } = crea('eseguita');
    await w.elabora(job());
    expect(esegui).not.toHaveBeenCalled();
    expect(repo.cambiaStato).not.toHaveBeenCalled();
  });

  it('interruttore spento al momento dell\'esecuzione: errore definitivo, niente esecuzione', async () => {
    const { w, esegui } = crea('approvata', false);
    await expect(w.elabora(job())).rejects.toThrow(ErroreDefinitivo);
    expect(esegui).not.toHaveBeenCalled();
  });

  it('tipo senza esecutore: errore definitivo con messaggio chiaro', async () => {
    const { w } = crea('approvata', true, 'sollecito-mail');
    await expect(w.elabora(job())).rejects.toThrow('Nessun esecutore disponibile per il tipo "sollecito-mail"');
  });

  it('errore temporaneo con tentativi rimasti: non segna fallita (BullMQ ritenta)', async () => {
    const { w, repo } = crea('approvata');
    await w.gestisciFallimento(job({ attemptsMade: 2 }), new Error('timeout'));
    expect(repo.cambiaStato).not.toHaveBeenCalled();
  });

  it('tentativi esauriti o errore definitivo: segna fallita con l\'errore', async () => {
    const { w, repo } = crea('approvata');
    await w.gestisciFallimento(job({ attemptsMade: 5 }), new Error('timeout'));
    await w.gestisciFallimento(job({ attemptsMade: 1 }), new ErroreDefinitivo('interruttore spento'));
    expect(repo.cambiaStato).toHaveBeenNthCalledWith(1, 'c1', 'a1', ['approvata'], 'fallita', 'sistema', { errore: 'timeout' });
    expect(repo.cambiaStato).toHaveBeenNthCalledWith(2, 'c1', 'a1', ['approvata'], 'fallita', 'sistema', { errore: 'interruttore spento' });
  });
});
