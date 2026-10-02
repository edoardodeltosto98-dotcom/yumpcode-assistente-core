import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile, type VerifyCallback } from 'passport-google-oauth20';
import type { Request } from 'express';
import { StatoOAuthService } from './stato-oauth.service.js';

// Permessi richiesti al cliente durante il consenso Google. Punto unico
// da modificare quando l'assistente avra' bisogno di altre API (es.
// Gmail): tenerli al minimo necessario, Google mostra ogni scope
// all'utente nella schermata di consenso.
export const GOOGLE_SCOPES = [
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar',
];

export interface GoogleUtenteAutenticato {
  clienteId: string;
  accessToken: string;
  refreshToken?: string;
  profiloGoogle: {
    id: string;
    email?: string;
    nome?: string;
  };
}

// Strategia Passport per il flusso "Accedi con Google" (Fase 5). Le
// credenziali dell'app (GOOGLE_CLIENT_ID/SECRET) sono quelle di
// YUMPCODE, uniche per tutti i clienti; il cliente specifico che sta
// autorizzando viaggia nel parametro "state" (vedi GoogleAuthGuard),
// non nelle credenziali stesse.
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private readonly stato: StatoOAuthService) {
    const clientID = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientID || !clientSecret) {
      throw new Error(
        'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET mancanti. Vedi assistente-core/.env.example (Fase 5, Google Cloud Console).',
      );
    }

    super({
      clientID,
      clientSecret,
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL ?? 'http://localhost:3001/auth/google/callback',
      scope: GOOGLE_SCOPES,
      passReqToCallback: true,
    });
  }

  // access_type=offline + prompt=consent: senza questi Google manda il
  // refresh token SOLO alla primissima autorizzazione di sempre per
  // quell'utente, e mai piu' nelle successive (anche se revocata e
  // rifatta da capo per errore). Con "consent" lo manda ogni volta.
  authorizationParams(): Record<string, string> {
    return { access_type: 'offline', prompt: 'consent' };
  }

  async validate(
    req: Request,
    accessToken: string,
    refreshToken: string | undefined,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    // Lo state e' il token firmato generato da POST /auth/google/link:
    // lo riverifichiamo qui, perche' la callback e' pubblica e chiunque
    // potrebbe chiamarla con uno state inventato.
    const state = typeof req.query.state === 'string' ? req.query.state : undefined;
    const clienteId = state ? this.stato.verifica(state)?.clienteId : undefined;
    if (!clienteId) {
      done(
        new Error(
          'State OAuth mancante, manomesso o scaduto: ricomincia il collegamento Google dal cruscotto.',
        ),
      );
      return;
    }

    const utente: GoogleUtenteAutenticato = {
      clienteId,
      accessToken,
      refreshToken,
      profiloGoogle: {
        id: profile.id,
        email: profile.emails?.[0]?.value,
        nome: profile.displayName,
      },
    };
    done(null, utente);
  }
}
