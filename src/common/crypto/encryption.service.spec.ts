import { beforeEach, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { EncryptionService } from './encryption.service.js';

describe('EncryptionService', () => {
  let service: EncryptionService;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
    service = new EncryptionService();
    service.onModuleInit();
  });

  it('decifra correttamente un valore appena cifrato (round-trip)', () => {
    const plaintext = 'un-token-oauth-molto-segreto';
    const stored = service.encrypt(plaintext);
    expect(stored).not.toContain(plaintext);
    expect(service.decrypt(stored)).toBe(plaintext);
  });

  it('produce un output diverso ad ogni chiamata (IV casuale)', () => {
    const a = service.encrypt('stesso-valore');
    const b = service.encrypt('stesso-valore');
    expect(a).not.toBe(b);
  });

  it('rifiuta un valore manomesso', () => {
    const stored = service.encrypt('valore-originale');
    const manomesso = stored.slice(0, -4) + 'AAAA';
    expect(() => service.decrypt(manomesso)).toThrow();
  });

  it('richiede ENCRYPTION_KEY per avviarsi', () => {
    delete process.env.ENCRYPTION_KEY;
    const other = new EncryptionService();
    expect(() => other.onModuleInit()).toThrow(/ENCRYPTION_KEY mancante/);
  });
});
