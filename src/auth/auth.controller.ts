import { Controller, Delete, Get, Post, Redirect, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ConnessioniRepository } from '../common/database/repositories/connessioni.repository.js';
import type { Cliente } from '../common/database/repositories/clienti.repository.js';
import { ClienteCorrente, Pubblico, SoloAdmin } from '../common/auth/decorators.js';
import { GoogleAuthGuard } from './google-auth.guard.js';
import { GoogleTokenService } from './google-token.service.js';
import type { GoogleUtenteAutenticato } from './google.strategy.js';
import { StatoOAuthService } from './stato-oauth.service.js';

// Google emette access token con una durata standard di ~3600s. Non
// abbiamo lo expires_in esatto in questo punto del flusso passport,
// quindi usiamo un margine leggermente piu' corto e prudente: se
// sbagliamo per difetto scatta solo un refresh in anticipo, innocuo.
const DURATA_ACCESS_TOKEN_STIMATA_MS = 3500 * 1000;

@Controller('auth/google')
export class AuthController {
  constructor(
    private readonly connessioni: ConnessioniRepository,
    private readonly googleToken: GoogleTokenService,
    private readonly stato: StatoOAuthService,
  ) {}

  // Passo 1 (autenticato, solo admin): il cruscotto chiama questo
  // endpoint con il token Clerk e riceve il link da aprire nel browser.
  // Il link contiene uno state firmato, valido 10 minuti, legato al
  // cliente dell'organizzazione di chi lo chiede.
  @Post('link')
  @SoloAdmin()
  creaLink(@ClienteCorrente() cliente: Cliente, @Req() req: Request) {
    const base = process.env.BACKEND_PUBLIC_URL?.replace(/\/+$/, '') ?? `${req.protocol}://${req.get('host')}`;
    const s = this.stato.firma({ clienteId: cliente.id });
    return { ok: true, url: `${base}/auth/google?s=${encodeURIComponent(s)}` };
  }

  // Passo 2 (pubblico, protetto dallo state firmato): reindirizza il
  // browser su Google. Va aperto come navigazione, non via fetch.
  @Get()
  @Pubblico()
  @UseGuards(GoogleAuthGuard)
  avvia() {
    // Il guard intercetta la richiesta e reindirizza a Google prima che
    // questo corpo venga eseguito.
  }

  // Passo 3 (pubblico): Google torna qui dopo il consenso. La strategy
  // ha gia' verificato lo state firmato e ricavato il cliente.
  // Finito il salvataggio riporta il browser alle impostazioni del cruscotto.
  @Get('callback')
  @Pubblico()
  @UseGuards(GoogleAuthGuard)
  @Redirect()
  async callback(@Req() req: Request) {
    const utente = req.user as GoogleUtenteAutenticato;

    await this.connessioni.salva(utente.clienteId, 'google', {
      accessToken: utente.accessToken,
      refreshToken: utente.refreshToken ?? null,
      scadutaIl: new Date(Date.now() + DURATA_ACCESS_TOKEN_STIMATA_MS),
    });

    return { url: `${urlCruscotto()}/impostazioni?google=collegato`, statusCode: 302 };
  }

  // Stato del collegamento per la schermata impostazioni (tutti i membri).
  @Get('stato')
  async statoCollegamento(@ClienteCorrente() cliente: Cliente) {
    return { ok: true, ...(await this.connessioni.stato(cliente.id, 'google')) };
  }

  // Scollega l'account: cancella i token salvati. Le azioni che usano Google
  // finiranno in "fallita" finche' non lo si ricollega.
  @Delete()
  @SoloAdmin()
  async scollega(@ClienteCorrente() cliente: Cliente) {
    await this.connessioni.elimina(cliente.id, 'google');
    return { ok: true };
  }

  // Diagnostica: conferma che per il cliente di chi chiama esiste un
  // access token Google valido (non lo restituisce mai in chiaro).
  @Get('verifica-token')
  async verificaToken(@ClienteCorrente() cliente: Cliente) {
    await this.googleToken.ottieniAccessTokenValido(cliente.id);
    return { ok: true, messaggio: 'Access token Google valido.' };
  }
}

// Indirizzo del cruscotto a cui tornare dopo il consenso Google:
// CRUSCOTTO_URL se impostata, altrimenti la prima origine di CORS_ORIGINS.
function urlCruscotto(): string {
  const url = process.env.CRUSCOTTO_URL ?? (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',')[0];
  return url.trim().replace(/\/+$/, '');
}
