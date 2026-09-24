import { Injectable, OnModuleInit } from '@nestjs/common';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

/**
 * Cifratura a livello di campo per i dati dinamici dei clienti
 * (token OAuth, refresh token, ecc. - MAI le chiavi di servizio, che
 * restano in .env.local).
 *
 * Algoritmo: AES-256-GCM. La chiave arriva da ENCRYPTION_KEY (env),
 * che in produzione va salvata nel gestore segreti dell'hosting
 * (Vercel/Supabase secrets), non in un file versionato.
 *
 * Formato del testo cifrato memorizzato: "v1:<iv>:<authTag>:<ciphertext>"
 * tutto in base64, cosi' e' possibile far evolvere l'algoritmo in futuro
 * senza rompere i dati gia' salvati.
 */
@Injectable()
export class EncryptionService implements OnModuleInit {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 12; // raccomandato per GCM
  private static readonly VERSION = 'v1';

  private key!: Buffer;

  onModuleInit() {
    const raw = process.env.ENCRYPTION_KEY;
    if (!raw) {
      throw new Error(
        'ENCRYPTION_KEY mancante. Genera una chiave con "npm run keygen" ' +
          'e impostala in .env.local (mai nel repository).',
      );
    }
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32) {
      throw new Error(
        'ENCRYPTION_KEY non valida: deve essere una chiave a 32 byte ' +
          'codificata in base64 (usa "npm run keygen").',
      );
    }
    this.key = key;
  }

  /** Cifra un valore in chiaro (es. un access/refresh token OAuth). */
  encrypt(plaintext: string): string {
    const iv = randomBytes(EncryptionService.IV_LENGTH);
    const cipher = createCipheriv(EncryptionService.ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return [
      EncryptionService.VERSION,
      iv.toString('base64'),
      authTag.toString('base64'),
      ciphertext.toString('base64'),
    ].join(':');
  }

  /** Decifra un valore prodotto da encrypt(). */
  decrypt(stored: string): string {
    const parts = stored.split(':');
    if (parts.length !== 4 || parts[0] !== EncryptionService.VERSION) {
      throw new Error('Formato del valore cifrato non riconosciuto.');
    }
    const [, ivB64, authTagB64, ciphertextB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    const ciphertext = Buffer.from(ciphertextB64, 'base64');

    const decipher = createDecipheriv(
      EncryptionService.ALGORITHM,
      this.key,
      iv,
    );
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  }
}
