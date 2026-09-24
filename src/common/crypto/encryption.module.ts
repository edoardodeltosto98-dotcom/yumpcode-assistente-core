import { Global, Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service.js';

/**
 * Modulo globale: EncryptionService e' disponibile ovunque senza
 * doverlo re-importare in ogni feature module (i token OAuth verranno
 * cifrati/decifrati in piu' punti: salvataggio connessione, refresh, invio mail).
 */
@Global()
@Module({
  providers: [EncryptionService],
  exports: [EncryptionService],
})
export class EncryptionModule {}
