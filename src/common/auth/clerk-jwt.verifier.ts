import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createPublicKey, verify, type JsonWebKey, type KeyObject } from 'node:crypto';

// Claim del token di sessione Clerk che ci interessano. Clerk Core 3
// mette l'organizzazione attiva in un oggetto compatto "o" (non nei
// vecchi org_id/org_role piatti): stesso motivo per cui le policy RLS
// usano auth.jwt() -> 'o' ->> 'id' (vedi README, sezione multi-tenant).
export interface ClaimsClerk {
  sub: string;
  iss: string;
  exp: number;
  nbf?: number;
  azp?: string;
  o?: { id?: string; rol?: string; slg?: string };
}

export class TokenNonValidoError extends Error {}

// Tolleranza sugli orologi tra la macchina di Clerk e la nostra.
const TOLLERANZA_SECONDI = 5;
// Non riscarichiamo le chiavi pubbliche piu' di una volta al minuto,
// anche se arrivano token con un "kid" sconosciuto (evita che token
// falsi ci facciano martellare l'endpoint di Clerk).
const INTERVALLO_MINIMO_REFRESH_MS = 60_000;

// Verifica i token di sessione Clerk senza librerie esterne: firma RS256
// con le chiavi pubbliche dell'istanza Clerk (JWKS), scadenza, emittente
// e, se configurato, il sito da cui arriva la richiesta (azp). Le chiavi
// pubbliche sono appunto pubbliche: non serve nessuna secret key.
@Injectable()
export class ClerkJwtVerifier implements OnModuleInit {
  private readonly logger = new Logger(ClerkJwtVerifier.name);
  private chiavi = new Map<string, KeyObject>();
  private ultimoRefresh = 0;

  issuer: string | undefined;
  authorizedParties: string[] = [];

  onModuleInit() {
    this.issuer = process.env.CLERK_ISSUER?.replace(/\/+$/, '');
    this.authorizedParties = (process.env.CLERK_AUTHORIZED_PARTIES ?? 'http://localhost:3000')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);

    // Non blocchiamo l'avvio (il webhook Clerk e la callback Google devono
    // continuare a funzionare), ma ogni endpoint protetto rispondera' 500
    // con questo stesso messaggio finche' la variabile manca.
    if (!this.issuer) {
      this.logger.error(
        'CLERK_ISSUER mancante: gli endpoint protetti rifiuteranno ogni richiesta. ' +
          'Impostala in .env.local (vedi .env.example).',
      );
    }
  }

  async verifica(token: string): Promise<ClaimsClerk> {
    if (!this.issuer) {
      throw new Error('CLERK_ISSUER mancante in .env.local: impossibile verificare i token Clerk.');
    }

    const parti = token.split('.');
    if (parti.length !== 3) throw new TokenNonValidoError('Formato token non valido.');
    const [headerB64, payloadB64, firmaB64] = parti;

    let header: { alg?: string; kid?: string };
    let claims: ClaimsClerk;
    try {
      header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf-8'));
      claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
    } catch {
      throw new TokenNonValidoError('Token non decodificabile.');
    }

    // Accettiamo solo RS256: niente "alg: none" o algoritmi simmetrici.
    if (header.alg !== 'RS256' || !header.kid) {
      throw new TokenNonValidoError('Algoritmo del token non supportato.');
    }

    const chiave = await this.chiavePer(header.kid);
    const firmaValida = verify(
      'RSA-SHA256',
      Buffer.from(`${headerB64}.${payloadB64}`),
      chiave,
      Buffer.from(firmaB64, 'base64url'),
    );
    if (!firmaValida) throw new TokenNonValidoError('Firma del token non valida.');

    const adesso = Math.floor(Date.now() / 1000);
    if (typeof claims.exp !== 'number' || claims.exp + TOLLERANZA_SECONDI < adesso) {
      throw new TokenNonValidoError('Token scaduto.');
    }
    if (typeof claims.nbf === 'number' && claims.nbf - TOLLERANZA_SECONDI > adesso) {
      throw new TokenNonValidoError('Token non ancora valido.');
    }
    if (claims.iss !== this.issuer) {
      throw new TokenNonValidoError('Token emesso da un\'istanza Clerk diversa.');
    }
    // azp = il sito che ha chiesto il token. Lo controlliamo solo se Clerk
    // lo mette (nei token di sessione del browser c'e' sempre).
    if (claims.azp && this.authorizedParties.length > 0 && !this.authorizedParties.includes(claims.azp)) {
      throw new TokenNonValidoError('Token generato da un sito non autorizzato.');
    }
    if (!claims.sub) throw new TokenNonValidoError('Token senza utente.');

    return claims;
  }

  private async chiavePer(kid: string): Promise<KeyObject> {
    const inCache = this.chiavi.get(kid);
    if (inCache) return inCache;

    if (Date.now() - this.ultimoRefresh > INTERVALLO_MINIMO_REFRESH_MS || this.chiavi.size === 0) {
      await this.scaricaChiavi();
    }
    const chiave = this.chiavi.get(kid);
    if (!chiave) throw new TokenNonValidoError('Chiave di firma sconosciuta.');
    return chiave;
  }

  private async scaricaChiavi(): Promise<void> {
    this.ultimoRefresh = Date.now();
    const risposta = await fetch(`${this.issuer}/.well-known/jwks.json`);
    if (!risposta.ok) {
      throw new Error(`Impossibile scaricare le chiavi Clerk (HTTP ${risposta.status}).`);
    }
    const { keys } = (await risposta.json()) as { keys: (JsonWebKey & { kid?: string })[] };
    const nuove = new Map<string, KeyObject>();
    for (const jwk of keys ?? []) {
      if (jwk.kid && jwk.kty === 'RSA') {
        nuove.set(jwk.kid, createPublicKey({ key: jwk, format: 'jwk' }));
      }
    }
    this.chiavi = nuove;
  }
}
