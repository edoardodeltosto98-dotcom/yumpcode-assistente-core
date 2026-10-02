import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import { ClerkJwtVerifier, TokenNonValidoError } from './clerk-jwt.verifier.js';

const ISSUER = 'https://test-istanza.clerk.accounts.dev';

function creaToken(chiavePrivata: KeyObject, kid: string, claims: Record<string, unknown>, alg = 'RS256') {
  const header = Buffer.from(JSON.stringify({ alg, kid, typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const firma = sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), chiavePrivata).toString('base64url');
  return `${header}.${payload}.${firma}`;
}

describe('ClerkJwtVerifier', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const altra = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const adesso = () => Math.floor(Date.now() / 1000);
  const claimsValidi = () => ({
    sub: 'user_1',
    iss: ISSUER,
    exp: adesso() + 60,
    nbf: adesso() - 10,
    azp: 'http://localhost:3000',
    o: { id: 'org_1', rol: 'admin', slg: 'org-1' },
  });

  let verifier: ClerkJwtVerifier;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.CLERK_ISSUER = ISSUER;
    process.env.CLERK_AUTHORIZED_PARTIES = 'http://localhost:3000';
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    verifier = new ClerkJwtVerifier();
    verifier.onModuleInit();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.CLERK_ISSUER;
    delete process.env.CLERK_AUTHORIZED_PARTIES;
  });

  it('accetta un token valido e restituisce i claim con l\'organizzazione', async () => {
    const claims = await verifier.verifica(creaToken(privateKey, 'k1', claimsValidi()));
    expect(claims.sub).toBe('user_1');
    expect(claims.o?.id).toBe('org_1');
    expect(fetchMock).toHaveBeenCalledWith(`${ISSUER}/.well-known/jwks.json`);
  });

  it('scarica le chiavi una volta sola per piu\' token', async () => {
    await verifier.verifica(creaToken(privateKey, 'k1', claimsValidi()));
    await verifier.verifica(creaToken(privateKey, 'k1', claimsValidi()));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rifiuta un token firmato con un\'altra chiave', async () => {
    await expect(verifier.verifica(creaToken(altra.privateKey, 'k1', claimsValidi()))).rejects.toThrow(
      TokenNonValidoError,
    );
  });

  it('rifiuta un token scaduto', async () => {
    const token = creaToken(privateKey, 'k1', { ...claimsValidi(), exp: adesso() - 120 });
    await expect(verifier.verifica(token)).rejects.toThrow('Token scaduto.');
  });

  it('rifiuta un token di un\'altra istanza Clerk', async () => {
    const token = creaToken(privateKey, 'k1', { ...claimsValidi(), iss: 'https://altra.clerk.accounts.dev' });
    await expect(verifier.verifica(token)).rejects.toThrow(TokenNonValidoError);
  });

  it('rifiuta un token generato da un sito non autorizzato (azp)', async () => {
    const token = creaToken(privateKey, 'k1', { ...claimsValidi(), azp: 'https://sito-malevolo.example' });
    await expect(verifier.verifica(token)).rejects.toThrow('sito non autorizzato');
  });

  it('rifiuta algoritmi diversi da RS256 (es. "none")', async () => {
    const token = creaToken(privateKey, 'k1', claimsValidi(), 'none');
    await expect(verifier.verifica(token)).rejects.toThrow('Algoritmo');
  });

  it('rifiuta un token manomesso nel payload', async () => {
    const [h, , f] = creaToken(privateKey, 'k1', claimsValidi()).split('.');
    const payloadFalso = Buffer.from(JSON.stringify({ ...claimsValidi(), o: { id: 'org_altrui' } })).toString(
      'base64url',
    );
    await expect(verifier.verifica(`${h}.${payloadFalso}.${f}`)).rejects.toThrow('Firma');
  });

  it('senza CLERK_ISSUER rifiuta tutto con un messaggio chiaro', async () => {
    delete process.env.CLERK_ISSUER;
    const v = new ClerkJwtVerifier();
    v.onModuleInit();
    await expect(v.verifica(creaToken(privateKey, 'k1', claimsValidi()))).rejects.toThrow('CLERK_ISSUER mancante');
  });
});
