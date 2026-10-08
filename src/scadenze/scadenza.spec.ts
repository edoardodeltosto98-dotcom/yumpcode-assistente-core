import { giornoDopo, leggiScadenza, minutiAvviso } from './scadenza.js';

const valida = { titolo: '  Fattura Rossi  ', data: '2026-11-30', giorniPreavviso: 7, note: ' pagare con bonifico ' };

describe('leggiScadenza', () => {
  it('restituisce i dati ripuliti', () => {
    expect(leggiScadenza(valida)).toEqual({ titolo: 'Fattura Rossi', data: '2026-11-30', giorniPreavviso: 7, note: 'pagare con bonifico' });
  });

  it('note vuote: le toglie', () => {
    expect(leggiScadenza({ ...valida, note: '   ' })).not.toHaveProperty('note');
  });

  it.each([
    ['dati mancanti', null],
    ['titolo vuoto', { ...valida, titolo: ' ' }],
    ['data in altro formato', { ...valida, data: '30/11/2026' }],
    ['data inesistente', { ...valida, data: '2026-02-30' }],
    ['preavviso negativo', { ...valida, giorniPreavviso: -1 }],
    ['preavviso oltre 4 settimane', { ...valida, giorniPreavviso: 29 }],
    ['preavviso non intero', { ...valida, giorniPreavviso: 1.5 }],
    ['note non testo', { ...valida, note: 3 }],
  ])('rifiuta: %s', (_nome, dati) => {
    expect(typeof leggiScadenza(dati)).toBe('string');
  });
});

describe('giornoDopo / minutiAvviso', () => {
  it('passa al mese e all\'anno successivo', () => {
    expect(giornoDopo('2026-10-31')).toBe('2026-11-01');
    expect(giornoDopo('2026-12-31')).toBe('2027-01-01');
  });

  it('avviso N giorni prima alle 9:00, entro il limite di Google', () => {
    expect(minutiAvviso(0)).toBe(0);
    expect(minutiAvviso(1)).toBe(900); // il giorno prima alle 9:00
    expect(minutiAvviso(7)).toBe(7 * 1440 - 540);
    expect(minutiAvviso(28)).toBeLessThanOrEqual(40320);
  });
});
