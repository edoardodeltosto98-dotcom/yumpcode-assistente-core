import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleTokenService } from './google-token.service.js';
import type { ConnessioniRepository } from '../common/database/repositories/connessioni.repository.js';

function creaRepoFinta(iniziale: {
  accessToken: string;
  refreshToken: string | null;
  scadutaIl: Date | null;
}) {
  const stato = { ...iniziale };
  return {
    trova: vi.fn(async () => ({ ...stato })),
    salva: vi.fn(async (_clienteId: string, _provider: string, token: typeof iniziale) => {
      stato.accessToken = token.accessToken;
      if (token.refreshToken) stato.refreshToken = token.refreshToken;
      stato.scadutaIl = token.scadutaIl;
      return { id: 'fake-id' } as never;
    }),
  } as unknown as ConnessioniRepository;
}

describe('GoogleTokenService', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'client-id-test';
    process.env.GOOGLE_CLIENT_SECRET = 'client-secret-test';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('restituisce il token salvato se non e ancora scaduto', async () => {
    const repo = creaRepoFinta({
      accessToken: 'access-valido',
      refreshToken: 'refresh-x',
      scadutaIl: new Date(Date.now() + 10 * 60 * 1000),
    });
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const service = new GoogleTokenService(repo);
    const token = await service.ottieniAccessTokenValido('cliente-1');

    expect(token).toBe('access-valido');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rinnova il token se scaduto, usando il refresh token', async () => {
    const repo = creaRepoFinta({
      accessToken: 'access-scaduto',
      refreshToken: 'refresh-x',
      scadutaIl: new Date(Date.now() - 60 * 1000),
    });
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ access_token: 'access-nuovo', expires_in: 3600 }),
    }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    const service = new GoogleTokenService(repo);
    const token = await service.ottieniAccessTokenValido('cliente-1');

    expect(token).toBe('access-nuovo');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, opzioni] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    expect(String(opzioni.body)).toContain('grant_type=refresh_token');
    expect(String(opzioni.body)).toContain('refresh_token=refresh-x');
    expect(repo.salva).toHaveBeenCalledWith(
      'cliente-1',
      'google',
      expect.objectContaining({ accessToken: 'access-nuovo' }),
    );
  });

  it('lancia un errore se manca il refresh token e il token e scaduto', async () => {
    const repo = creaRepoFinta({
      accessToken: 'access-scaduto',
      refreshToken: null,
      scadutaIl: new Date(Date.now() - 60 * 1000),
    });
    const service = new GoogleTokenService(repo);

    await expect(service.ottieniAccessTokenValido('cliente-1')).rejects.toThrow(
      /va rifatto il consenso/,
    );
  });

  it('lancia un errore se Google rifiuta il refresh', async () => {
    const repo = creaRepoFinta({
      accessToken: 'access-scaduto',
      refreshToken: 'refresh-revocato',
      scadutaIl: new Date(Date.now() - 60 * 1000),
    });
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 400,
      text: async () => '{"error":"invalid_grant"}',
    })) as unknown as typeof fetch;

    const service = new GoogleTokenService(repo);
    await expect(service.ottieniAccessTokenValido('cliente-1')).rejects.toThrow(
      /Impossibile rinnovare/,
    );
  });
});
