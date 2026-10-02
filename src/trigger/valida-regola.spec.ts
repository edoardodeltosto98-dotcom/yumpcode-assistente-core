import { BadRequestException } from '@nestjs/common';
import { validaDatiRegola, validaProcesso } from './valida-regola.js';

describe('validaDatiRegola', () => {
  it('accetta dati corretti, ripulisce i contatti e scarta i campi sconosciuti', () => {
    const dati = validaDatiRegola({
      giorniAttesa: 10,
      fasciaOrariaInizio: '09:00',
      fasciaOrariaFine: '18:30',
      maxAzioniGiorno: 20,
      contattiEsclusi: [' Mario@Esempio.it ', 'mario@esempio.it', ''],
      attiva: false,
      cliente_id: 'altro-cliente',
    });
    expect(dati).toEqual({
      giorniAttesa: 10,
      fasciaOrariaInizio: '09:00',
      fasciaOrariaFine: '18:30',
      maxAzioniGiorno: 20,
      contattiEsclusi: ['mario@esempio.it'],
      attiva: false,
    });
  });

  it('aggiornamento parziale: restituisce solo i campi passati', () => {
    expect(validaDatiRegola({ attiva: true })).toEqual({ attiva: true });
  });

  it.each([
    [{ fasciaOrariaInizio: '25:00' }],
    [{ fasciaOrariaFine: '9:00' }],
    [{ maxAzioniGiorno: -1 }],
    [{ maxAzioniGiorno: 2.5 }],
    [{ giorniAttesa: '10' }],
    [{ contattiEsclusi: 'mario@esempio.it' }],
    [{ contattiEsclusi: [1] }],
    [{ attiva: 'si' }],
    [null],
    [[]],
  ])('rifiuta %j', (corpo) => {
    expect(() => validaDatiRegola(corpo)).toThrow(BadRequestException);
  });
});

describe('validaProcesso', () => {
  it('accetta minuscole, cifre e trattini', () => {
    expect(validaProcesso('solleciti-fatture')).toBe('solleciti-fatture');
  });
  it.each([[''], ['Solleciti'], ['con spazio'], ['-inizio'], [undefined], ['a'.repeat(61)]])('rifiuta %j', (p) => {
    expect(() => validaProcesso(p)).toThrow(BadRequestException);
  });
});
