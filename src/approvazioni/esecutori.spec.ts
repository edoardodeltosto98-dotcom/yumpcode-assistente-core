import { NotFoundException } from '@nestjs/common';
import type { Azione } from '../common/database/repositories/azioni.repository.js';
import { ErroreDefinitivo, creaEsecutoreEventoCalendario, creaEsecutoreTestFallisce } from './esecutori.js';

const ID = '3f2b8c1e-9a4d-4e6f-8b7a-0c1d2e3f4a5b';
const evento = { titolo: 'Chiamata cliente', inizio: '2026-10-05T09:00', fine: '2026-10-05T09:30:00' };
const azione = (dettagli: Record<string, unknown> | null): Azione =>
  ({ id: ID, cliente_id: 'c1', tipo: 'evento-calendario', dettagli }) as Azione;

describe('esecutore evento-calendario', () => {
  it('crea l\'evento per il cliente dell\'azione, con id ricavato dall\'azione, e restituisce il link', async () => {
    const creaEvento = vi.fn().mockResolvedValue({ id: 'x', link: 'https://cal/x', inizio: evento.inizio, fine: evento.fine });
    const e = creaEsecutoreEventoCalendario({ creaEvento } as never);

    const risultato = await e.esegui(azione({ evento }));

    // Orari passati cosi' come sono (ora italiana), con il fuso fissato da noi.
    expect(creaEvento).toHaveBeenCalledWith(
      'c1',
      { titolo: evento.titolo, descrizione: undefined, inizio: '2026-10-05T09:00:00', fine: '2026-10-05T09:30:00', fuso: 'Europe/Rome' },
      ID.replace(/-/g, ''),
    );
    expect(risultato).toMatchObject({ eventoId: 'x', link: 'https://cal/x' });
  });

  it.each([
    ['dettagli mancanti', null],
    ['senza titolo', { evento: { ...evento, titolo: ' ' } }],
    ['data con fuso (Z)', { evento: { ...evento, inizio: '2026-10-05T07:00:00.000Z' } }],
    ['data con fuso (+02:00)', { evento: { ...evento, inizio: '2026-10-05T09:00:00+02:00' } }],
    ['data inesistente', { evento: { ...evento, inizio: '2026-02-31T09:00' } }],
    ['ora inesistente', { evento: { ...evento, inizio: '2026-10-05T25:00' } }],
    ['fine prima dell\'inizio', { evento: { ...evento, fine: '2026-10-05T08:00' } }],
    ['fine uguale all\'inizio', { evento: { ...evento, fine: '2026-10-05T09:00' } }],
  ])('dati non validi (%s): errore definitivo, Google non viene chiamato', async (_nome, dettagli) => {
    const creaEvento = vi.fn();
    const e = creaEsecutoreEventoCalendario({ creaEvento } as never);
    await expect(e.esegui(azione(dettagli))).rejects.toThrow(ErroreDefinitivo);
    expect(creaEvento).not.toHaveBeenCalled();
  });

  it('account Google non collegato: errore definitivo (ritentare da soli non serve)', async () => {
    const creaEvento = vi.fn().mockRejectedValue(new NotFoundException('Nessun account Google collegato.'));
    const e = creaEsecutoreEventoCalendario({ creaEvento } as never);
    await expect(e.esegui(azione({ evento }))).rejects.toThrow(ErroreDefinitivo);
  });

  it('errore temporaneo di Google: resta ritentabile', async () => {
    const creaEvento = vi.fn().mockRejectedValue(new Error('status 503'));
    const e = creaEsecutoreEventoCalendario({ creaEvento } as never);
    const err = await e.esegui(azione({ evento })).catch((x: Error) => x);
    expect(err).not.toBeInstanceOf(ErroreDefinitivo);
  });
});

describe('esecutore test-fallisce', () => {
  it('fallisce al primo tentativo e riesce al secondo', async () => {
    const e = creaEsecutoreTestFallisce();
    await expect(e.esegui(azione(null))).rejects.toThrow(ErroreDefinitivo);
    await expect(e.esegui(azione(null))).resolves.toBeUndefined();
  });
});
