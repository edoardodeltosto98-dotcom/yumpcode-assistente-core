import { calcolaNumeri, meseCorrente, mesePrecedente, meseValido } from './numeri.js';

describe('numeri del mese', () => {
  const righe = [
    { mese: '2026-10', processo: 'solleciti', stato: 'eseguita' as const, totale: 5 },
    { mese: '2026-10', processo: 'solleciti', stato: 'fallita' as const, totale: 1 },
    { mese: '2026-10', processo: 'solleciti', stato: 'approvata' as const, totale: 1 },
    { mese: '2026-10', processo: 'solleciti', stato: 'rifiutata' as const, totale: 2 },
    { mese: '2026-10', processo: 'preventivi', stato: 'in_attesa' as const, totale: 3 },
    { mese: '2026-09', processo: 'solleciti', stato: 'eseguita' as const, totale: 4 },
  ];

  it('conta per stato e per processo solo il mese richiesto', () => {
    const n = calcolaNumeri('2026-10', righe);
    expect(n.totale).toEqual({ proposte: 12, inAttesa: 3, approvate: 7, rifiutate: 2, eseguite: 5, fallite: 1 });
    expect(n.perProcesso.map((p) => p.processo)).toEqual(['solleciti', 'preventivi']);
    expect(n.perProcesso[0]).toMatchObject({ proposte: 9, approvate: 7, rifiutate: 2 });
    expect(calcolaNumeri('2026-09', righe).totale.proposte).toBe(4);
  });

  it('mese senza azioni: tutti zeri', () => {
    const n = calcolaNumeri('2026-08', righe);
    expect(n.totale.proposte).toBe(0);
    expect(n.perProcesso).toEqual([]);
  });

  it('mese precedente, anche a cavallo d\'anno', () => {
    expect(mesePrecedente('2026-10')).toBe('2026-09');
    expect(mesePrecedente('2026-01')).toBe('2025-12');
  });

  it('il mese corrente segue l\'ora italiana, non UTC', () => {
    // 30 settembre 22:30 UTC = 1 ottobre 00:30 in Italia
    expect(meseCorrente(new Date('2026-09-30T22:30:00Z'))).toBe('2026-10');
  });

  it('valida il formato YYYY-MM', () => {
    expect(meseValido('2026-10')).toBe(true);
    expect(['2026-13', '2026-1', 'ottobre', '2026-10-01'].some(meseValido)).toBe(false);
  });
});
