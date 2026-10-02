import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleCalendarService } from './google-calendar.service.js';
import type { GoogleTokenService } from '../auth/google-token.service.js';

function creaTokenServiceFinto(accessToken = 'access-di-test') {
  return {
    ottieniAccessTokenValido: vi.fn(async () => accessToken),
  } as unknown as GoogleTokenService;
}

describe('GoogleCalendarService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('elenca gli eventi mappando solo i campi che servono', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 'evt-1',
            summary: 'Riunione con cliente',
            htmlLink: 'https://calendar.google.com/evt-1',
            start: { dateTime: '2026-10-01T10:00:00+02:00' },
            end: { dateTime: '2026-10-01T11:00:00+02:00' },
          },
          { id: 'evt-2', start: { date: '2026-10-02' }, end: { date: '2026-10-03' } },
        ],
      }),
    }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    const service = new GoogleCalendarService(creaTokenServiceFinto());
    const eventi = await service.elencaProssimiEventi('cliente-1', 7);

    expect(eventi).toHaveLength(2);
    expect(eventi[0]).toEqual({
      id: 'evt-1',
      titolo: 'Riunione con cliente',
      inizio: '2026-10-01T10:00:00+02:00',
      fine: '2026-10-01T11:00:00+02:00',
      link: 'https://calendar.google.com/evt-1',
    });
    expect(eventi[1].titolo).toBe('(senza titolo)');

    const [url, opzioni] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/calendars/primary/events?');
    expect((opzioni.headers as Record<string, string>).Authorization).toBe(
      'Bearer access-di-test',
    );
  });

  it('crea un evento e rilancia titolo/inizio/fine dalla risposta', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        id: 'evt-nuovo',
        summary: 'Nuovo appuntamento',
        htmlLink: 'https://calendar.google.com/evt-nuovo',
        start: { dateTime: '2026-10-05T09:00:00+02:00' },
        end: { dateTime: '2026-10-05T09:30:00+02:00' },
      }),
    }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    const service = new GoogleCalendarService(creaTokenServiceFinto());
    const evento = await service.creaEvento('cliente-1', {
      titolo: 'Nuovo appuntamento',
      inizio: '2026-10-05T09:00:00+02:00',
      fine: '2026-10-05T09:30:00+02:00',
    });

    expect(evento.id).toBe('evt-nuovo');
    const [url, opzioni] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/calendars/primary/events');
    expect(opzioni.method).toBe('POST');
    expect(JSON.parse(String(opzioni.body)).summary).toBe('Nuovo appuntamento');
  });

  it('con un id scelto da noi: se l\'evento esiste gia\' (409) restituisce quello, senza doppioni', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 409, text: async () => 'duplicate' })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'abc123', summary: 'Gia creato' }) });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const service = new GoogleCalendarService(creaTokenServiceFinto());
    const evento = await service.creaEvento(
      'cliente-1',
      { titolo: 'Gia creato', inizio: '2026-10-05T09:00:00+02:00', fine: '2026-10-05T09:30:00+02:00' },
      'abc123',
    );

    expect(evento.id).toBe('abc123');
    expect(JSON.parse(String((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body)).id).toBe('abc123');
    expect((fetchSpy.mock.calls[1] as [string])[0]).toContain('/events/abc123');
  });

  it('rifiuta la creazione di un evento senza titolo', async () => {
    const service = new GoogleCalendarService(creaTokenServiceFinto());
    await expect(
      service.creaEvento('cliente-1', {
        titolo: '',
        inizio: '2026-10-05T09:00:00+02:00',
        fine: '2026-10-05T09:30:00+02:00',
      }),
    ).rejects.toThrow(/titolo/);
  });

  it('propaga un errore leggibile se Google Calendar risponde con un errore', async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 403,
      text: async () => '{"error":{"message":"insufficient permissions"}}',
    })) as unknown as typeof fetch;

    const service = new GoogleCalendarService(creaTokenServiceFinto());
    await expect(service.elencaProssimiEventi('cliente-1')).rejects.toThrow(
      /Chiamata a Google Calendar fallita/,
    );
  });
});
