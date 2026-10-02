import { describe, expect, it, vi } from 'vitest';
import { TriggerService } from './trigger.service.js';
import type { RegoleFiltroService } from './regole-filtro.service.js';
import type { AzioniRepository, Azione } from '../common/database/repositories/azioni.repository.js';

function creaAzioneFinta(sovrascrizioni: Partial<Azione> = {}): Azione {
  return {
    id: 'azione-1',
    cliente_id: 'cliente-1',
    regola_id: null,
    processo: 'solleciti',
    record_riferimento: 'fattura-42',
    chiave_idempotenza: 'cliente-1:fattura-42:sollecito:2026-01-01',
    tipo: 'sollecito',
    stato: 'in_attesa',
    dettagli: null,
    created_at: '2026-01-01T00:00:00Z',
    eseguita_il: null,
    updated_at: '2026-01-01T00:00:00Z',
    ...sovrascrizioni,
  };
}

describe('TriggerService', () => {
  it('non scrive nulla se il filtro nega', async () => {
    const filtro = {
      valuta: vi.fn(async () => ({ consentito: false, motivo: 'Fuori fascia oraria.' })),
    } as unknown as RegoleFiltroService;
    const azioni = { creaSeNuova: vi.fn() } as unknown as AzioniRepository;
    const service = new TriggerService(filtro, azioni);

    const risultato = await service.valuta({
      clienteId: 'cliente-1',
      processo: 'solleciti',
      recordRiferimento: 'fattura-42',
      tipo: 'sollecito',
    });

    expect(risultato).toEqual({ creata: false, motivo: 'Fuori fascia oraria.' });
    expect(azioni.creaSeNuova).not.toHaveBeenCalled();
  });

  it('crea l azione quando il filtro consente e non e un duplicato', async () => {
    const filtro = { valuta: vi.fn(async () => ({ consentito: true })) } as unknown as RegoleFiltroService;
    const azioneAttesa = creaAzioneFinta();
    const azioni = {
      creaSeNuova: vi.fn(async () => azioneAttesa),
    } as unknown as AzioniRepository;
    const service = new TriggerService(filtro, azioni);

    const risultato = await service.valuta({
      clienteId: 'cliente-1',
      processo: 'solleciti',
      recordRiferimento: 'fattura-42',
      tipo: 'sollecito',
    });

    expect(risultato).toEqual({ creata: true, azione: azioneAttesa });
    const chiamata = (azioni.creaSeNuova as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(chiamata.chiaveIdempotenza).toMatch(/^cliente-1:fattura-42:sollecito:\d{4}-\d{2}-\d{2}$/);
  });

  it('segnala un duplicato quando l inserimento non produce righe', async () => {
    const filtro = { valuta: vi.fn(async () => ({ consentito: true })) } as unknown as RegoleFiltroService;
    const azioni = { creaSeNuova: vi.fn(async () => null) } as unknown as AzioniRepository;
    const service = new TriggerService(filtro, azioni);

    const risultato = await service.valuta({
      clienteId: 'cliente-1',
      processo: 'solleciti',
      recordRiferimento: 'fattura-42',
      tipo: 'sollecito',
    });

    expect(risultato.creata).toBe(false);
    if (!risultato.creata) {
      expect(risultato.motivo).toMatch(/duplicato/i);
    }
  });
});
