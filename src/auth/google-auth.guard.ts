import { BadRequestException, ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { StatoOAuthService } from './stato-oauth.service.js';

// Estende l'AuthGuard('google') standard per far viaggiare il cliente
// dentro il parametro OAuth "state", che Google restituisce intatto
// sulla callback.
//
// Multi-tenant: l'avvio NON accetta piu' un clienteId in chiaro. Accetta
// solo "?s=<state firmato>", generato da POST /auth/google/link per un
// admin autenticato con Clerk (il link si apre come navigazione del
// browser, che non puo' portare l'header Authorization: per questo il
// login viene verificato prima, quando si genera il link).
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private readonly stato: StatoOAuthService) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const isAvvio = !req.path.endsWith('/callback');
    if (isAvvio) {
      const s = req.query.s;
      if (typeof s !== 'string' || !this.stato.verifica(s)) {
        throw new BadRequestException(
          'Link di collegamento Google non valido o scaduto: generane uno nuovo dal cruscotto.',
        );
      }
    }
    return super.canActivate(context);
  }

  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const s = typeof req.query.s === 'string' ? req.query.s : undefined;
    return s ? { state: s } : {};
  }
}
