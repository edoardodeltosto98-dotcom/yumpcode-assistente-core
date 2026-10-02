import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

// Token firmato (HMAC-SHA256) che porta il clienteId attraverso il flusso
// OAuth Google. Sostituisce il vecchio "state = clienteId in chiaro": con
// quello chiunque poteva aprire /auth/google?clienteId=<id altrui> e
// collegare il proprio account Google al cliente di qualcun altro.
// Ora il link lo genera solo il backend, per un admin autenticato, ed
// e' valido pochi minuti.

export interface DatiStato {
  clienteId: string;
}

const DURATA_DEFAULT_SECONDI = 10 * 60;

// Chiave dedicata derivata da ENCRYPTION_KEY (HKDF): nessuna variabile
// d'ambiente in piu', ma la chiave di cifratura dei token non viene mai
// usata direttamente per firmare.
export function chiaveFirmaStato(encryptionKeyBase64: string): Buffer {
  const base = Buffer.from(encryptionKeyBase64, 'base64');
  return Buffer.from(hkdfSync('sha256', base, Buffer.alloc(0), 'yumpcode-oauth-state-v1', 32));
}

export function firmaStato(dati: DatiStato, chiave: Buffer, durataSecondi = DURATA_DEFAULT_SECONDI): string {
  const payload = Buffer.from(
    JSON.stringify({
      c: dati.clienteId,
      exp: Math.floor(Date.now() / 1000) + durataSecondi,
      n: randomBytes(8).toString('base64url'),
    }),
  ).toString('base64url');
  const firma = createHmac('sha256', chiave).update(payload).digest('base64url');
  return `${payload}.${firma}`;
}

// Ritorna i dati se il token e' integro e non scaduto, altrimenti null.
export function verificaStato(token: string, chiave: Buffer): DatiStato | null {
  const [payload, firma] = token.split('.');
  if (!payload || !firma) return null;

  const attesa = createHmac('sha256', chiave).update(payload).digest();
  const ricevuta = Buffer.from(firma, 'base64url');
  if (ricevuta.length !== attesa.length || !timingSafeEqual(ricevuta, attesa)) return null;

  try {
    const dati = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as {
      c?: string;
      exp?: number;
    };
    if (!dati.c || typeof dati.exp !== 'number') return null;
    if (dati.exp < Math.floor(Date.now() / 1000)) return null;
    return { clienteId: dati.c };
  } catch {
    return null;
  }
}
