import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service.js';
import { EncryptionService } from '../../crypto/encryption.service.js';

export interface Connessione {
  id: string;
  cliente_id: string;
  provider: string;
  access_token_cifrato: string;
  refresh_token_cifrato: string | null;
  scaduta_il: string | null;
  created_at: string;
  updated_at: string;
}

export interface TokenConnessione {
  accessToken: string;
  refreshToken: string | null;
  scadutaIl: Date | null;
}

// Repository sulla tabella "connessioni" (Fase 4/5): salva i token OAuth
// dei clienti (uno per cliente+provider), cifrati campo per campo con
// EncryptionService. Mai testo in chiaro sul disco o nei log.
@Injectable()
export class ConnessioniRepository {
  constructor(
    private readonly db: DatabaseService,
    private readonly encryption: EncryptionService,
  ) {}

  // Crea o aggiorna la connessione di un cliente per un provider (es.
  // "google"). Se non arriva un nuovo refresh token (Google lo manda
  // solo al primo consenso) si tiene quello gia' salvato.
  async salva(
    clienteId: string,
    provider: string,
    token: TokenConnessione,
  ): Promise<Connessione> {
    const accessTokenCifrato = this.encryption.encrypt(token.accessToken);
    const refreshTokenCifrato = token.refreshToken
      ? this.encryption.encrypt(token.refreshToken)
      : null;

    const { rows } = await this.db.query<Connessione>(
      `insert into connessioni (cliente_id, provider, access_token_cifrato, refresh_token_cifrato, scaduta_il)
       values ($1, $2, $3, $4, $5)
       on conflict (cliente_id, provider) do update set
         access_token_cifrato = excluded.access_token_cifrato,
         refresh_token_cifrato = coalesce(excluded.refresh_token_cifrato, connessioni.refresh_token_cifrato),
         scaduta_il = excluded.scaduta_il,
         updated_at = now()
       returning *`,
      [clienteId, provider, accessTokenCifrato, refreshTokenCifrato, token.scadutaIl],
    );
    return rows[0];
  }

  // Rilegge una connessione e la decifra, pronta per essere usata per
  // chiamare le API del provider per conto del cliente.
  async trova(clienteId: string, provider: string): Promise<TokenConnessione | null> {
    const { rows } = await this.db.query<Connessione>(
      'select * from connessioni where cliente_id = $1 and provider = $2',
      [clienteId, provider],
    );
    const riga = rows[0];
    if (!riga) return null;
    return {
      accessToken: this.encryption.decrypt(riga.access_token_cifrato),
      refreshToken: riga.refresh_token_cifrato
        ? this.encryption.decrypt(riga.refresh_token_cifrato)
        : null,
      scadutaIl: riga.scaduta_il ? new Date(riga.scaduta_il) : null,
    };
  }

  // Solo "esiste / da quando": nessun token viene letto ne' decifrato.
  async stato(clienteId: string, provider: string): Promise<{ collegato: boolean; aggiornataIl: string | null }> {
    const { rows } = await this.db.query<{ updated_at: string }>(
      'select updated_at from connessioni where cliente_id = $1 and provider = $2',
      [clienteId, provider],
    );
    return { collegato: rows.length > 0, aggiornataIl: rows[0]?.updated_at ?? null };
  }

  async elimina(clienteId: string, provider: string): Promise<void> {
    await this.db.query('delete from connessioni where cliente_id = $1 and provider = $2', [
      clienteId,
      provider,
    ]);
  }
}
