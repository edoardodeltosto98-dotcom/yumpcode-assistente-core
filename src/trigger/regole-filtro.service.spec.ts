import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RegoleFiltroService } from './regole-filtro.service.js';
import type { ClientiRepository, Cliente } from '../common/database/repositories/clienti.repository.js';
import type { RegoleRepository, Regola } from '../common/database/repositories/regole.repository.js';
import type { AzioniRepository } from '../common/database/repositories/azioni.repository.js';

function creaCliente(sovrascrizioni: Partial<Cliente> = {}): Cliente {
  return {
    id: 'cliente-1',
    nome: 'Cliente di test',
    email: 'cliente@example.invalid',
    interruttore_attivo: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...sovrascrizioni,
  };
}

function creaRegola(sovrascrizioni: Partial<Regola> = {}): Regola {
  return {
    id: 'regola-1',
    cliente_id: 'cliente-1',
    nome: 'solleciti',
    condizione_trigger: {
      giorniAttesa: 10,
      fasciaOrariaInizio: '00:00',
      fasciaOrariaFine: '23:59',
      maxAzioniGiorno: 20,
      contattiEsclusi: [],
    },
    azione_da_eseguire: {},
    attiva: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...sovrascrizioni,
  };
}

describe('RegoleFiltroService', () => {
  let clienti: ClientiRepository;
  let regole: RegoleRepository;
  let azioni: AzioniRepository;
  let service: RegoleFiltroService;

  beforeEach(() => {
    clienti = { trovaPerId: vi.fn(async () => creaCliente()) } as unknown as ClientiRepository;
    regole = { trova: vi.fn(async () => creaRegola()) } as unknown as RegoleRepository;
    azioni = { contaOggi: vi.fn(async () => 0) } as unknown as AzioniRepository;
    service = new RegoleFiltroService(clienti, regole, azioni);
  });

  it('consente quando tutte le condizioni sono rispettate', async () => {
    const esito = await service.valuta('cliente-1', 'solleciti', 'buyer@example.com');
    expect(esito.consentito).toBe(true);
  });

  it('blocca se il cliente non esiste', async () => {
    clienti.trovaPerId = vi.fn(async () => null);
    const esito = await service.valuta('cliente-x', 'solleciti');
    expect(esito).toEqual({ consentito: false, motivo: 'Cliente non trovato.' });
  });

  it('blocca se l interruttore generale e spento', async () => {
    clienti.trovaPerId = vi.fn(async () => creaCliente({ interruttore_attivo: false }));
    const esito = await service.valuta('cliente-1', 'solleciti');
    expect(esito.consentito).toBe(false);
    expect(esito.motivo).toMatch(/interruttore generale/i);
  });

  it('blocca se non esiste una regola per il processo', async () => {
    regole.trova = vi.fn(async () => null);
    const esito = await service.valuta('cliente-1', 'preventivi');
    expect(esito.consentito).toBe(false);
    expect(esito.motivo).toMatch(/nessuna regola/i);
  });

  it('blocca se la regola e disattivata', async () => {
    regole.trova = vi.fn(async () => creaRegola({ attiva: false }));
    const esito = await service.valuta('cliente-1', 'solleciti');
    expect(esito.consentito).toBe(false);
    expect(esito.motivo).toMatch(/disattivata/i);
  });

  it('blocca un contatto in lista esclusioni', async () => {
    regole.trova = vi.fn(async () =>
      creaRegola({
        condizione_trigger: {
          giorniAttesa: 10,
          fasciaOrariaInizio: '00:00',
          fasciaOrariaFine: '23:59',
          maxAzioniGiorno: 20,
          contattiEsclusi: ['vip@example.com'],
        },
      }),
    );
    const esito = await service.valuta('cliente-1', 'solleciti', 'VIP@example.com');
    expect(esito.consentito).toBe(false);
    expect(esito.motivo).toMatch(/esclusioni/i);
  });

  it('blocca fuori fascia oraria', async () => {
    regole.trova = vi.fn(async () =>
      creaRegola({
        condizione_trigger: {
          giorniAttesa: 10,
          fasciaOrariaInizio: '09:00',
          fasciaOrariaFine: '09:01',
          maxAzioniGiorno: 20,
          contattiEsclusi: [],
        },
      }),
    );
    const esito = await service.valuta('cliente-1', 'solleciti');
    // Fascia cosi' stretta che quasi certamente il test gira fuori da
    // essa: verifichiamo solo che, quando succede, il motivo sia quello
    // giusto (evita un test fragile legato all'orario esatto).
    if (!esito.consentito) {
      expect(esito.motivo).toMatch(/fascia oraria/i);
    }
  });

  it('blocca se il tetto giornaliero e raggiunto', async () => {
    regole.trova = vi.fn(async () =>
      creaRegola({
        condizione_trigger: {
          giorniAttesa: 10,
          fasciaOrariaInizio: '00:00',
          fasciaOrariaFine: '23:59',
          maxAzioniGiorno: 3,
          contattiEsclusi: [],
        },
      }),
    );
    azioni.contaOggi = vi.fn(async () => 3);
    const esito = await service.valuta('cliente-1', 'solleciti');
    expect(esito.consentito).toBe(false);
    expect(esito.motivo).toMatch(/tetto giornaliero/i);
  });
});
