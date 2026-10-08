import { BadRequestException } from '@nestjs/common';
import type { Cliente } from '../common/database/repositories/clienti.repository.js';
import { ScadenzeController } from './scadenze.controller.js';

const cliente = { id: 'c1' } as Cliente;
const dati = { titolo: 'Fattura Rossi', data: '2099-01-15', giorniPreavviso: 7 };

function crea(regolaEsistente: boolean) {
  const trigger = { valuta: vi.fn().mockResolvedValue({ creata: true }) };
  const regole = { trova: vi.fn().mockResolvedValue(regolaEsistente ? { id: 'r1' } : null), salva: vi.fn() };
  return { trigger, regole, controller: new ScadenzeController(trigger as never, regole as never) };
}

describe('ScadenzeController', () => {
  it('propone un promemoria per il cliente del token, con la scadenza nei dettagli', async () => {
    const { trigger, controller } = crea(true);
    await controller.crea(cliente, dati);
    const richiesta = trigger.valuta.mock.calls[0][0];
    expect(richiesta).toMatchObject({
      clienteId: 'c1',
      processo: 'scadenze',
      tipo: 'promemoria-scadenza',
      dettagli: { scadenza: dati },
    });
    expect(richiesta.recordRiferimento).toMatch(/^scadenza-[0-9a-f-]{36}$/);
  });

  it('prima scadenza: crea la regola "scadenze" valida a qualsiasi ora', async () => {
    const { regole, controller } = crea(false);
    await controller.crea(cliente, dati);
    expect(regole.salva).toHaveBeenCalledWith('c1', 'scadenze', expect.objectContaining({ fasciaOrariaInizio: '00:00', fasciaOrariaFine: '23:59' }));
  });

  it('regola gia\' presente: non la tocca', async () => {
    const { regole, controller } = crea(true);
    await controller.crea(cliente, dati);
    expect(regole.salva).not.toHaveBeenCalled();
  });

  it.each([
    ['data passata', { ...dati, data: '2020-01-01' }],
    ['dati non validi', { ...dati, giorniPreavviso: 40 }],
  ])('rifiuta (%s) senza proporre nulla', async (_nome, corpo) => {
    const { trigger, controller } = crea(true);
    await expect(controller.crea(cliente, corpo)).rejects.toThrow(BadRequestException);
    expect(trigger.valuta).not.toHaveBeenCalled();
  });
});
