import { Injectable } from '@nestjs/common';
import { chiaveFirmaStato, firmaStato, verificaStato, type DatiStato } from '../common/auth/stato-firmato.js';

// Firma e verifica lo "state" del flusso OAuth Google (vedi
// common/auth/stato-firmato.ts). La chiave e' derivata da ENCRYPTION_KEY,
// che EncryptionService gia' esige all'avvio.
@Injectable()
export class StatoOAuthService {
  private chiave?: Buffer;

  firma(dati: DatiStato): string {
    return firmaStato(dati, this.chiaveFirma());
  }

  verifica(token: string): DatiStato | null {
    return verificaStato(token, this.chiaveFirma());
  }

  private chiaveFirma(): Buffer {
    if (!this.chiave) {
      const raw = process.env.ENCRYPTION_KEY;
      if (!raw) throw new Error('ENCRYPTION_KEY mancante: serve anche per firmare lo state OAuth.');
      this.chiave = chiaveFirmaStato(raw);
    }
    return this.chiave;
  }
}
