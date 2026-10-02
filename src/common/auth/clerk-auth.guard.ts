import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClientiRepository } from '../database/repositories/clienti.repository.js';
import { ClerkJwtVerifier, TokenNonValidoError } from './clerk-jwt.verifier.js';
import { CHIAVE_PUBBLICO, CHIAVE_SOLO_ADMIN, type RichiestaConContesto } from './decorators.js';

// Ruoli Clerk di amministratore dell'organizzazione. Nel token Clerk Core 3
// arriva abbreviato ("admin"); nei webhook e nelle API completo ("org:admin").
const RUOLI_ADMIN = new Set(['admin', 'org:admin']);

// Guard globale: ogni endpoint richiede un token di sessione Clerk
// ("Authorization: Bearer <token>") con un'organizzazione attiva,
// tranne quelli marcati @Pubblico(). Dal token ricava il cliente
// YUMPCODE (tabella clienti, colonna org_id) e lo mette nel contesto
// della richiesta.
//
// Nota: il backend si collega a Supabase come amministratore (bypassa la
// RLS), quindi l'isolamento tra clienti lato backend dipende da qui: ogni
// query deve usare il cliente del contesto, mai un id arrivato dal client.
@Injectable()
export class ClerkAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: ClerkJwtVerifier,
    private readonly clienti: ClientiRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const bersagli = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(CHIAVE_PUBBLICO, bersagli)) return true;

    const req = context.switchToHttp().getRequest<RichiestaConContesto>();
    const intestazione = req.headers.authorization;
    if (!intestazione?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Login richiesto: manca il token di sessione Clerk.');
    }

    let claims;
    try {
      claims = await this.verifier.verifica(intestazione.slice('Bearer '.length).trim());
    } catch (err) {
      if (err instanceof TokenNonValidoError) throw new UnauthorizedException(err.message);
      throw err;
    }

    const orgId = claims.o?.id;
    if (!orgId) {
      throw new ForbiddenException('Nessuna organizzazione attiva: selezionane una nel cruscotto.');
    }

    const cliente = await this.clienti.trovaPerOrgId(orgId);
    if (!cliente) {
      // Succede se il webhook Clerk non ha ancora creato la riga in
      // "clienti" (es. org creata mentre il backend era spento).
      throw new ForbiddenException('Organizzazione non ancora registrata come cliente YUMPCODE.');
    }

    const ruolo = claims.o?.rol ?? '';
    const admin = RUOLI_ADMIN.has(ruolo);
    if (this.reflector.getAllAndOverride<boolean>(CHIAVE_SOLO_ADMIN, bersagli) && !admin) {
      throw new ForbiddenException('Operazione riservata agli amministratori dell\'organizzazione.');
    }

    req.contesto = { userId: claims.sub, orgId, ruolo, admin, cliente };
    return true;
  }
}
