import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConnessioniRepository } from '../common/database/repositories/connessioni.repository.js';

// Google emette access token di breve durata (~1h). Rinnoviamo un po'
// prima della scadenza reale per non rischiare una richiesta fallita
// mentre il token sta per spirare.
const MARGINE_SICUREZZA_MS = 60_000;

interface RispostaRefreshGoogle {
  access_token: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
  refresh_token?: string;
}

// Rinnova/serve un access token Google valido per un cliente, usando il
// refresh token salvato in "connessioni" (Fase 5). Nessun altro modulo
// deve chiamare direttamente l'endpoint di refresh di Google: passa da
// qui, cosi' il token aggiornato viene sempre ri-cifrato e persistito.
@Injectable()
export class GoogleTokenService {
  private readonly logger = new Logger(GoogleTokenService.name);

  constructor(private readonly connessioni: ConnessioniRepository) {}

  // Ritorna un access token pronto all'uso per il cliente indicato.
  // Se quello salvato e' scaduto (o mancante di scadenza nota) lo
  // rinnova prima di restituirlo.
  async ottieniAccessTokenValido(clienteId: string): Promise<string> {
    const connessione = await this.connessioni.trova(clienteId, 'google');
    if (!connessione) {
      throw new NotFoundException(
        `Nessuna connessione Google salvata per il cliente ${clienteId}.`,
      );
    }

    const scaduto =
      !connessione.scadutaIl || connessione.scadutaIl.getTime() - MARGINE_SICUREZZA_MS <= Date.now();

    if (!scaduto) {
      return connessione.accessToken;
    }

    if (!connessione.refreshToken) {
      throw new NotFoundException(
        `Access token scaduto e nessun refresh token disponibile per il cliente ${clienteId}: ` +
          'va rifatto il consenso (GET /auth/google?clienteId=...).',
      );
    }

    return this.rinnova(clienteId, connessione.refreshToken);
  }

  // Chiama l'endpoint token di Google con grant_type=refresh_token e
  // salva il nuovo access token (il refresh token resta quello
  // esistente: Google normalmente non ne emette uno nuovo qui).
  private async rinnova(clienteId: string, refreshToken: string): Promise<string> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET mancanti.');
    }

    const risposta = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!risposta.ok) {
      const corpo = await risposta.text();
      this.logger.error(`Refresh token Google fallito per cliente ${clienteId}: ${corpo}`);
      throw new Error(`Impossibile rinnovare il token Google (status ${risposta.status}).`);
    }

    const dati = (await risposta.json()) as RispostaRefreshGoogle;
    const scadutaIl = new Date(Date.now() + dati.expires_in * 1000);

    await this.connessioni.salva(clienteId, 'google', {
      accessToken: dati.access_token,
      // Google in genere non rimanda un nuovo refresh token qui: la
      // salva() esistente tiene quello vecchio se questo e' null.
      refreshToken: dati.refresh_token ?? null,
      scadutaIl,
    });

    this.logger.log(`Access token Google rinnovato per il cliente ${clienteId}.`);
    return dati.access_token;
  }
}
